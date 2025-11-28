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

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const effectiveTTL = ttl ?? (await this.getDefaultTTL());
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

  private async getDefaultTTL(): Promise<number> {
    if (this.configuredTTL !== undefined) {
      return this.configuredTTL;
    }

    try {
      const ttlValue = await this.gameConfigService.getConfig(
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

  async getSessionTTL(): Promise<number> {
    try {
      const ttlValue = await this.gameConfigService.getConfig(
        DEFAULTS.REDIS.SESSION_TTL_CONFIG_KEY,
      );
      const parsed = Number(ttlValue);
      if (isFinite(parsed) && parsed > 0) {
        // Convert milliseconds to seconds for Redis EX command
        const ttlSeconds = Math.ceil(parsed / 1000);
        this.logger.debug(`Using configured session TTL: ${parsed}ms (${ttlSeconds}s)`);
        return ttlSeconds;
      }
    } catch (error) {
      this.logger.debug('Session TTL not configured, using default');
    }

    // Convert default milliseconds to seconds
    const defaultSeconds = Math.ceil(DEFAULTS.REDIS.SESSION_TTL_MS / 1000);
    return defaultSeconds;
  }
}
