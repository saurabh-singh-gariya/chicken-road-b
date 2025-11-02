import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../entities/game-config.entity';
import { GameHistory } from '../entities/game-history.entity';
import { GameSession } from '../entities/game-session.entity';
import { TransactionHistory } from '../entities/transaction-history.entity';
import { User } from '../entities/User.entity';
import { Wallet } from '../entities/Wallet.entity';

interface SeedConfigRow {
  key: string;
  value: any;
}

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);
  private readonly TARGET_USER_NAME = 'test_player';
  private readonly INITIAL_BALANCE = 1000000.0;

  constructor(
    @InjectRepository(GameConfig)
    private readonly cfgRepo: Repository<GameConfig>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(GameSession)
    private readonly sessionRepo: Repository<GameSession>,
    @InjectRepository(GameHistory)
    private readonly historyRepo: Repository<GameHistory>,
    @InjectRepository(TransactionHistory)
    private readonly txRepo: Repository<TransactionHistory>,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SEED_DISABLE === 'true') {
      this.logger.log('Seeding skipped (SEED_DISABLE=true).');
      return;
    }
    try {
      // Always reset first for deterministic state
      await this.resetData();
      await this.seedConfigs();
      await this.seedTestUserAndWallet();
    } catch (e) {
      this.logger.error('Seeding failed', e as any);
    }
  }

  /**
   * Danger: wipes data from game-related tables to guarantee deterministic seed state.
   * Order matters due to FK constraints.
   */
  private async resetData() {
    this.logger.warn('Resetting database tables before seeding...');
    // Delete in dependency order (children first)
    // Using query builder delete to respect FKs without truncating sequences (ok for dev/testing)
    try {
      await this.txRepo.createQueryBuilder().delete().where('1=1').execute();
      await this.historyRepo
        .createQueryBuilder()
        .delete()
        .where('1=1')
        .execute();
      await this.sessionRepo
        .createQueryBuilder()
        .delete()
        .where('1=1')
        .execute();
      await this.walletRepo
        .createQueryBuilder()
        .delete()
        .where('1=1')
        .execute();
      await this.userRepo.createQueryBuilder().delete().where('1=1').execute();
      await this.cfgRepo.createQueryBuilder().delete().where('1=1').execute();
      this.logger.warn('Database reset complete.');
    } catch (e) {
      this.logger.error('Database reset failed', e as any);
      throw e;
    }
  }

  private async seedConfigs() {
    //add jwt.secret config
    // key is jwt.secret
    // and value is CHANGE_ME_DEV_SECRET but the value stored for this is string and the column type is JSON
    const jwtSecretConfig: SeedConfigRow = {
      key: 'jwt.secret',
      value: {
        secret: 'CHANGE_ME_DEV_SECRET',
      },
    };
    const desired: SeedConfigRow[] = [
      {
        key: 'coefficients',
        value: {
          // Use uppercase keys to align with Difficulty enum and GameService lookups
          EASY: [
            '1.03',
            '1.07',
            '1.12',
            '1.17',
            '1.23',
            '1.29',
            '1.36',
            '1.44',
            '1.53',
            '1.63',
            '1.75',
            '1.88',
            '2.04',
            '2.22',
            '2.45',
            '2.72',
            '3.06',
            '3.50',
            '4.08',
            '4.90',
            '6.13',
            '6.61',
            '9.81',
            '19.44',
          ],
          MEDIUM: [
            '1.12',
            '1.28',
            '1.47',
            '1.70',
            '1.98',
            '2.33',
            '2.76',
            '3.32',
            '4.03',
            '4.96',
            '6.20',
            '6.91',
            '8.90',
            '11.74',
            '15.99',
            '22.61',
            '33.58',
            '53.20',
            '92.17',
            '182.51',
            '451.71',
            '1788.80',
          ],
          HARD: [
            '1.23',
            '1.55',
            '1.98',
            '2.56',
            '3.36',
            '4.49',
            '5.49',
            '7.53',
            '10.56',
            '15.21',
            '22.59',
            '34.79',
            '55.97',
            '94.99',
            '172.42',
            '341.40',
            '760.46',
            '2007.63',
            '6956.47',
            '41321.43',
          ],
          DAREDEVIL: [
            '1.63',
            '2.80',
            '4.95',
            '9.08',
            '15.21',
            '30.12',
            '62.96',
            '140.24',
            '337.19',
            '890.19',
            '2643.89',
            '9161.08',
            '39301.05',
            '233448.29',
            '2542251.93',
          ],
        },
      },
      {
        key: 'betsConfig',
        value: {
          USD: {
            betPresets: ['0.5', '1', '2', '7'],
            minBetAmount: '0.01',
            maxBetAmount: '150.00',
            maxWinAmount: '10000.00',
            defaultBetAmount: '0.600000000000000000',
            decimalPlaces: null,
          },
        },
      },
      {
        key: 'betConfig', // legacy style for existing code paths
        value: {
          minBet: 0.01,
          maxBet: 150.0,
          currency: 'USD',
          precision: 8,
          // Uppercase for consistency with Difficulty enum
          difficulties: ['EASY', 'MEDIUM', 'HARD', 'DAREDEVIL'],
          defaultDifficulty: 'EASY',
        },
      },
      {
        key: 'betsRanges',
        value: { USD: ['0.01', '150.00'] },
      },
      {
        key: 'gameConfig',
        value: {
          totalColumns: 15,
          // Align hazards with hard-coded mapping in GameService (3,4,5,7)
          // Note: GameService currently uses internal difficultyHazards; this is informational only.
          hazards: { EASY: 3, MEDIUM: 4, HARD: 5, DAREDEVIL: 7 },
          supportsDifficulties: ['EASY', 'MEDIUM', 'HARD', 'DAREDEVIL'],
        },
      },
      {
        key: 'fairnessConfig',
        value: {
          rotationInterval: 100,
          hashAlgorithm: 'sha256',
          nonceStart: 0,
        },
      },
      {
        key: jwtSecretConfig.key,
        value: jwtSecretConfig.value,
      },
    ];

    for (const row of desired) {
      const existing = await this.cfgRepo.findOne({ where: { key: row.key } });
      if (!existing) {
        const entity = this.cfgRepo.create({ key: row.key, value: row.value });
        await this.cfgRepo.save(entity);
        this.logger.log(`Inserted config '${row.key}'.`);
      } else {
        this.logger.debug(`Config '${row.key}' already present; skipping.`);
      }
    }
  }

  private async seedTestUserAndWallet() {
    let user = await this.userRepo.findOne({
      where: { name: this.TARGET_USER_NAME },
    });
    if (!user) {
      // default password: test1234
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash('test1234', 10);
      user = this.userRepo.create({
        name: this.TARGET_USER_NAME,
        avatar: 'default.png',
        passwordHash,
      });
      user = await this.userRepo.save(user);
      this.logger.log(
        `Created test user '${this.TARGET_USER_NAME}' id=${user.id}`,
      );
    } else if (!user.passwordHash) {
      const bcrypt = await import('bcrypt');
      user.passwordHash = await bcrypt.hash('test1234', 10);
      await this.userRepo.save(user);
      this.logger.log(
        `Added password hash to existing test user '${this.TARGET_USER_NAME}'`,
      );
    }

    let wallet = await this.walletRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });
    if (!wallet) {
      wallet = this.walletRepo.create({
        user: { id: user.id } as any,
        balance: this.INITIAL_BALANCE,
        lockedAmount: 0,
        currency: 'USD',
      });
      wallet = await this.walletRepo.save(wallet);
      this.logger.log(
        `Created wallet for test user with balance=${this.INITIAL_BALANCE.toFixed(2)}`,
      );
    } else if (wallet.balance !== this.INITIAL_BALANCE) {
      wallet.balance = this.INITIAL_BALANCE;
      await this.walletRepo.save(wallet);
      this.logger.log(
        `Updated wallet balance to ${this.INITIAL_BALANCE.toFixed(2)}`,
      );
    }
  }
}
