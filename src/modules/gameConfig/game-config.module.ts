import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameConfig } from '../../entities/game-config.entity';
import { GameConfigSeeder } from '../../scripts/game-config.seeder';
import { GameConfigService } from './game-config.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([GameConfig]), forwardRef(() => RedisModule)],
  providers: [GameConfigService, GameConfigSeeder],
  exports: [GameConfigService],
})
export class GameConfigModule {}
