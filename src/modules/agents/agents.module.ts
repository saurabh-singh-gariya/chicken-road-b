import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agents } from '../../entities/agents.entity';

import { AgentsService } from './agents.service';
import { GameModule } from '../games/game.module';

@Module({
  imports: [TypeOrmModule.forFeature([Agents]), GameModule],
  providers: [AgentsService],
  exports: [AgentsService], 
})
export class AgentsModule {}
