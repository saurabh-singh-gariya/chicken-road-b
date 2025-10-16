import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TransactionHistory } from '../entities/transaction-history.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(TransactionHistory)
    private readonly transactionRepository: Repository<TransactionHistory>,
  ) {}

  async createTransaction(
    transactionData: Partial<TransactionHistory>,
  ): Promise<TransactionHistory> {
    const transaction = this.transactionRepository.create(transactionData);
    await this.transactionRepository.save(transaction);
    this.logger.log(`Transaction created: ${transaction.id}`);
    return transaction;
  }

  async getTransactionById(id: string): Promise<TransactionHistory | null> {
    return this.transactionRepository.findOne({ where: { id } });
  }

  async getUserTransactions(userId: string): Promise<TransactionHistory[]> {
    return this.transactionRepository.find({ where: { userId } });
  }
}
