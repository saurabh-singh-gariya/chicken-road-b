import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BetCleanupSchedulerService } from './bet-cleanup-scheduler.service';
import { BetModule } from '../bet/bet.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BetModule,
    RedisModule,
  ],
  providers: [BetCleanupSchedulerService],
  exports: [BetCleanupSchedulerService],
})
export class BetCleanupSchedulerModule {}

