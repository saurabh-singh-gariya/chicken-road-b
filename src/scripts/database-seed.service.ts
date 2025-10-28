import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../entities/game-config.entity';
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
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SEED_DISABLE === 'true') {
      this.logger.log('Seeding skipped (SEED_DISABLE=true).');
      return;
    }
    try {
      await this.seedConfigs();
      await this.seedTestUserAndWallet();
    } catch (e) {
      this.logger.error('Seeding failed', e as any);
    }
  }

  private async seedConfigs() {
    const desired: SeedConfigRow[] = [
      {
        key: 'coefficients',
        value: {
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
          hazards: { EASY: 1, MEDIUM: 2, HARD: 3, DAREDEVIL: 4 },
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
