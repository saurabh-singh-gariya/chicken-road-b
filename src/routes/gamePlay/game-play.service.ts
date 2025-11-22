import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { Difficulty as BetDifficulty } from '../../entities/bet.entity';
import { BetService } from '../../modules/bet/bet.service';
import { GameConfigService } from '../../modules/gameConfig/game-config.service';
import { HazardSchedulerService } from '../../modules/hazard/hazard-scheduler.service';
import { RedisService } from '../../modules/redis/redis.service';
import {
  WalletErrorService,
} from '../../modules/wallet-error/wallet-error.service';
import {
  WalletApiAction,
  WalletErrorType,
} from '../../entities/wallet-error.entity';
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
  collisionPositions?: number[];
}

type GameConfigPayload =
  {
    betConfig: Record<string, any>;
    coefficients: Record<string, any>;
    lastWin: { username: string; winAmount: string; currency: string };
  }

const GAME_CONSTANTS = {
  TOTAL_COLUMNS: 15,
  HAZARD_REFRESH_MS: 5000,
  DECIMAL_PLACES: 3,
  INITIAL_STEP: -1,
  PLATFORM_NAME: 'In-out',
  GAME_TYPE: 'CRASH',
  GAME_CODE: 'chicken-road-2',
  GAME_NAME: 'chicken-road-2',
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
  SETTLEMENT_FAILED: 'settlement_failed Please contact support',
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
    private readonly walletErrorService: WalletErrorService,
  ) { }

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

    const difficultyUC = dto.difficulty;
    const currencyUC = dto.currency.toUpperCase();

    const roundId = `${userId}${Date.now()}`;
    const platformTxId = `${uuidv4()}`;

    const gamePayloads = await this.gameConfigService.getChickenRoadGamePayloads();

    const agentResult = await this.singleWalletFunctionsService.placeBet(
      agentId,
      userId,
      betNumber,
      roundId,
      platformTxId,
      currencyUC,
      gamePayloads,
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
      platform: gamePayloads.platform,
      gameType: gamePayloads.gameType,
      gameCode: gamePayloads.gameCode,
      gameName: gamePayloads.gameName,
      isPremium: false,
      betPlacedAt: balanceTs ? new Date(balanceTs) : undefined,
      balanceAfterBet: balance ? String(balance) : undefined,
      createdBy: userId,
    });

    const cfgPayload = await this.getGameConfigPayload();
    const coefficients = cfgPayload.coefficients || {};
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
      winAmount: betNumber,
      coefficients: coeffArray,
      createdAt: new Date(),
      platformBetTxId: externalPlatformTxId,
      roundId,
    };
    await this.redisService.set(redisKey, session);

    const resp: BetStepResponse = {
      isFinished: false,
      coeff: '1',
      winAmount: betAmountStr,
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

    const gamePayloads = await this.gameConfigService.getChickenRoadGamePayloads();

    let settlementAmount = 0;
    if (endReason === 'hazard') {
      settlementAmount = 0.00;
    } else if (endReason === 'win') {
      settlementAmount = gameSession.winAmount;
    }
    if (endReason === 'win' || endReason === 'hazard') {
      try {
        const settleResult = await this.singleWalletFunctionsService.settleBet(
          gameSession.agentId,
          gameSession.platformBetTxId,
          userId,
          settlementAmount,
          gameSession.roundId,
          gameSession.betAmount,
          gamePayloads,
          gameSession,
        );

        this.logger.log(
          `Settlement success: user=${userId} balance=${settleResult.balance} status=${settleResult.status}`,
        );

        await this.betService.recordSettlement({
          externalPlatformTxId: gameSession.platformBetTxId,
          winAmount: settlementAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
          settledAt: new Date(),
          balanceAfterSettlement: settleResult.balance
            ? String(settleResult.balance)
            : undefined,
          updatedBy: userId,
        });
      } catch (error: any) {
        this.logger.error(
          `Settlement failed: user=${userId} txId=${gameSession.platformBetTxId}`,
          error,
        );

        // Log error to database (note: error may already be logged in singleWalletFunctionsService,
        // but we log here with game context for better tracking)
        try {
          await this.walletErrorService.createError({
            agentId: gameSession.agentId,
            userId,
            apiAction: WalletApiAction.SETTLE_BET,
            errorType: WalletErrorType.UNKNOWN_ERROR,
            errorMessage: error.message || ERROR_MESSAGES.SETTLEMENT_FAILED,
            errorStack: error.stack,
            platformTxId: gameSession.platformBetTxId,
            roundId: gameSession.roundId,
            betAmount: gameSession.betAmount,
            winAmount: settlementAmount,
            currency: gameSession.currency,
            rawError: JSON.stringify(error),
          });
        } catch (logError) {
          this.logger.error(
            `Failed to log settlement error to database: ${logError}`,
          );
        }

        throw new Error(ERROR_MESSAGES.SETTLEMENT_FAILED);
      }
    }

    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
      gameSession.betAmount,
      endReason === 'hazard' ? 0 : currentMultiplier,
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
    gameSession.isWin = true;

    const currentMultiplier =
      gameSession.currentStep >= 0
        ? Number(gameSession.coefficients[gameSession.currentStep])
        : 0;

    await this.redisService.set(redisKey, gameSession);

    const settlementAmount = gameSession.winAmount;

    this.logger.log(
      `Cashout: user=${userId} betAmount=${gameSession.betAmount} winAmount=${settlementAmount} settlement=${settlementAmount}`,
    );

    const gamePayloads = await this.gameConfigService.getChickenRoadGamePayloads();

    try {
      const settleResult = await this.singleWalletFunctionsService.settleBet(
        gameSession.agentId,
        gameSession.platformBetTxId,
        userId,
        settlementAmount,
        gameSession.roundId,
        gameSession.betAmount,
        gamePayloads,
        gameSession,
      );

      this.logger.log(
        `Cashout settlement success: user=${userId} balance=${settleResult.balance}`,
      );

      await this.betService.recordSettlement({
        externalPlatformTxId: gameSession.platformBetTxId,
        winAmount: settlementAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
        settleType: 'cashout',
        settledAt: new Date(),
        balanceAfterSettlement: settleResult.balance
          ? String(settleResult.balance)
          : undefined,
        updatedBy: userId,
      });
    } catch (error: any) {
      this.logger.error(
        `Cashout settlement failed: user=${userId} txId=${gameSession.platformBetTxId}`,
        error,
      );

      // Log error to database
      try {
        await this.walletErrorService.createError({
          agentId: gameSession.agentId,
          userId,
          apiAction: WalletApiAction.SETTLE_BET,
          errorType: WalletErrorType.UNKNOWN_ERROR,
          errorMessage: error.message || ERROR_MESSAGES.SETTLEMENT_FAILED,
          errorStack: error.stack,
          platformTxId: gameSession.platformBetTxId,
          roundId: gameSession.roundId,
          betAmount: gameSession.betAmount,
          winAmount: settlementAmount,
          currency: gameSession.currency,
          rawError: JSON.stringify(error),
        });
      } catch (logError) {
        this.logger.error(
          `Failed to log cashout settlement error to database: ${logError}`,
        );
      }

      throw new Error(ERROR_MESSAGES.SETTLEMENT_FAILED);
    }

    let hazardColumns = await this.hazardSchedulerService.getActiveHazards(
        gameSession.difficulty,
      );

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
      hazardColumns
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
    const response: BetStepResponse = {
      isFinished: !isActive,
      lineNumber: currentStep,
      winAmount: winAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      betAmount: betAmount.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      coeff: multiplier.toFixed(GAME_CONSTANTS.DECIMAL_PLACES),
      difficulty: String(difficulty),
      currency,
    };

    // For win or cashout: include isWin: true and collisionPositions with final position
    if (endReason && (endReason === 'win' || endReason === 'cashout')) {
      response.isWin = true;
      response.collisionPositions = collisionColumns;
    }
    // For hazard: do NOT include isWin, but include collisionPositions
    else if (endReason && endReason === 'hazard') {
      response.collisionPositions = collisionColumns;
    }
    // For simple step (no endReason): include isWin: false
    else {
      if (collisionColumns) {
        response.collisionPositions = collisionColumns;
      }
    }

    return response;
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

  async getCurrencies(): Promise<any> {
    return {
      "ADA": 2.493846558309699,
      "AED": 3.6725,
      "AFN": 70,
      "ALL": 85.295,
      "AMD": 383.82,
      "ANG": 1.8022999999999998,
      "AOA": 918.65,
      "ARS": 1371.4821,
      "AUD": 1.5559,
      "AWG": 1.79,
      "AZN": 1.7,
      "BAM": 1.7004695059,
      "BBD": 2.0181999999999998,
      "BCH": 0.0020396093727826324,
      "BDT": 122.24999999999999,
      "BGN": 1.712,
      "BHD": 0.377,
      "BIF": 2981,
      "BMD": 1,
      "BNB": 0.0012299246747673688,
      "BND": 1.2974999999999999,
      "BOB": 6.907100000000001,
      "BRL": 5.6015,
      "BSD": 0.9997,
      "BTC": 0.000012050399374548936,
      "BTN": 89.6467799909,
      "BUSD": 0.9996936638705801,
      "BWP": 13.6553,
      "BYN": 3.2712,
      "BZD": 2.0078,
      "CAD": 1.3858,
      "CDF": 2277.4996633416,
      "CHF": 0.8140000000000001,
      "CLF": 0.0238335343,
      "CLP": 972.65,
      "COP": 4186.71,
      "CRC": 505.29,
      "CSC": 33830.23149660104,
      "CUP": 23.990199999999998,
      "CVE": 95.8727355712,
      "CZK": 21.5136,
      "DASH": 0.015423150141854353,
      "DJF": 178.08,
      "DKK": 6.5351,
      "DLS": 33.333333333333336,
      "DOGE": 7.249083135964963,
      "DOP": 61,
      "DZD": 130.923,
      "EGP": 48.57,
      "EOS": 1.2787330681036353,
      "ERN": 15,
      "ETB": 138.20000000000002,
      "ETC": 0.07559846492841533,
      "ETH": 0.00036986204295658424,
      "EUR": 0.8755000000000001,
      "FJD": 2.2723999999999998,
      "FKP": 0.7642057337999999,
      "GBP": 0.7571,
      "GC": 1,
      "GEL": 2.7035,
      "GHS": 10.5,
      "GIP": 0.7642057337999999,
      "GMD": 72.815,
      "GMS": 1,
      "GNF": 8674.5,
      "GTQ": 7.675,
      "GYD": 209.143149197,
      "HKD": 7.849799999999999,
      "HNL": 26.2787,
      "HRK": 6.550767445000001,
      "HTG": 131.16899999999998,
      "HUF": 350.19,
      "IDR": 16443.4,
      "ILS": 3.3960999999999997,
      "INR": 87.503,
      "IQD": 1310,
      "IRR": 42112.5,
      "ISK": 124.46999999999998,
      "JMD": 159.94400000000002,
      "JOD": 0.709,
      "JPY": 150.81,
      "KES": 129.2,
      "KGS": 87.45,
      "KHR": 4015,
      "KMF": 431.5,
      "KPW": 899.9849041373,
      "KRW": 1392.51,
      "KWD": 0.30610000000000004,
      "KYD": 0.8315739408,
      "KZT": 540.8199999999999,
      "LAK": 21580,
      "LBP": 89550,
      "LKR": 302.25,
      "LRD": 181.4831374426,
      "LSL": 18.2179,
      "LTC": 0.01219800670691517,
      "LYD": 5.415,
      "MAD": 9.154300000000001,
      "MDL": 17.08,
      "MGA": 4430,
      "MKD": 52.885000000000005,
      "MMK": 3247.961,
      "MNT": 3590,
      "MOP": 8.089,
      "MRU": 39.626114384800005,
      "MUR": 46.65,
      "MVR": 15.459999999999999,
      "MWK": 1733.67,
      "MXN": 18.869,
      "MYR": 4.265,
      "MZN": 63.910000000000004,
      "NAD": 18.2179,
      "NGN": 1532.39,
      "NIO": 36.75,
      "NOK": 10.3276,
      "NPR": 140.07,
      "NZD": 1.6986,
      "OMR": 0.385,
      "PAB": 1.0009,
      "PEN": 3.569,
      "PGK": 4.1303,
      "PHP": 58.27,
      "PKR": 283.25,
      "PLN": 3.7442,
      "PYG": 7486.400000000001,
      "QAR": 3.6408,
      "R$": 476.1904761904762,
      "RON": 4.440300000000001,
      "RSD": 102.56500000000001,
      "RUB": 79.87530000000001,
      "RWF": 1440,
      "SAR": 3.7513,
      "SBD": 8.2464031996,
      "SC": 1,
      "SCR": 14.1448,
      "SDG": 600.5,
      "SEK": 9.7896,
      "SGD": 1.2979,
      "SHIB": 128205.1282051282,
      "SHP": 0.7642057337999999,
      "SLE": 22.830015851400002,
      "SOL": 0.007978209381592608,
      "SOS": 571.5,
      "SRD": 38.553892635900006,
      "SSP": 130.26,
      "SVC": 8.7464,
      "SYP": 13005,
      "SZL": 18.01,
      "THB": 32.752,
      "TND": 2.88,
      "TON": 0.6662012207757025,
      "TRX": 3.6218917423077635,
      "TRY": 40.6684,
      "TWD": 29.918000000000003,
      "TZS": 2570,
      "UAH": 41.6966,
      "uBTC": 12.050399374548936,
      "UGX": 3583.3,
      "USD": 1,
      "USDC": 0.999303605303536,
      "USDT": 1,
      "UYU": 40.0886,
      "UZS": 12605,
      "VEF": 23922474.033511065,
      "VES": 123.7216,
      "VND": 26199,
      "XAF": 573.151,
      "XLM": 4.4032459143712215,
      "XMR": 0.008457936691358008,
      "XOF": 566.5,
      "XRP": 0.5234373962121788,
      "ZAR": 18.2178,
      "ZEC": 0.0016208628014450959,
      "ZMW": 23.1485244936,
      "ZWL": 26.852999999999998
    };
  }

  async getGameConfigPayload(): Promise<GameConfigPayload> {
    try {
      const betConfigRaw = await this.safeGetConfig('betConfig');
      const coeffRaw = await this.safeGetConfig('coefficients');
      const betConfig = this.tryParseJson(betConfigRaw) || {};
      const coefficients = this.tryParseJson(coeffRaw) || {};
      let newBetConfig = betConfig;
      try {
        const { currency, decimalPlaces, ...rest } = betConfig;
        newBetConfig = rest;
      } catch (e) {
        this.logger.error(`Failed to parse bet config: ${e}`);
      }

      return {
        betConfig: newBetConfig,
        coefficients,
        lastWin: {
          username: 'Salmon Delighted Loon',
          winAmount: '306.00',
          currency: 'USD',
        }
      }
    } catch (e) {
      this.logger.error(`Failed building game config payload: ${e}`);
      return {
        betConfig: {},
        coefficients: {},
        lastWin: {
          username: 'UNKNOWN',
          winAmount: '0',
          currency: 'INR',
        },
      }
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
      // const deletedCount = await this.betService.deletePlacedBets();

      // this.logger.warn(
      //   `[cleanupOnDisconnect] Cleanup complete - Redis flushed, ${deletedCount} PLACED bets deleted`,
      // );
    } catch (error) {
      this.logger.error(
        `[cleanupOnDisconnect] Cleanup failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
