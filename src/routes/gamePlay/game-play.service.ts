import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { Difficulty as BetDifficulty } from '../../entities/bet.entity';
import { BetService } from '../../modules/bet/bet.service';
import { GameConfigService } from '../../modules/gameConfig/game-config.service';
import { HazardSchedulerService } from '../../modules/hazard/hazard-scheduler.service';
import { RedisService } from '../../modules/redis/redis.service';
import { SingleWalletFunctionsService } from '../single-wallet-functions/single-wallet-functions.service';
import { BetPayloadDto, Difficulty } from './DTO/bet-payload.dto';

interface GameSession {
  userId: string;
  agentId: string;
  currency: string;
  difficulty: Difficulty;
  serverSeed?: string;
  coefficients: string[];
  currentStep: number;
  winAmount: number;
  betAmount: number;
  isActive: boolean;
  isWin: boolean;
  createdAt: Date;
  collisionColumns?: number[];
  platformBetTxId: string;
  roundId: string;
}

export interface BetStepResponse {
  isFinished: boolean;
  coeff: string;
  winAmount: string;
  difficulty: string;
  betAmount: string;
  currency: string;
  lineNumber?: number;
  isWin?: boolean;
  endReason?: string;
  collisionPositions?: string[];
}

type GameConfigPayload = [
  {
    betConfig: Record<string, any>;
    coefficients: Record<string, any>;
    lastWin: { username: string; winAmount: string; currency: string };
  },
];

const GAME_CONSTANTS = {
  TOTAL_COLUMNS: 15,
  HAZARD_REFRESH_MS: 5000,
  DECIMAL_PLACES: 2,
  INITIAL_STEP: -1,
  PLATFORM_NAME: 'SPADE',
  GAME_TYPE: 'SPADE',
  GAME_CODE: 'chicken-road-2',
  GAME_NAME: 'ChickenRoad',
} as const;

const HAZARD_CONFIG = {
  [Difficulty.EASY]: 3,
  [Difficulty.MEDIUM]: 4,
  [Difficulty.HARD]: 5,
  [Difficulty.DAREDEVIL]: 7,
} as const;

const ERROR_MESSAGES = {
  ACTIVE_SESSION_EXISTS: 'active_session_exists',
  VALIDATION_FAILED: 'validation_failed',
  INVALID_BET_AMOUNT: 'invalid_bet_amount',
  AGENT_REJECTED: 'agent_rejected',
  INVALID_DIFFICULTY_CONFIG: 'invalid_difficulty_config',
  NO_ACTIVE_SESSION: 'no_active_session',
  INVALID_STEP_SEQUENCE: 'invalid_step_sequence',
  SETTLEMENT_FAILED: 'settlement_failed',
} as const;

@Injectable()
export class GamePlayService {
  private logger = new Logger(GamePlayService.name);

  private readonly DEFAULT_CONFIG = {
    totalColumns: GAME_CONSTANTS.TOTAL_COLUMNS,
    hazardRefreshMs: GAME_CONSTANTS.HAZARD_REFRESH_MS,
    hazards: HAZARD_CONFIG,
  };

  constructor(
    private readonly gameConfigService: GameConfigService,
    private readonly redisService: RedisService,
    private readonly singleWalletFunctionsService: SingleWalletFunctionsService,
    private readonly betService: BetService,
    private readonly hazardSchedulerService: HazardSchedulerService,
  ) {}

  async performBetFlow(
    userId: string,
    agentId: string,
    gameMode: string,
    incoming: any,
  ): Promise<BetStepResponse | { error: string; details?: any[] }> {
    const redisKey = `gameSession:${userId}-${agentId}`;
    const existingSession: GameSession =
      await this.redisService.get<any>(redisKey);

    if (existingSession && existingSession.isActive) {
      this.logger.warn(
        `User ${userId} attempted to place bet while having active session`,
      );
      return { error: ERROR_MESSAGES.ACTIVE_SESSION_EXISTS };
    }

    const dto = plainToInstance(BetPayloadDto, incoming);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) {
      return {
        error: ERROR_MESSAGES.VALIDATION_FAILED,
        details: errors.map((e) => Object.values(e.constraints || {})),
      };
    }

    const betNumber = parseFloat(dto.betAmount);
    if (!isFinite(betNumber) || betNumber <= 0) {
      return { error: ERROR_MESSAGES.INVALID_BET_AMOUNT };
    }
    const betAmountStr = betNumber.toFixed(GAME_CONSTANTS.DECIMAL_PLACES);

    const difficultyUC = dto.difficulty; // Already uppercase from enum
    const currencyUC = dto.currency.toUpperCase();

    const roundId = `${userId}${Date.now()}`;
    const platformTxId = `${userId}-${agentId}-${uuidv4()}`;

    const agentResult = await this.singleWalletFunctionsService.placeBet(
      agentId,
      userId,
      betNumber,
      roundId,
      platformTxId,
      currencyUC,
    );

    if (agentResult.status !== '0000') {
      return { error: ERROR_MESSAGES.AGENT_REJECTED };
    }

    const {
      status,
      balance,
      balanceTs,
      userId: returnedUserId,
      raw,
    } = agentResult;

    const externalPlatformTxId = platformTxId;

    await this.betService.createPlacement({
      externalPlatformTxId,
      userId,
      roundId,
      difficulty: dto.difficulty as BetDifficulty,
      betAmount: betAmountStr,
      currency: currencyUC,
      platform: GAME_CONSTANTS.PLATFORM_NAME,
      gameType: GAME_CONSTANTS.GAME_TYPE,
      gameCode: GAME_CONSTANTS.GAME_CODE,
      gameName: GAME_CONSTANTS.GAME_NAME,
      isPremium: false,
      betPlacedAt: balanceTs ? new Date(balanceTs) : undefined,
      balanceAfterBet: balance ? String(balance) : undefined,
      createdBy: userId,
    });

    const cfgPayload = await this.getGameConfigPayload();
    const coefficients = cfgPayload[0].coefficients || {};
    const coeffArray: string[] = coefficients[difficultyUC] || [];

    if (!coeffArray || coeffArray.length === 0) {
      this.logger.error(`No coefficients found for difficulty ${difficultyUC}`);
      return { error: ERROR_MESSAGES.INVALID_DIFFICULTY_CONFIG };
    }

    const session: GameSession = {
      userId,
      agentId,
      difficulty: difficultyUC as Difficulty,
      betAmount: betNumber,
      currency: currencyUC,
      currentStep: GAME_CONSTANTS.INITIAL_STEP,
      isActive: true,
      isWin: false,
      winAmount: 0,
      coefficients: coeffArray,
      createdAt: new Date(),
      platformBetTxId: externalPlatformTxId,
      roundId,
    };
    await this.redisService.set(redisKey, session);

    const resp: BetStepResponse = {
      isFinished: false,
      coeff: '0.00',
      winAmount: '0.00',
      difficulty: difficultyUC,
      betAmount: betAmountStr,
      currency: currencyUC,
      lineNumber: GAME_CONSTANTS.INITIAL_STEP,
    };

    this.logger.log(
      `Bet placed user=${userId} agent=${agentId} amount=${betAmountStr} difficulty=${difficultyUC} currency=${currencyUC}`,
    );

    return resp;
  }

  async performStepFlow(
    userId: string,
    agentId: string,
    lineNumber: number,
  ): Promise<BetStepResponse | { error: string }> {
    const redisKey = `gameSession:${userId}-${agentId}`;

    const gameSession: GameSession = await this.redisService.get<any>(redisKey);

    if (!gameSession || !gameSession.isActive) {
      return { error: ERROR_MESSAGES.NO_ACTIVE_SESSION };
    }

    const totalColumns = gameSession.coefficients.length;
    const expected = gameSession.currentStep + 1;

    if (lineNumber !== expected) {
      return { error: ERROR_MESSAGES.INVALID_STEP_SEQUENCE };
    }

    let endReason: 'win' | 'cashout' | 'hazard' | undefined;
    let hazardColumns: number[] = [];

    // Check if final step reached (0-indexed, so last step is totalColumns - 1)
    if (lineNumber === totalColumns - 1) {
      // Final step reached – auto win condition
      gameSession.currentStep = lineNumber;
      gameSession.winAmount =
        gameSession.betAmount *
        Number(gameSession.coefficients[gameSession.currentStep]);

      gameSession.isActive = false;
      gameSession.isWin = true;
      endReason = 'win';
      this.logger.log(`User ${userId} reached the FINAL step and WON`);
    } else {
      // Get active hazard columns from scheduler
      hazardColumns = await this.hazardSchedulerService.getActiveHazards(
        gameSession.difficulty,
      );

      this.logger.log(
        `Step check: user=${userId} line=${lineNumber} difficulty=${gameSession.difficulty} hazards=[${hazardColumns.join(',')}]`,
      );

      const hitHazard = hazardColumns.includes(lineNumber);

      if (!hitHazard) {
        gameSession.currentStep = lineNumber;
        gameSession.winAmount =
          gameSession.betAmount *
          Number(gameSession.coefficients[gameSession.currentStep]);
        this.logger.log(
          `✅ Safe: user=${userId} step=${gameSession.currentStep} win=${gameSession.winAmount}`,
        );
      } else {
        gameSession.isActive = false;
        gameSession.isWin = false;
        gameSession.winAmount = 0;
        gameSession.collisionColumns = hazardColumns;
        gameSession.currentStep = lineNumber;
        endReason = 'hazard';
        this.logger.log(
          `💥 Hazard hit: user=${userId} line=${lineNumber} hazards=[${hazardColumns.join(',')}]`,
        );
      }
    }
    const currentMultiplier =
      gameSession.currentStep >= 0
        ? Number(gameSession.coefficients[gameSession.currentStep])
        : 0;

    // Save session state
    await this.redisService.set(redisKey, gameSession);

    // Handle settlement if game ended
    if (endReason === 'win' || endReason === 'hazard') {
      const finalWinAmount = gameSession.isWin ? gameSession.winAmount : 0;
      const settlementAmount = finalWinAmount - gameSession.betAmount;

      this.logger.log(
        `Settling bet: user=${userId} endReason=${endReason} betAmount=${gameSession.betAmount} winAmount=${finalWinAmount} settlement=${settlementAmount}`,
      );

      try {
        const settleResult = await this.singleWalletFunctionsService.settleBet(
          gameSession.agentId,
          gameSession.platformBetTxId,
          userId,
          settlementAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
          gameSession.roundId,
          gameSession.betAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
        );

        this.logger.log(
          `Settlement success: user=${userId} balance=${settleResult.balance} status=${settleResult.status}`,
        );

        await this.betService.recordSettlement({
          externalPlatformTxId: gameSession.platformBetTxId,
          winAmount: finalWinAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
          settledAt: new Date(),
          balanceAfterSettlement: settleResult.balance
            ? String(settleResult.balance)
            : undefined,
          updatedBy: userId,
        });
      } catch (error) {
        this.logger.error(
          `Settlement failed: user=${userId} txId=${gameSession.platformBetTxId}`,
          error,
        );
      }
    }

    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      gameSession.currency,
      endReason,
      endReason === 'hazard' ? hazardColumns : undefined,
    );
  }

  async performCashOutFlow(
    userId: string,
    agentId: string,
  ): Promise<BetStepResponse | { error: string }> {
    const redisKey = `gameSession:${userId}-${agentId}`;
    const gameSession: GameSession = await this.redisService.get<any>(redisKey);

    if (!gameSession || !gameSession.isActive) {
      return { error: ERROR_MESSAGES.NO_ACTIVE_SESSION };
    }

    gameSession.isActive = false;
    gameSession.isWin = false;

    const currentMultiplier =
      gameSession.currentStep >= 0
        ? Number(gameSession.coefficients[gameSession.currentStep])
        : 0;

    await this.redisService.set(redisKey, gameSession);

    // Handle cashout settlement
    const finalWinAmount = gameSession.winAmount;
    const settlementAmount = finalWinAmount - gameSession.betAmount;

    this.logger.log(
      `Cashout: user=${userId} betAmount=${gameSession.betAmount} winAmount=${finalWinAmount} settlement=${settlementAmount}`,
    );

    try {
      const settleResult = await this.singleWalletFunctionsService.settleBet(
        gameSession.agentId,
        gameSession.platformBetTxId,
        userId,
        settlementAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
        gameSession.roundId,
        gameSession.betAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      );

      this.logger.log(
        `Cashout settlement success: user=${userId} balance=${settleResult.balance}`,
      );

      await this.betService.recordSettlement({
        externalPlatformTxId: gameSession.platformBetTxId,
        winAmount: finalWinAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
        settleType: 'cashout',
        settledAt: new Date(),
        balanceAfterSettlement: settleResult.balance
          ? String(settleResult.balance)
          : undefined,
        updatedBy: userId,
      });
    } catch (error) {
      this.logger.error(
        `Cashout settlement failed: user=${userId} txId=${gameSession.platformBetTxId}`,
        error,
      );
    }

    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      gameSession.currency,
      'cashout',
    );
  }

  async performGetSessionFlow(
    userId: string,
    agentId: string,
  ): Promise<BetStepResponse | { error: string }> {
    const redisKey = `gameSession:${userId}-${agentId}`;
    const gameSession: GameSession = await this.redisService.get<any>(redisKey);

    if (!gameSession) {
      return { error: 'no_session' };
    }

    const currentMultiplier = this.getStepCoeff(
      gameSession,
      gameSession.currentStep,
    );

    let endReason: 'win' | 'cashout' | 'hazard' | undefined;
    if (!gameSession.isActive) {
      if (gameSession.isWin) {
        endReason = 'win';
      } else if (gameSession.collisionColumns) {
        endReason = 'hazard';
      } else {
        endReason = 'cashout';
      }
    }

    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      gameSession.currency,
      endReason,
      gameSession.collisionColumns,
    );
  }

  private getStepCoeff(session: GameSession, stepIndex: number): number {
    if (stepIndex < 0) return 1;
    const arr: string[] = session.coefficients || [];
    const raw = arr[stepIndex];
    const val = parseFloat(raw);
    return isFinite(val) ? val : 1;
  }

  private sendStepResponse(
    isActive: boolean,
    isWin: boolean,
    currentStep: number,
    winAmount: number,
    betAmount: number,
    multiplier: number,
    difficulty: Difficulty,
    currency: string,
    endReason?: 'win' | 'cashout' | 'hazard',
    collisionColumns?: number[],
  ): BetStepResponse {
    return {
      isFinished: !isActive,
      isWin,
      lineNumber: currentStep,
      winAmount: winAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      betAmount: betAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      coeff: multiplier.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      difficulty: String(difficulty),
      currency,
      endReason,
      collisionPositions: collisionColumns?.map(String),
    };
  }

  buildPlaceholder(action: string, payload: any) {
    switch (action) {
      case 'withdraw':
      case 'cashout':
        return {
          action,
          status: 'not_implemented',
          message: `${action} logic not implemented yet`,
        };
      case 'get-game-session':
        return {
          action,
          status: 'not_implemented',
          message: 'Game session retrieval not implemented yet',
          session: null,
          hint: 'Will return current active session details when implemented',
        };
      case 'get-game-seeds':
        return {
          action,
          status: 'not_implemented',
          message: 'Seed list retrieval not implemented',
          seeds: [],
        };
      case 'set-user-seed':
        return {
          action,
          status: 'not_implemented',
          message: 'Setting user seed not implemented',
          received: payload ?? null,
        };
      default:
        return {
          action,
          status: 'not_implemented',
          received: payload ?? null,
        };
    }
  }

  private async safeGetConfig(key: string): Promise<string> {
    try {
      const raw = await this.gameConfigService.getConfig(key);
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch (e) {
      this.logger.warn(`Config key ${key} not available: ${e}`);
      return '{}';
    }
  }

  private tryParseJson(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  async getGameConfigPayload(): Promise<GameConfigPayload> {
    try {
      const betConfigRaw = await this.safeGetConfig('betConfig');
      const coeffRaw = await this.safeGetConfig('coefficients');
      const betConfig = this.tryParseJson(betConfigRaw) || {};
      const coefficients = this.tryParseJson(coeffRaw) || {};
      return [
        {
          betConfig,
          coefficients,
          lastWin: {
            username: 'Salmon Delighted Loon',
            winAmount: '306.00',
            currency: 'USD',
          },
        },
      ];
    } catch (e) {
      this.logger.error(`Failed building game config payload: ${e}`);
      return [
        {
          betConfig: {},
          coefficients: {},
          lastWin: {
            username: 'UNKNOWN',
            winAmount: '0',
            currency: 'INR',
          },
        },
      ];
    }
  }

  /**
   * TEMPORARY: Clear all Redis data and delete all PLACED bets
   * Used for cleanup on WebSocket disconnect during development
   */
  async cleanupOnDisconnect(): Promise<void> {
    try {
      this.logger.warn('[cleanupOnDisconnect] Clearing all Redis data...');
      await this.redisService.flushAll();

      this.logger.warn('[cleanupOnDisconnect] Deleting all PLACED bets...');
      const deletedCount = await this.betService.deletePlacedBets();

      this.logger.warn(
        `[cleanupOnDisconnect] Cleanup complete - Redis flushed, ${deletedCount} PLACED bets deleted`,
      );
    } catch (error) {
      this.logger.error(
        `[cleanupOnDisconnect] Cleanup failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
