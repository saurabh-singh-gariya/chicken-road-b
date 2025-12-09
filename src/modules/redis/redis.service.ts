import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { GameConfigService } from '../gameConfig/game-config.service';
import { DEFAULTS } from '../../config/defaults.config';

const REDIS_CONSTANTS = {
  DEFAULT_TTL: DEFAULTS.REDIS.DEFAULT_TTL,
  CONFIG_KEY: DEFAULTS.REDIS.CONFIG_KEY,
} as const;

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private configuredTTL?: number;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    @Inject(forwardRef(() => GameConfigService))
    private readonly gameConfigService: GameConfigService,
  ) {}

  getClient(): Redis {
    return this.redisClient;
  }

  async set(key: string, value: any, ttl?: number, gameCode: string = 'chicken-road-two'): Promise<void> {
    try {
      const effectiveTTL = ttl ?? (await this.getDefaultTTL(gameCode));
      await this.redisClient.set(
        key,
        JSON.stringify(value),
        'EX',
        effectiveTTL,
      );
      this.logger.debug(`Set key: ${key} (TTL: ${effectiveTTL}s)`);
    } catch (error) {
      this.logger.error(`Failed to set key ${key}`, error);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get key ${key}`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
      this.logger.debug(`Deleted key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key}`, error);
      throw error;
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.redisClient.flushall();
      this.logger.warn('All Redis keys flushed');
    } catch (error) {
      this.logger.error('Failed to flush Redis', error);
      throw error;
    }
  }

  private async getDefaultTTL(gameCode: string): Promise<number> {
    if (this.configuredTTL !== undefined) {
      return this.configuredTTL;
    }

    try {
      const ttlValue = await this.gameConfigService.getConfig(
        gameCode,
        REDIS_CONSTANTS.CONFIG_KEY,
      );
      const parsed = Number(ttlValue);
      if (isFinite(parsed) && parsed > 0) {
        this.configuredTTL = parsed;
        this.logger.log(`Using configured Redis TTL: ${parsed}s`);
        return parsed;
      }
    } catch (error) {
      this.logger.debug('Redis TTL not configured, using default');
    }

    this.configuredTTL = REDIS_CONSTANTS.DEFAULT_TTL;
    return REDIS_CONSTANTS.DEFAULT_TTL;
  }

  async getSessionTTL(gameCode: string): Promise<number> {
    try {
      //TODO: Add support for multiple games
      const ttlValue = await this.gameConfigService.getConfig(
        gameCode,
        DEFAULTS.REDIS.SESSION_TTL_CONFIG_KEY,
      );
      const parsed = Number(ttlValue);
      if (isFinite(parsed) && parsed > 0) {
        this.logger.debug(`Using configured session TTL: ${parsed}s`);
        return parsed;
      }
    } catch (error) {
      this.logger.debug('Session TTL not configured, using default');
    }

    return DEFAULTS.REDIS.SESSION_TTL;
  }

  /**
   * Acquire a distributed lock using Redis SETNX
   * @param key - Lock key
   * @param ttlSeconds - Lock expiration time in seconds (default: 10)
   * @returns true if lock acquired, false if already locked
   */
  async acquireLock(key: string, ttlSeconds: number = 10): Promise<boolean> {
    try {
      const result = await this.redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${key}`, error);
      // On error, assume lock not acquired to prevent race conditions
      return false;
    }
  }

  /**
   * Release a distributed lock
   * @param key - Lock key
   */
  async releaseLock(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
      this.logger.debug(`Released lock: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to release lock ${key}`, error);
    }
  }
}
