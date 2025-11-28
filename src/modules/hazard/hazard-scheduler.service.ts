import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Difficulty } from '../../routes/gamePlay/DTO/bet-payload.dto';
import { GameConfigService } from '../gameConfig/game-config.service';
import { RedisService } from '../redis/redis.service';
import { HazardGeneratorService } from './hazard-generator.service';
import { HazardState } from './interfaces/hazard-state.interface';
import { DEFAULTS } from '../../config/defaults.config';

/**
 * Manages global hazard column rotation across all difficulties
 * Runs periodic scheduler that generates new patterns and broadcasts to Redis
 * Implements current/next pattern system with configurable rotation intervals
 */
@Injectable()
export class HazardSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HazardSchedulerService.name);

  // Timers for each difficulty level
  private timers: Record<string, NodeJS.Timeout> = {};

  // In-memory cache of current states
  private states: Record<string, HazardState> = {};

  // Hardcoded default configuration (used if DB config not available)
  private readonly DEFAULT_CONFIG = {
    totalColumns: DEFAULTS.hazardConfig.totalColumns,
    hazardRefreshMs: DEFAULTS.hazardConfig.hazardRefreshMs,
    hazards: {
      [Difficulty.EASY]: DEFAULTS.hazardConfig.hazards.EASY,
      [Difficulty.MEDIUM]: DEFAULTS.hazardConfig.hazards.MEDIUM,
      [Difficulty.HARD]: DEFAULTS.hazardConfig.hazards.HARD,
      [Difficulty.DAREDEVIL]: DEFAULTS.hazardConfig.hazards.DAREDEVIL,
    },
  };

  // Active configuration (loaded from DB or defaults)
  private totalColumns: number = this.DEFAULT_CONFIG.totalColumns;
  private defaultRefreshMs: number = this.DEFAULT_CONFIG.hazardRefreshMs;
  constructor(
    private readonly redisService: RedisService,
    private readonly gameConfigService: GameConfigService,
    private readonly hazardGenerator: HazardGeneratorService,
  ) {}

  /**
   * Bootstrap hazard system on application startup
   */
  async onModuleInit() {
    await this.loadConfiguration();
    await this.startAllDifficulties();
    this.logger.log('✅ Hazard scheduler started');
  }

  /**
   * Cleanup on shutdown
   */
  onModuleDestroy() {
    this.stopAll();
  }

  /**
   * Load configuration from database/config service
   */
  private async loadConfiguration() {
    try {
      const config = await this.gameConfigService.getConfig('hazardConfig');

      if (config?.totalColumns && typeof config.totalColumns === 'number') {
        this.totalColumns = config.totalColumns;
      }

      if (
        config?.hazardRefreshMs &&
        typeof config.hazardRefreshMs === 'number'
      ) {
        const val = config.hazardRefreshMs;
        if (val >= DEFAULTS.GAME.HAZARD_REFRESH_MIN_MS && val <= DEFAULTS.GAME.HAZARD_REFRESH_MAX_MS) {
          this.defaultRefreshMs = val;
        } else {
          this.logger.warn(
            `⚠️ Invalid hazardRefreshMs: ${val}ms (must be ${DEFAULTS.GAME.HAZARD_REFRESH_MIN_MS}-${DEFAULTS.GAME.HAZARD_REFRESH_MAX_MS}), using default`,
          );
        }
      }
    } catch (error) {
      // Silently use defaults
    }
  }

  /**
   * Get hazard count for a specific difficulty from config
   */
  private async getHazardCount(difficulty: Difficulty): Promise<number> {
    try {
      const config = await this.gameConfigService.getConfig('hazardConfig');
      const count = config?.hazards?.[difficulty];
      if (typeof count === 'number' && count > 0) {
        return count;
      }
    } catch {
      // Fall through to default
    }
    return DEFAULTS.hazardConfig.hazards[difficulty];
  }

  /**
   * Generate Redis key for a difficulty
   */
  private redisKey(difficulty: Difficulty): string {
    return `chicken-road-hazards-${difficulty}`;
  }

  /**
   * Initialize state for a single difficulty level
   */
  private async initializeDifficulty(difficulty: Difficulty) {
    const hazardCount = await this.getHazardCount(difficulty);
    const now = Date.now();
    const changeAt = now + this.defaultRefreshMs;

    // Generate initial current and next patterns
    const current = this.hazardGenerator.generateRandomPattern(
      hazardCount,
      this.totalColumns,
    );
    const next = this.hazardGenerator.generateRandomPattern(
      hazardCount,
      this.totalColumns,
    );

    const state: HazardState = {
      difficulty,
      current,
      next,
      changeAt,
      hazardCount,
      generatedAt: new Date(now).toISOString(),
    };

    // Store in memory
    this.states[difficulty] = state;

    // Store in Redis with TTL slightly longer than refresh interval
    const ttlSeconds = Math.ceil((this.defaultRefreshMs * DEFAULTS.GAME.HAZARD_TTL_MULTIPLIER) / 1000);
    await this.redisService.set(this.redisKey(difficulty), state, ttlSeconds);

    // Optional: Store in history
    await this.addToHistory(difficulty, state);

    // Schedule first rotation
    this.scheduleRotation(difficulty);

    this.logger.log(
      `${difficulty}: [${current.join(',')}] @ ${new Date(now).toISOString()}`,
    );
  }

  /**
   * Start scheduler for all difficulty levels
   */
  private async startAllDifficulties() {
    for (const difficulty of Object.values(Difficulty)) {
      await this.initializeDifficulty(difficulty);
    }
  }

  /**
   * Schedule next rotation for a difficulty
   */
  private scheduleRotation(difficulty: Difficulty) {
    // Clear existing timer if any
    if (this.timers[difficulty]) {
      clearTimeout(this.timers[difficulty]);
    }

    // Schedule rotation
    this.timers[difficulty] = setTimeout(() => {
      this.rotateDifficulty(difficulty).catch((error) => {
        this.logger.error(
          `Error rotating ${difficulty}: ${error.message}`,
          error.stack,
        );
      });
    }, this.defaultRefreshMs);
  }

  /**
   * Perform rotation for a difficulty level
   * Moves 'next' to 'current' and generates new 'next'
   */
  private async rotateDifficulty(difficulty: Difficulty) {
    const hazardCount = await this.getHazardCount(difficulty);
    const now = Date.now();
    const changeAt = now + this.defaultRefreshMs;

    // Get previous state
    const prevState = this.states[difficulty];

    // Move 'next' to 'current', generate new 'next'
    const current =
      prevState?.next ||
      this.hazardGenerator.generateRandomPattern(
        hazardCount,
        this.totalColumns,
      );
    const next = this.hazardGenerator.generateRandomPattern(
      hazardCount,
      this.totalColumns,
    );

    const state: HazardState = {
      difficulty,
      current,
      next,
      changeAt,
      hazardCount,
      generatedAt: new Date(now).toISOString(),
    };

    // Update memory
    this.states[difficulty] = state;

    // Update Redis
    const ttlSeconds = Math.ceil((this.defaultRefreshMs * 1.5) / 1000);
    await this.redisService.set(this.redisKey(difficulty), state, ttlSeconds);

    // Add to history
    await this.addToHistory(difficulty, state);

    // Schedule next rotation
    this.scheduleRotation(difficulty);

    this.logger.log(
      `${difficulty}: [${current.join(',')}] @ ${new Date(now).toISOString()}`,
    );
  }

  /**
   * Add state to history (optional, for audit/debugging)
   */
  private async addToHistory(difficulty: Difficulty, state: HazardState) {
    try {
      const historyKey = `chicken-road-hazards-history-${difficulty}`;
      const client = this.redisService.getClient();
      await client.lpush(historyKey, JSON.stringify(state));
      await client.ltrim(historyKey, 0, DEFAULTS.GAME.HAZARD_HISTORY_LIMIT - 1);
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Stop scheduler for a specific difficulty
   */
  stopDifficulty(difficulty: Difficulty) {
    if (this.timers[difficulty]) {
      clearTimeout(this.timers[difficulty]);
      delete this.timers[difficulty];
    }
  }

  /**
   * Stop all schedulers
   */
  stopAll() {
    for (const difficulty of Object.values(Difficulty)) {
      this.stopDifficulty(difficulty);
    }
  }

  /**
   * Get current state for a difficulty (with auto-recovery)
   */
  async getCurrentState(
    difficulty: Difficulty,
  ): Promise<HazardState | undefined> {
    // Try memory first
    let state = this.states[difficulty];

    // If not in memory, try Redis
    if (!state) {
      const redisState = await this.redisService.get<HazardState>(
        this.redisKey(difficulty),
      );
      if (redisState) {
        state = redisState;
        this.states[difficulty] = state;
      }
    }

    // If state expired (changeAt passed), trigger early rotation
    if (state && Date.now() >= state.changeAt) {
      await this.rotateDifficulty(difficulty);
      state = this.states[difficulty];
    }

    // If still no state, reinitialize
    if (!state) {
      await this.initializeDifficulty(difficulty);
      state = this.states[difficulty];
    }

    return state;
  }

  /**
   * Get active hazard columns for a difficulty
   */
  async getActiveHazards(difficulty: Difficulty): Promise<number[]> {
    const state = await this.getCurrentState(difficulty);
    return this.hazardGenerator.getActivePattern(state);
  }

  /**
   * Check if a column is currently a hazard
   */
  async isHazard(
    difficulty: Difficulty,
    columnIndex: number,
  ): Promise<boolean> {
    const state = await this.getCurrentState(difficulty);
    if (!state) return false;
    return this.hazardGenerator.isColumnHazard(columnIndex, state);
  }

  /**
   * Get all current states (for debugging/admin API)
   */
  async getAllStates(): Promise<Record<string, HazardState | undefined>> {
    const states: Record<string, HazardState | undefined> = {};
    for (const difficulty of Object.values(Difficulty)) {
      states[difficulty] = await this.getCurrentState(difficulty);
    }
    return states;
  }

  /**
   * Force immediate rotation for a difficulty (for testing/admin)
   */
  async forceRotate(difficulty: Difficulty): Promise<HazardState> {
    await this.rotateDifficulty(difficulty);
    return this.states[difficulty];
  }

  /**
   * Update refresh interval and reschedule all timers
   * (Call this if config changes at runtime)
   */
  async updateRefreshInterval(newIntervalMs: number) {
    if (newIntervalMs < DEFAULTS.GAME.HAZARD_REFRESH_MIN_MS || newIntervalMs > DEFAULTS.GAME.HAZARD_REFRESH_MAX_MS) {
      throw new Error(`Refresh interval must be between ${DEFAULTS.GAME.HAZARD_REFRESH_MIN_MS}ms and ${DEFAULTS.GAME.HAZARD_REFRESH_MAX_MS}ms`);
    }

    this.defaultRefreshMs = newIntervalMs;

    // Reschedule all difficulties
    for (const difficulty of Object.values(Difficulty)) {
      this.scheduleRotation(difficulty);
    }
  }
}
