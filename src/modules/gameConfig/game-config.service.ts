import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../../entities/game-config.entity';

@Injectable()
export class GameConfigService {
  private readonly logger = new Logger(GameConfigService.name);

  constructor(
    @InjectRepository(GameConfig)
    private readonly configRepository: Repository<GameConfig>,
  ) {}

  async getConfig(key: string): Promise<any | undefined> {
    const config = await this.configRepository.findOne({ where: { key } });
    if (!config) {
      this.logger.warn(`Config not fount for :${key}`);
      throw new NotFoundException(`Config "${key}" not found.`);
    }
    this.logger.log(`Config for key: ${key}`);
    return config.value as any;
  }

  async getJwtSecret(): Promise<string> {
    const now = Date.now();

    let secret: any;
    try {
      let secretJson = await this.getConfig('jwt.secret');
      secret = secretJson.secret;
    } catch (e) {
      secret = 'CHANGE_ME_DEV_SECRET';
      this.logger.warn('Using env JWT_SECRET (DB entry missing)');
    }
    return secret;
  }

  async setConfig(key: string, value: string): Promise<GameConfig> {
    let config = await this.configRepository.findOne({ where: { key } });
    if (config) {
      config.value = value;
    } else {
      config = this.configRepository.create({ key, value });
    }
    await this.configRepository.save(config);
    this.logger.log(`Config set for key: ${key}`);
    return config;
  }
}
