import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameConfig } from 'src/entities/game-config.entity';
import { GameConfigService } from './game-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameConfig])],
  providers: [GameConfigService],
  exports: [GameConfigService],
})
export class GameConfigModule {}
