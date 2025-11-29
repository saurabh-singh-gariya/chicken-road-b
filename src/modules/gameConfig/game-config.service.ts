import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from '../../entities/game-config.entity';
import { RedisService } from '../redis/redis.service';
import { DEFAULTS } from '../../config/defaults.config';

@Injectable()
export class GameConfigService {
  private readonly logger = new Logger(GameConfigService.name);

  private readonly defaultGamePayloads = {
    gameType: DEFAULTS.GAME_PAYLOADS.GAME_TYPE,
    gameCode: DEFAULTS.GAME_PAYLOADS.GAME_CODE,
    gameName: DEFAULTS.GAME_PAYLOADS.GAME_NAME,
    platform: DEFAULTS.GAME_PAYLOADS.PLATFORM,
    settleType: DEFAULTS.GAME_PAYLOADS.SETTLE_TYPE,
  } as const;

  constructor(
    @InjectRepository(GameConfig)
    private readonly configRepository: Repository<GameConfig>,
    @Inject(forwardRef(() => RedisService))
    private readonly redisService: RedisService,
  ) { }

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
      secret = DEFAULTS.JWT.DEFAULT_SECRET;
      this.logger.warn('Using env JWT_SECRET (DB entry missing)');
    }
    return secret;
  }

  async getJwtExpires(): Promise<string> {
    try {
      const expiresConfig = await this.getConfig('jwt.expires');
      if (typeof expiresConfig === 'string') {
        return expiresConfig;
      }
      if (expiresConfig && typeof expiresConfig === 'object' && expiresConfig.expiresIn) {
        return expiresConfig.expiresIn;
      }
    } catch (e) {
      const envExpires = process.env.JWT_EXPIRES || process.env.JWT_EXPIRES_IN;
      if (envExpires) {
        this.logger.debug('Using env JWT_EXPIRES (DB entry missing)');
        return envExpires;
      }
      this.logger.debug('Using default JWT_EXPIRES (DB and env missing)');
      return DEFAULTS.JWT.DEFAULT_EXPIRES_IN;
    }
    const envExpires = process.env.JWT_EXPIRES || process.env.JWT_EXPIRES_IN;
    return envExpires || DEFAULTS.JWT.DEFAULT_EXPIRES_IN;
  }

  async getJwtExpiresGeneric(): Promise<string> {
    try {
      const expiresConfig = await this.getConfig('jwt.expires.generic');
      if (typeof expiresConfig === 'string') {
        return expiresConfig;
      }
      if (expiresConfig && typeof expiresConfig === 'object' && expiresConfig.expiresIn) {
        return expiresConfig.expiresIn;
      }
    } catch (e) {
      this.logger.debug('Using user token expiry for generic tokens (DB entry missing)');
      return await this.getJwtExpires();
    }
    return await this.getJwtExpires();
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


  async getChickenRoadGamePayloads(): Promise<any> {
    const redisKey = 'game.payloads';

    try {
      const cachedPayloads = await this.redisService.get(redisKey);
      if (cachedPayloads) {
        this.logger.debug(`Game payloads found in Redis for key: ${redisKey}`);
        return typeof cachedPayloads === 'string' ? JSON.parse(cachedPayloads) : cachedPayloads;
      }

      this.logger.debug(`Game payloads not found in Redis, checking DB...`);
      try {
        const dbConfig = await this.configRepository.findOne({ where: { key: redisKey } });
        if (dbConfig) {
          const dbPayloads = typeof dbConfig.value === 'string'
            ? JSON.parse(dbConfig.value)
            : dbConfig.value;

          await this.redisService.set(redisKey, JSON.stringify(dbPayloads));
          this.logger.log(`Game payloads loaded from DB and cached in Redis for key: ${redisKey}`);
          return dbPayloads;
        }
      } catch (dbError) {
        this.logger.warn(`Failed to get game payloads from DB: ${dbError}`);
      }

      this.logger.warn(`Game payloads not found in DB, using default values`);
      return this.defaultGamePayloads;

    } catch (error) {
      this.logger.error(`Error getting game payloads: ${error}`);
      return this.defaultGamePayloads;
    }
  }

  async getOnlineCounterPumpValue(): Promise<number> {
    try {
      const configValue = await this.getConfig(DEFAULTS.ONLINE_COUNTER.PUMP_VALUE_CONFIG_KEY);
      
      // Handle different value types
      let pumpValue: number;
      if (typeof configValue === 'number') {
        pumpValue = configValue;
      } else if (typeof configValue === 'string') {
        const parsed = Number(configValue);
        if (isFinite(parsed) && !isNaN(parsed)) {
          pumpValue = Math.max(0, Math.floor(parsed)); // Ensure non-negative integer
        } else {
          this.logger.warn(
            `[getOnlineCounterPumpValue] Invalid pump value format: ${configValue}, using default: ${DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE}`,
          );
          return DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE;
        }
      } else {
        this.logger.warn(
          `[getOnlineCounterPumpValue] Invalid pump value type: ${typeof configValue}, using default: ${DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE}`,
        );
        return DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE;
      }

      this.logger.debug(
        `[getOnlineCounterPumpValue] Loaded pump value: ${pumpValue} from config key: ${DEFAULTS.ONLINE_COUNTER.PUMP_VALUE_CONFIG_KEY}`,
      );
      return pumpValue;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.debug(
          `[getOnlineCounterPumpValue] Config not found, using default: ${DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE}`,
        );
      } else {
        this.logger.warn(
          `[getOnlineCounterPumpValue] Error loading pump value: ${error.message}, using default: ${DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE}`,
        );
      }
      return DEFAULTS.ONLINE_COUNTER.DEFAULT_PUMP_VALUE;
    }
  }
}
