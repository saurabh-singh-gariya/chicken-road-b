import { Module, forwardRef } from '@nestjs/common';
import { GameConfigModule } from '../gameConfig/game-config.module';
import { PubSubService } from './pub-sub.service';
import { RedisProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Module({
  imports: [forwardRef(() => GameConfigModule)],
  providers: [
    RedisProvider,
    RedisService,
    PubSubService,
  ],
  exports: [RedisService, PubSubService],
})
export class RedisModule {}
