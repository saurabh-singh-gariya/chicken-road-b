import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface FairnessSeeds {
  currentServerSeed: string;
  currentServerSeedHash: string;
  nextServerSeed: string;
  nextServerSeedHash: string;
  roundsCount?: number; // number of completed rounds using currentServerSeed
}

interface UserSeedState {
  userSeed: string;
  nonce: number;
}

@Injectable()
export class ProvablyFairService {
  private readonly logger = new Logger(ProvablyFairService.name);
  private SEEDS_KEY = 'fairness:seeds';
  private USER_SEED_PREFIX = 'fairness:user:'; // fairness:user:<userId>
  private ROTATION_INTERVAL = 100; // rotate after this many rounds (configurable)

  constructor(private readonly redis: RedisService) {}

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private generateSeed(): string {
    return randomBytes(8).toString('hex'); // 16 hex chars ~ 64 bits entropy
  }

  async initSeedsIfMissing(): Promise<FairnessSeeds> {
    let seeds = await this.redis.get<FairnessSeeds>(this.SEEDS_KEY);
    if (!seeds) {
      const currentServerSeed = this.generateSeed();
      const nextServerSeed = this.generateSeed();
      seeds = {
        currentServerSeed,
        currentServerSeedHash: this.sha256(currentServerSeed),
        nextServerSeed,
        nextServerSeedHash: this.sha256(nextServerSeed),
        roundsCount: 0,
      };
      await this.redis.set(this.SEEDS_KEY, seeds);
      this.logger.log('Initialized fairness seeds');
    }
    return seeds;
  }

  async rotateServerSeed(): Promise<FairnessSeeds> {
    const seeds = await this.initSeedsIfMissing();
    const currentServerSeed = seeds.nextServerSeed;
    const nextServerSeed = this.generateSeed();
    const updated: FairnessSeeds = {
      currentServerSeed,
      currentServerSeedHash: this.sha256(currentServerSeed),
      nextServerSeed,
      nextServerSeedHash: this.sha256(nextServerSeed),
      roundsCount: 0,
    };
    await this.redis.set(this.SEEDS_KEY, updated);
    this.logger.log('Rotated server seed');
    return updated;
  }

  async getSeeds(): Promise<FairnessSeeds> {
    return this.initSeedsIfMissing();
  }

  async incrementRoundAndRotateIfNeeded(): Promise<FairnessSeeds> {
    const seeds = await this.initSeedsIfMissing();
    seeds.roundsCount = (seeds.roundsCount || 0) + 1;
    await this.redis.set(this.SEEDS_KEY, seeds);
    if ((seeds.roundsCount || 0) >= this.ROTATION_INTERVAL) {
      this.logger.log(
        `Rotation interval reached (${seeds.roundsCount}); rotating server seed.`,
      );
      return this.rotateServerSeed();
    }
    return seeds;
  }

  private userKey(userId: string): string {
    return `${this.USER_SEED_PREFIX}${userId}`;
  }

  async getUserSeedState(userId: string): Promise<UserSeedState> {
    const key = this.userKey(userId);
    let state = await this.redis.get<UserSeedState>(key);
    if (!state) {
      state = { userSeed: this.generateSeed(), nonce: 0 };
      await this.redis.set(key, state);
    }
    return state;
  }

  async setUserSeed(userId: string, userSeed?: string): Promise<UserSeedState> {
    const key = this.userKey(userId);
    const seed =
      userSeed && userSeed.trim().length >= 8
        ? userSeed.trim()
        : this.generateSeed();
    const state: UserSeedState = { userSeed: seed, nonce: 0 }; // reset nonce when seed changes
    await this.redis.set(key, state);
    this.logger.log(`Set user seed for ${userId}`);
    return state;
  }

  async incrementNonce(userId: string): Promise<number> {
    const key = this.userKey(userId);
    const state = await this.getUserSeedState(userId);
    state.nonce += 1;
    await this.redis.set(key, state);
    return state.nonce;
  }
}
