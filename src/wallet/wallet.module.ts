import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/User.entity';
import { Wallet } from '../entities/Wallet.entity';
import { RedisModule } from '../redis/redis.module';
import { WalletService } from './wallet.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, User]), RedisModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
