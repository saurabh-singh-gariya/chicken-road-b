import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionHistory } from '../entities/transaction-history.entity';
import { TransactionService } from './transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionHistory])],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
