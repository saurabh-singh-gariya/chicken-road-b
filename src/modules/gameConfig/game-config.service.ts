import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) { }

  /**
   * Normalize gameCode for table names
   * Example: 'chicken-road-two' → 'chicken_road_two'
   */
  private normalizeGameCode(gameCode: string): string {
    return gameCode.toLowerCase().replace(/-/g, '_');
  }

  /**
   * Get config from specific game's config table
   */
  private async getConfigFromTable(gameCode: string, key: string): Promise<GameConfig | null> {
    const normalizedGameCode = this.normalizeGameCode(gameCode);
    const tableName = `game_config_${normalizedGameCode}`;

    try {
      const result = await this.dataSource.query(
        `SELECT * FROM \`${tableName}\` WHERE \`key\` = ? LIMIT 1`,
        [key]
      );

      if (!result || result.length === 0) {
        return null;
      }

      return {
        id: result[0].id,
        key: result[0].key,
        value: result[0].value,
        updatedAt: result[0].updatedAt,
      } as GameConfig;
    } catch (error) {
      this.logger.error(`Error getting config from table ${tableName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get config for a specific game
   * @param gameCode - Game code (e.g., 'chicken-road-two')
   * @param key - Config key
   */
  async getConfig(gameCode: string, key: string): Promise<any | undefined> {
    const config = await this.getConfigFromTable(gameCode, key);
    if (!config) {
      this.logger.warn(`Config not found for game: ${gameCode}, key: ${key}`);
      throw new NotFoundException(`Config "${key}" not found for game "${gameCode}".`);
    }
    this.logger.log(`Config for game: ${gameCode}, key: ${key}`);
    return config.value as any;
  }

  /**
   * Get config from old game_config table (for backward compatibility with JWT configs)
   * @deprecated Use getConfig(gameCode, key) for game-specific configs
   */
  async getConfigLegacy(key: string): Promise<any | undefined> {
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
      secret = await this.getConfigLegacy('jwt.secret');
      return secret;
    } catch (e) {
      secret = DEFAULTS.JWT.DEFAULT_SECRET;
      this.logger.warn('Using env JWT_SECRET (DB entry missing)');
    }
    return secret;
  }

  async getJwtExpires(): Promise<string> {
    try {
      const expiresConfig = await this.getConfigLegacy('jwt.expires');
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
    // Use same expiry as regular JWT tokens - no separate config needed
    return await this.getJwtExpires();
  }

  /**
   * Set config for a specific game
   * @param gameCode - Game code (e.g., 'chicken-road-two')
   * @param key - Config key
   * @param value - Config value
   */
  async setConfig(gameCode: string, key: string, value: string): Promise<GameConfig> {
    const normalizedGameCode = this.normalizeGameCode(gameCode);
    const tableName = `game_config_${normalizedGameCode}`;

    try {
      // Check if config exists
      const existing = await this.getConfigFromTable(gameCode, key);

      if (existing) {
        // Update existing config
        await this.dataSource.query(
          `UPDATE \`${tableName}\` SET value = ?, updatedAt = NOW() WHERE \`key\` = ?`,
          [value, key]
        );
        this.logger.log(`Config updated for game: ${gameCode}, key: ${key}`);
        return {
          ...existing,
          value,
          updatedAt: new Date(),
        } as GameConfig;
      } else {
        // Insert new config
        const result = await this.dataSource.query(
          `INSERT INTO \`${tableName}\` (\`key\`, value, updatedAt) VALUES (?, ?, NOW())`,
          [key, value]
        );
        this.logger.log(`Config created for game: ${gameCode}, key: ${key}`);
        return {
          id: result.insertId,
          key,
          value,
          updatedAt: new Date(),
        } as GameConfig;
      }
    } catch (error) {
      this.logger.error(`Error setting config for game ${gameCode}, key ${key}: ${error}`);
      throw error;
    }
  }


  /**
   * Get game payloads for a specific game
   * @param gameCode - Game code (e.g., 'chicken-road-two')
   */
  async getGamePayloads(gameCode: string): Promise<any> {
    const redisKey = `game.payloads.${gameCode}`;

    try {
      const cachedPayloads = await this.redisService.get(redisKey);
      if (cachedPayloads) {
        this.logger.debug(`Game payloads found in Redis for game: ${gameCode}`);
        return typeof cachedPayloads === 'string' ? JSON.parse(cachedPayloads) : cachedPayloads;
      }

      this.logger.debug(`Game payloads not found in Redis, checking DB for game: ${gameCode}...`);
      try {
        const dbConfig = await this.getConfigFromTable(gameCode, 'game.payloads');
        if (dbConfig) {
          const dbPayloads = typeof dbConfig.value === 'string'
            ? JSON.parse(dbConfig.value)
            : dbConfig.value;

          await this.redisService.set(redisKey, JSON.stringify(dbPayloads));
          this.logger.log(`Game payloads loaded from DB and cached in Redis for game: ${gameCode}`);
          return dbPayloads;
        }
      } catch (dbError) {
        this.logger.warn(`Failed to get game payloads from DB for game ${gameCode}: ${dbError}`);
      }

      // Try to get from games table if available
      try {
        const gameResult = await this.dataSource.query(
          `SELECT gameCode, gameName, platform, gameType, settleType FROM games WHERE gameCode = ? AND isActive = 1 LIMIT 1`,
          [gameCode]
        );

        if (gameResult && gameResult.length > 0) {
          const game = gameResult[0];
          const payloads = {
            gameCode: game.gameCode,
            gameName: game.gameName,
            platform: game.platform,
            gameType: game.gameType,
            settleType: game.settleType,
          };
          await this.redisService.set(redisKey, JSON.stringify(payloads));
          this.logger.log(`Game payloads loaded from games table and cached for game: ${gameCode}`);
          return payloads;
        }
      } catch (gameTableError) {
        this.logger.warn(`Failed to get game payloads from games table: ${gameTableError}`);
      }

      this.logger.warn(`Game payloads not found in DB for game ${gameCode}, using default values`);
      return this.defaultGamePayloads;

    } catch (error) {
      this.logger.error(`Error getting game payloads for game ${gameCode}: ${error}`);
      return this.defaultGamePayloads;
    }
  }

  /**
   * @deprecated Use getGamePayloads(gameCode) instead
   * Kept for backward compatibility
   */
  async getChickenRoadGamePayloads(gameCode: string): Promise<any> {
    return this.getGamePayloads(gameCode);
  }
}
