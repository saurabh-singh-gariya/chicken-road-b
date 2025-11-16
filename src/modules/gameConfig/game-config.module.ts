import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameConfig } from '../../entities/game-config.entity';
import { GameConfigSeeder } from '../../scripts/game-config.seeder';
import { GameConfigService } from './game-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameConfig])],
  providers: [GameConfigService, GameConfigSeeder],
  exports: [GameConfigService],
})
export class GameConfigModule {}
