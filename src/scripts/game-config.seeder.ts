import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../entities/game-config.entity';

@Injectable()
export class GameConfigSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameConfigSeeder.name);

  constructor(
    @InjectRepository(GameConfig)
    private readonly repo: Repository<GameConfig>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    await this.ensure(
      'betConfig',
      JSON.stringify({
        minBetAmount: '0.01',
        maxBetAmount: '150.00',
        maxWinAmount: '10000.00',
        defaultBetAmount: '0.600000000000000000',
        betPresets: ['0.5', '1', '2', '7'],
        decimalPlaces: '2',
        currency: 'INR',
      }),
    );

    await this.ensure(
      'coefficients',
      JSON.stringify({
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
      }),
    );

    this.logger.log('GameConfig seed completed');
  }

  private async ensure(key: string, value: string) {
    const existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      this.logger.debug(
        `Config key "${key}" already present (id=${existing.id})`,
      );
      return existing;
    }
    const created = this.repo.create({ key, value });
    await this.repo.save(created);
    this.logger.log(`Inserted config key "${key}"`);
    return created;
  }
}
