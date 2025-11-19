import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletError } from '../../entities/wallet-error.entity';
import { WalletErrorService } from './wallet-error.service';

@Module({
  imports: [TypeOrmModule.forFeature([WalletError])],
  providers: [WalletErrorService],
  exports: [WalletErrorService],
})
export class WalletErrorModule {}

