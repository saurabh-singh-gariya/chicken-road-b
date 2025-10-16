import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import Redis from 'ioredis';

const logger = new Logger('RedisProvider');

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: (configService: ConfigService) => {
    interface RedisConfig {
      host: string;
      port: number;
      password: string;
    }
    const redisConfig = configService.get<RedisConfig>('redis');
    const client = new Redis({
      host: redisConfig?.host,
      port: redisConfig?.port,
      password: redisConfig?.password,
    });
    logger.log('Redis client connected!!');
    return client;
  },
  inject: [ConfigService],
};
