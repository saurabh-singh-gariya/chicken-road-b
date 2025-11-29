import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../entities/game-config.entity';
import { Difficulty } from '../routes/gamePlay/DTO/bet-payload.dto';
import { DEFAULTS } from 'src/config/defaults.config';

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
        minBetAmount: '1',
        maxBetAmount: '16400.00',
        maxWinAmount: '820000.00',
        defaultBetAmount: '55.000000000000000000',
        betPresets: ['20', '50', '100', '500'],
        decimalPlaces: '2',
        currency: 'INR',
      }),
    );

    await this.ensure(
      'coefficients',
      JSON.stringify(DEFAULTS.coefficients),
    );

    await this.ensure(
      'hazardConfig',
      JSON.stringify({
        totalColumns: DEFAULTS.hazardConfig.totalColumns,
        hazardRefreshMs: DEFAULTS.hazardConfig.hazardRefreshMs,
        hazards: {
          [Difficulty.EASY]: DEFAULTS.hazardConfig.hazards.EASY,
          [Difficulty.MEDIUM]: DEFAULTS.hazardConfig.hazards.MEDIUM,
          [Difficulty.HARD]: DEFAULTS.hazardConfig.hazards.HARD,
          [Difficulty.DAREDEVIL]: DEFAULTS.hazardConfig.hazards.DAREDEVIL,
        },
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
