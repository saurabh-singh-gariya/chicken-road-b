import { Module } from '@nestjs/common';
import { RefundSchedulerService } from './refund-scheduler.service';
import { BetModule } from '../bet/bet.module';
import { RedisModule } from '../redis/redis.module';
import { SingleWalletFunctionsModule } from '../../routes/single-wallet-functions/single-wallet-functions.module';

@Module({
  imports: [BetModule, RedisModule, SingleWalletFunctionsModule],
  providers: [RefundSchedulerService],
  exports: [RefundSchedulerService],
})
export class RefundSchedulerModule {}

