import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  getClient(): Redis {
    return this.redisClient;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', ttl);
      } else {
        await this.redisClient.set(key, JSON.stringify(value));
      }
      this.logger.log(`Key ${key} set in Redis`);
    } catch (error) {
      this.logger.error(`Failed to set key ${key} in Redis`, error);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redisClient.get(key);
      this.logger.log(`Key ${key} retrieved from Redis`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get key ${key} from Redis`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
      this.logger.log(`Key ${key} deleted from Redis`);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key} from Redis`, error);
      throw error;
    }
  }

  //DELETE ALL THE KEYS IN REDIS
  async flushAll(): Promise<void> {
    try {
      await this.redisClient.flushall();
      this.logger.log(`All keys flushed from Redis`);
    } catch (error) {
      this.logger.error(`Failed to flush all keys from Redis`, error);
      throw error;
    }
  }
}
