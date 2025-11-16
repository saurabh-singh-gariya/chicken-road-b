import { Module } from '@nestjs/common';
import { GameConfigModule } from '../gameConfig/game-config.module';
import { RedisProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Module({
  imports: [GameConfigModule],
  providers: [RedisProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
