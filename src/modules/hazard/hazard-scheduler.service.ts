import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Difficulty } from '../../routes/gamePlay/DTO/bet-payload.dto';
import { GameConfigService } from '../gameConfig/game-config.service';
import { LeaderElectionService } from '../redis/leader-election.service';
import { PubSubService } from '../redis/pub-sub.service';
import { RedisService } from '../redis/redis.service';
import { HazardGeneratorService } from './hazard-generator.service';
import { HazardState } from './interfaces/hazard-state.interface';
import { DEFAULTS } from '../../config/defaults.config';

/**
 * Manages global hazard column rotation across all difficulties
 * Uses leader election to ensure only one server rotates hazards
 * Implements current/next pattern system with configurable rotation intervals
 * Uses pub/sub for cache invalidation across multiple servers
 */
@Injectable()
export class HazardSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HazardSchedulerService.name);

  // Timers for each difficulty level (only active on leader)
  private timers: Record<string, NodeJS.Timeout> = {};

  // In-memory cache of current states
  private states: Record<string, HazardState> = {};

  // Leader election service instance (created per scheduler)
  private leaderElection: LeaderElectionService;
  private isLeader: boolean = false;

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
  // totalColumns is per-difficulty, matching coefficients array length
  private totalColumns: Record<Difficulty, number> = this.DEFAULT_CONFIG.totalColumns;
  private defaultRefreshMs: number = this.DEFAULT_CONFIG.hazardRefreshMs;
  
  constructor(
    private readonly redisService: RedisService,
    private readonly gameConfigService: GameConfigService,
    private readonly hazardGenerator: HazardGeneratorService,
    private readonly pubSubService: PubSubService,
  ) {
    // Create leader election instance for hazard scheduler with specific service name
    // This allows multiple services to use leader election independently
    this.leaderElection = new LeaderElectionService(
      this.redisService,
      'hazard-scheduler',
    );
  }

  /**
   * Bootstrap hazard system on application startup
   * Attempts to become leader, only leader starts rotation timers
   * All servers listen for rotation notifications
   */
  async onModuleInit() {
    await this.loadConfiguration();
    
    // Try to become leader
    const becameLeader = await this.leaderElection.tryBecomeLeader();
    this.isLeader = becameLeader;

    if (becameLeader) {
      this.logger.log(
        `✅ Hazard scheduler started as LEADER: serverId=${this.leaderElection.getServerId()}`,
      );
      await this.startAllDifficulties();
    } else {
      const currentLeader = await this.leaderElection.getCurrentLeader();
      this.logger.log(
        `✅ Hazard scheduler started as FOLLOWER: serverId=${this.leaderElection.getServerId()} currentLeader=${currentLeader}`,
      );
      // Follower: Load initial state from Redis but don't start timers
      await this.loadInitialStatesFromRedis();
    }

    // All servers (leader and followers) listen for rotation notifications
    await this.setupRotationListener();
    
    this.logger.log(
      `Hazard scheduler initialization complete: isLeader=${this.isLeader} serverId=${this.leaderElection.getServerId()}`,
    );
  }

  /**
   * Cleanup on shutdown
   */
  onModuleDestroy() {
    this.logger.log(
      `Shutting down hazard scheduler: isLeader=${this.isLeader} serverId=${this.leaderElection.getServerId()}`,
    );
    this.stopAll();
    // Leader election service handles its own cleanup
  }

  /**
   * Parse hazard configuration from database
   * Handles both string and object formats safely
   * totalColumns can be single number (legacy) or per-difficulty object
   */
  private async getHazardConfig(): Promise<{
    totalColumns: number | Record<Difficulty, number>;
    hazardRefreshMs: number;
    hazards: Record<Difficulty, number>;
  } | null> {
    try {
      const rawConfig = await this.gameConfigService.getConfig('hazardConfig');
      // Config may be stored as string or already parsed object
      const config =
        typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
      return config;
    } catch (error) {
      this.logger.error(
        `Error parsing hazard configuration: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Load configuration from database/config service
   */
  private async loadConfiguration() {
    const config = await this.getHazardConfig();
    if (config) {
      // Handle both legacy (single number) and new (per-difficulty) formats
      if (typeof config.totalColumns === 'number') {
        // Legacy format: convert single number to per-difficulty object
        this.logger.warn(
          'Legacy totalColumns format detected (single number). Converting to per-difficulty format.',
        );
        this.totalColumns = {
          [Difficulty.EASY]: config.totalColumns,
          [Difficulty.MEDIUM]: config.totalColumns,
          [Difficulty.HARD]: config.totalColumns,
          [Difficulty.DAREDEVIL]: config.totalColumns,
        };
      } else {
        this.totalColumns = config.totalColumns;
      }
      this.defaultRefreshMs = config.hazardRefreshMs;
      this.logger.log(
        `Hazard configuration loaded: totalColumns=${JSON.stringify(this.totalColumns)} defaultRefreshMs=${this.defaultRefreshMs}`,
      );
    } else {
      this.logger.warn(
        'Using default hazard configuration (failed to load from database)',
      );
    }
  }

  /**
   * Get total columns for a specific difficulty
   */
  private getTotalColumns(difficulty: Difficulty): number {
    return this.totalColumns[difficulty] || DEFAULTS.hazardConfig.totalColumns[difficulty];
  }

  /**
   * Get hazard count for a specific difficulty from config
   */
  private async getHazardCount(difficulty: Difficulty): Promise<number> {
    const config = await this.getHazardConfig();
    if (config?.hazards?.[difficulty]) {
      return config.hazards[difficulty];
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

    // Get total columns for this difficulty
    const totalColumns = this.getTotalColumns(difficulty);

    // Generate initial current and next patterns
    const current = this.hazardGenerator.generateRandomPattern(
      hazardCount,
      totalColumns,
    );
    const next = this.hazardGenerator.generateRandomPattern(
      hazardCount,
      totalColumns,
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
   * Only schedules if this server is the leader
   */
  private scheduleRotation(difficulty: Difficulty) {
    // Check if we're still the leader before scheduling
    this.leaderElection.isLeader().then((isLeader) => {
      if (!isLeader) {
        this.logger.debug(
          `${difficulty}: Not leader, skipping rotation schedule. serverId=${this.leaderElection.getServerId()}`,
        );
        this.isLeader = false;
        return;
      }

      this.isLeader = true;

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

      this.logger.debug(
        `${difficulty}: Rotation scheduled in ${this.defaultRefreshMs}ms (leader=${this.isLeader})`,
      );
    });
  }

  /**
   * Perform rotation for a difficulty level
   * Moves 'next' to 'current' and generates new 'next'
   * Only executes if this server is the leader
   */
  private async rotateDifficulty(difficulty: Difficulty) {
    // Double-check we're still the leader before rotating
    const isLeader = await this.leaderElection.isLeader();
    if (!isLeader) {
      this.logger.debug(
        `${difficulty}: No longer leader, skipping rotation. serverId=${this.leaderElection.getServerId()}`,
      );
      this.isLeader = false;
      return;
    }

    this.isLeader = true;

    try {
      const hazardCount = await this.getHazardCount(difficulty);
      const now = Date.now();
      const changeAt = now + this.defaultRefreshMs;

      // Get previous state from Redis (not local cache) to ensure consistency
      const prevStateRedis = await this.redisService.get<HazardState>(
        this.redisKey(difficulty),
      );
      const prevState = prevStateRedis || this.states[difficulty];

      // Get total columns for this difficulty
      const totalColumns = this.getTotalColumns(difficulty);

      // Move 'next' to 'current', generate new 'next'
      const current =
        prevState?.next ||
        this.hazardGenerator.generateRandomPattern(
          hazardCount,
          totalColumns,
        );
      const next = this.hazardGenerator.generateRandomPattern(
        hazardCount,
        totalColumns,
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

      // Update Redis (single source of truth)
      const ttlSeconds = Math.ceil((this.defaultRefreshMs * DEFAULTS.GAME.HAZARD_TTL_MULTIPLIER) / 1000);
      await this.redisService.set(this.redisKey(difficulty), state, ttlSeconds);

      // Notify other servers via pub/sub
      await this.notifyRotation(difficulty, state);

      // Add to history
      await this.addToHistory(difficulty, state);

      // Schedule next rotation
      this.scheduleRotation(difficulty);

      this.logger.log(
        `${difficulty}: Rotated [${current.join(',')}] → next [${next.join(',')}] @ ${new Date(now).toISOString()} serverId=${this.leaderElection.getServerId()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to rotate ${difficulty}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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
      this.logger.debug(
        `${difficulty}: State added to history: current=[${state.current.join(',')}]`,
      );
    } catch (error) {
      // History is optional, log but don't fail rotation
      this.logger.warn(
        `Failed to add ${difficulty} state to history: ${error.message}`,
      );
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
   * Followers read from Redis, only leader can trigger rotation
   */
  async getCurrentState(
    difficulty: Difficulty,
  ): Promise<HazardState | undefined> {
    // Try memory first
    let state = this.states[difficulty];

    // If not in memory or expired, try Redis
    const now = Date.now();
    if (!state || (state.changeAt && now >= state.changeAt)) {
      const redisState = await this.redisService.get<HazardState>(
        this.redisKey(difficulty),
      );
      if (redisState) {
        state = redisState;
        this.states[difficulty] = state;
        this.logger.debug(
          `${difficulty}: State refreshed from Redis: current=[${state.current.join(',')}] next=[${state.next.join(',')}]`,
        );
      }
    }

    // If state expired and we're the leader, trigger rotation
    // Followers wait for leader to rotate and notify
    if (state && now >= state.changeAt) {
      const isLeader = await this.leaderElection.isLeader();
      if (isLeader) {
        this.logger.debug(
          `${difficulty}: State expired, leader triggering rotation`,
        );
        await this.rotateDifficulty(difficulty);
        state = this.states[difficulty];
      } else {
        this.logger.debug(
          `${difficulty}: State expired, but not leader. Waiting for leader rotation.`,
        );
        // Try to refresh from Redis one more time (leader might have rotated)
        const freshState = await this.redisService.get<HazardState>(
          this.redisKey(difficulty),
        );
        if (freshState && freshState.changeAt > state.changeAt) {
          state = freshState;
          this.states[difficulty] = state;
        }
      }
    }

    // If still no state, only leader can initialize
    if (!state) {
      const isLeader = await this.leaderElection.isLeader();
      if (isLeader) {
        this.logger.warn(
          `${difficulty}: No state found, leader initializing`,
        );
        await this.initializeDifficulty(difficulty);
        state = this.states[difficulty];
      } else {
        // Follower: try to get from Redis one more time
        const redisState = await this.redisService.get<HazardState>(
          this.redisKey(difficulty),
        );
        if (redisState) {
          state = redisState;
          this.states[difficulty] = state;
        } else {
          this.logger.warn(
            `${difficulty}: No state found and not leader. Waiting for leader to initialize.`,
          );
        }
      }
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
   * Only works if this server is the leader
   */
  async forceRotate(difficulty: Difficulty): Promise<HazardState> {
    const isLeader = await this.leaderElection.isLeader();
    if (!isLeader) {
      throw new Error(
        `Cannot force rotate: not leader. Current leader: ${await this.leaderElection.getCurrentLeader()}`,
      );
    }
    await this.rotateDifficulty(difficulty);
    return this.states[difficulty];
  }

  /**
   * Setup pub/sub listener for rotation notifications
   * All servers (leader and followers) listen for cache invalidation
   */
  private async setupRotationListener(): Promise<void> {
    try {
      for (const difficulty of Object.values(Difficulty)) {
        const channel = `hazard-rotation-${difficulty}`;
        
        await this.pubSubService.subscribe(channel, (message: string) => {
          try {
            const notification = JSON.parse(message);
            this.logger.debug(
              `Received rotation notification: difficulty=${difficulty} timestamp=${notification.timestamp} serverId=${this.leaderElection.getServerId()}`,
            );

            // Clear local cache to force refresh from Redis
            delete this.states[difficulty];
            this.logger.debug(
              `${difficulty}: Local cache invalidated, will refresh from Redis on next read`,
            );
          } catch (error) {
            this.logger.error(
              `Error processing rotation notification for ${difficulty}: ${error.message}`,
              error.stack,
            );
          }
        });

        this.logger.debug(
          `Subscribed to rotation notifications: channel=${channel}`,
        );
      }

      this.logger.log(
        `Rotation notification listeners setup complete: serverId=${this.leaderElection.getServerId()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to setup rotation listeners: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Notify other servers about rotation via pub/sub
   * Called by leader after successful rotation
   */
  private async notifyRotation(
    difficulty: Difficulty,
    state: HazardState,
  ): Promise<void> {
    try {
      const channel = `hazard-rotation-${difficulty}`;
      const notification = {
        difficulty,
        timestamp: Date.now(),
        changeAt: state.changeAt,
        current: state.current,
        next: state.next,
        serverId: this.leaderElection.getServerId(),
      };

      const subscribers = await this.pubSubService.publish(channel, notification);
      this.logger.debug(
        `Published rotation notification: channel=${channel} subscribers=${subscribers} serverId=${this.leaderElection.getServerId()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish rotation notification for ${difficulty}: ${error.message}`,
        error.stack,
      );
      // Don't throw - rotation succeeded, notification is best-effort
    }
  }

  /**
   * Load initial states from Redis (for followers)
   * Leader initializes fresh, followers load existing state
   */
  private async loadInitialStatesFromRedis(): Promise<void> {
    try {
      for (const difficulty of Object.values(Difficulty)) {
        const state = await this.redisService.get<HazardState>(
          this.redisKey(difficulty),
        );
        if (state) {
          this.states[difficulty] = state;
          this.logger.debug(
            `${difficulty}: Loaded initial state from Redis: current=[${state.current.join(',')}] next=[${state.next.join(',')}]`,
          );
        } else {
          this.logger.warn(
            `${difficulty}: No state found in Redis, waiting for leader to initialize`,
          );
        }
      }
      this.logger.log(
        `Initial states loaded from Redis: serverId=${this.leaderElection.getServerId()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to load initial states from Redis: ${error.message}`,
        error.stack,
      );
    }
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
