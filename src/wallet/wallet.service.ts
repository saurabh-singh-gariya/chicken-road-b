import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/User.entity';
import { Wallet } from '../entities/Wallet.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  private get getCacheKey() {
    return (userId: string) => `wallet:${userId}`;
  }

  async getUserWallet(userId: string): Promise<Wallet | null> {
    try {
      const cacheKey = this.getCacheKey(userId);
      const cachedWallet = await this.redisService.get<Wallet>(cacheKey);
      if (cachedWallet) {
        this.logger.log(`Cache hit for user ${userId}`);
        return cachedWallet;
      }

      const wallet = await this.walletRepository.findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });

      if (!wallet) {
        this.logger.log(`No wallet found for user ${userId}`);
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }

      this.logger.log(`Wallet found for user ${userId}`);
      await this.redisService.set(cacheKey, wallet);
      return wallet;
    } catch (error: any) {
      this.logger.error(
        `Error getting wallet for user ${userId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof NotFoundException) {
        this.logger.warn(`Wallet not found for user ${userId}`);
        throw error;
      }
      throw new Error(`Could not retrieve wallet for user ${userId}`);
    }
  }

  async clearCache(userId: string): Promise<void> {
    const cacheKey = this.getCacheKey(userId);
    this.logger.log(`Clearing cache for user ${userId}`);
    await this.redisService.del(cacheKey);
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateUserWallet(userId);
    return wallet ? wallet.balance : 0;
  }

  /**
   * Returns existing wallet or creates a new one with zero balance.
   * Safe for concurrent calls due to upsert-like retry.
   */
  async getOrCreateUserWallet(userId: string): Promise<Wallet> {
    // Try database
    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (wallet) {
      return wallet;
    }

    // Ensure user exists (we currently authenticate Admins; map admin id to a User row lazily)
    let user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      try {
        // Create a minimal placeholder user. Adjust default fields as domain evolves.
        user = this.userRepository.create({
          id: userId as any, // preserve external supplied id if using same UUID space
          name: `player_${userId.slice(0, 8)}`,
          avatar: 'default.png',
        });
        // If id is auto-generated normally, remove id assignment; here we reuse the uuid from token
        user = await this.userRepository.save(user);
        this.logger.log(`Created placeholder User for id=${userId}`);
      } catch (ue) {
        // If race condition or FK violation; fetch again
        user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
          this.logger.error(`Failed creating placeholder User for ${userId}`);
          throw ue;
        }
      }
    }

    // Create new wallet
    try {
      wallet = this.walletRepository.create({
        user: { id: userId } as any,
        balance: 0,
        lockedAmount: 0,
        currency: 'USD',
      });
      wallet = await this.walletRepository.save(wallet);
      this.logger.log(`Created new wallet for user ${userId}`);
      return wallet;
    } catch (e: any) {
      this.logger.warn(
        `Race condition creating wallet for user ${userId}, retrying fetch. Error: ${e.message}`,
      );
      // Another request may have created it; fetch again
      wallet = await this.walletRepository.findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      if (!wallet) {
        throw new Error(`Failed to create wallet for user ${userId}`);
      }
      return wallet;
    }
  }

  async depositToWallet(userId: string, amount: number): Promise<void> {
    if (amount <= 0) {
      throw new Error('Invalid deposit amount');
    }
    const wallet = await this.getOrCreateUserWallet(userId);

    //wallet balance is string due to decimal type; convert to number
    //then add amount and save
    let balance = parseFloat(wallet.balance.toString());
    balance += amount;
    wallet.balance = balance;

    try {
      await this.walletRepository.save(wallet);
      await this.clearCache(userId);
    } catch (error) {
      this.logger.error(
        `Error depositing to wallet for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Could not deposit to wallet for user ${userId}`);
    }
  }

  async withdrawFromWallet(userId: string, amount: number): Promise<void> {
    if (amount <= 0) {
      throw new Error('Invalid withdrawal amount');
    }
    const wallet = await this.getOrCreateUserWallet(userId);

    if (wallet.balance < amount) {
      throw new Error('Insufficient funds');
    }

    wallet.balance -= amount;
    await this.walletRepository.save(wallet);
    await this.clearCache(userId);
  }
}
