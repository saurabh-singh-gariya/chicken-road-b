import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TransactionType } from '../entities/transaction-history.entity';
import { GameConfigService } from '../gameConfig/game-config.service';
import { RedisService } from '../redis/redis.service';
import { TransactionService } from '../transaction/transaction.service';
import { WalletService } from '../wallet/wallet.service';
import { Difficulty } from './dto/bet-payload.dto';
import { ProvablyFairService } from './provably-fair.service';
import { generateHazardColumns } from './utils/hazards.utils';
import { generateColumnMultipliers } from './utils/multiplier.util';

interface GameSession {
  userId: string;
  difficulty: Difficulty;
  serverSeed: string;
  columnMultipliers: number[];
  currentStep: number;
  winAmount: number;
  betAmount: number;
  isActive: boolean;
  isWin: boolean;
  collisionColumns?: number[];
  payoutProcessed?: boolean;
  betDebited?: boolean;
}

interface StepResponse {
  isFinished: boolean;
  isWin: boolean;
  lineNumber: number;
  winAmount: number;
  betAmount: number;
  coeff: number;
  difficulty: Difficulty;
  endReason?: 'win' | 'cashout' | 'hazard';
  collisionPositions?: number[];
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  private totalColumns = 15;

  private difficultyHazards = {
    [Difficulty.EASY]: 3,
    [Difficulty.MEDIUM]: 4,
    [Difficulty.HARD]: 5,
    [Difficulty.DAREDEVIL]: 7,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly fairService: ProvablyFairService,
    private readonly gameConfigService: GameConfigService,
  ) {}

  private getRedisKey(userId: string): string {
    return `game_session:${userId}`;
  }

  // Deprecated internal seed generator; fairness service manages server seeds.
  private generateLegacyServerSeed(): string {
    return randomBytes(16).toString('hex');
  }

  private sendStepResponse(
    isActive: boolean,
    isWin: boolean,
    currentStep: number,
    winAmount: number,
    betAmount: number,
    multiplier: number,
    difficulty: Difficulty,
    endReason?: 'win' | 'cashout' | 'hazard',
    collisionColumns?: number[],
  ): StepResponse {
    // Ensure winAmount is formatted to 2 decimal places before sending
    const roundedWin = this.round2(winAmount);
    return {
      isFinished: !isActive,
      isWin,
      lineNumber: currentStep,
      winAmount: roundedWin,
      betAmount,
      coeff: multiplier,
      difficulty,
      endReason,
      collisionPositions: collisionColumns,
    };
  }

  private round2(value: number): number {
    // Use toFixed then Number to avoid binary float artifacts in UI and DB logging
    return Number(Number(value).toFixed(2));
  }

  private async recordTransaction(
    userId: string,
    amount: number,
    type: TransactionType,
    balanceAfter: number,
    description: string,
  ) {
    try {
      await this.transactionService.createTransaction({
        userId,
        amount,
        type,
        balanceAfter,
        description,
        currency: 'USD',
        status: 'completed' as any,
      });
    } catch (e) {
      this.logger.error(
        `Failed to create transaction for user ${userId}`,
        e as any,
      );
    }
  }

  private async debitBetIfNeeded(userId: string, session: GameSession) {
    await this.walletService.withdrawFromWallet(userId, session.betAmount);
    const balance = await this.walletService.getBalance(userId);
    await this.recordTransaction(
      userId,
      session.betAmount,
      TransactionType.BET,
      balance,
      'Bet placed',
    );
    session.betDebited = true;
  }

  private async payoutIfNeeded(
    userId: string,
    session: GameSession,
    endReason: 'win' | 'cashout' | 'hazard',
  ) {
    if (session.payoutProcessed) return;
    if (endReason === 'hazard') {
      session.payoutProcessed = true; // nothing to credit, bet already debited
      return;
    }
    // Credit full winAmount (includes original bet).
    await this.walletService.depositToWallet(userId, session.winAmount);
    const balance = await this.walletService.getBalance(userId);
    await this.recordTransaction(
      userId,
      session.winAmount,
      TransactionType.WIN,
      balance,
      endReason === 'win' ? 'Win payout' : 'Cashout payout',
    );
    session.payoutProcessed = true;
  }

  async placeBet(
    userId: string,
    betAmount: number,
    difficulty: Difficulty,
  ): Promise<StepResponse> {
    let columnMultipliers =
      await this.gameConfigService.getConfig('coefficients');
    try {
      const columnMultipliersData = columnMultipliers[difficulty];
      columnMultipliers = columnMultipliersData.map((val: string) =>
        parseFloat(val),
      );
    } catch (e) {
      this.logger.error(
        `Failed to parse column multipliers from config`,
        e as any,
      );
      let finalMultipliers = {
        [Difficulty.EASY]: 19.44,
        [Difficulty.MEDIUM]: 1788.8,
        [Difficulty.HARD]: 41321.43,
        [Difficulty.DAREDEVIL]: 2542251.93,
      };
      columnMultipliers = generateColumnMultipliers(
        finalMultipliers[difficulty],
        this.totalColumns,
      );
    }
    const seeds = await this.fairService.getSeeds();
    const serverSeed = seeds.currentServerSeed;
    await this.fairService.incrementNonce(userId);
    await this.fairService.incrementRoundAndRotateIfNeeded();

    const gameSession: GameSession = {
      userId,
      difficulty,
      serverSeed,
      columnMultipliers,
      currentStep: -1,
      winAmount: this.round2(betAmount),
      betAmount,
      isActive: true,
      isWin: false,
      payoutProcessed: false,
      betDebited: false,
    };

    await this.debitBetIfNeeded(userId, gameSession);
    await this.redisService.set(this.getRedisKey(userId), gameSession);
    this.logger.log(
      `Game started for user ${userId} with difficulty ${difficulty}`,
    );
    const currentMultiplier =
      gameSession.currentStep >= 0
        ? gameSession.columnMultipliers[gameSession.currentStep]
        : 1;

    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
    );
  }

  async step(userId: string, lineNumber: number): Promise<StepResponse | null> {
    const rawSession = await this.redisService.get(this.getRedisKey(userId));
    const gameSession = rawSession as GameSession;

    if (!gameSession || !gameSession.isActive) {
      this.logger.warn(`Invalid game session for user ${userId}`);
      return null;
    }

    if (lineNumber !== gameSession.currentStep + 1) {
      this.logger.error(`Invalid line number for user ${userId}`);
      throw new Error('Invalid Step number');
    }

    let endReason: 'win' | 'cashout' | 'hazard' | undefined;
    let hazardColumns: number[] = [];
    if (lineNumber > 0 && lineNumber == this.totalColumns - 1) {
      // Final step reached – auto win condition
      gameSession.currentStep++;
      gameSession.winAmount = this.round2(
        gameSession.betAmount *
          gameSession.columnMultipliers[gameSession.currentStep],
      );
      gameSession.isActive = false;
      gameSession.isWin = true;
      endReason = 'win';
      this.logger.log(`User ${userId} reached the FINAL step and WON`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const hazardCount = await this.getHazardCountConfig(
        gameSession.difficulty,
      );
      // Increment nonce BEFORE generating hazards for traceable sequence
      await this.fairService.incrementNonce(userId);
      const userState = await this.fairService.getUserSeedState(userId);
      hazardColumns = generateHazardColumns(
        gameSession.serverSeed,
        lineNumber,
        hazardCount,
        this.totalColumns,
        userState.userSeed,
        userState.nonce,
      );

      const hitHazard = hazardColumns.includes(lineNumber);

      if (!hitHazard) {
        gameSession.currentStep++;
        gameSession.winAmount = this.round2(
          gameSession.betAmount *
            gameSession.columnMultipliers[gameSession.currentStep],
        );

        this.logger.log(
          `User ${userId} moved to step ${gameSession.currentStep}`,
        );
      } else {
        gameSession.isActive = false;
        gameSession.isWin = false;
        gameSession.winAmount = 0;
        gameSession.collisionColumns = hazardColumns;
        gameSession.currentStep = lineNumber;
        endReason = 'hazard';
      }
    }
    await this.redisService.set(this.getRedisKey(userId), gameSession);
    if (endReason) {
      await this.payoutIfNeeded(userId, gameSession, endReason);
      await this.redisService.set(this.getRedisKey(userId), gameSession);
    }
    this.logger.log(`Step ${lineNumber} processed for user ${userId}`);
    const currentMultiplier =
      gameSession.currentStep >= 0
        ? gameSession.columnMultipliers[gameSession.currentStep]
        : 0;

    if (endReason === 'hazard') {
      return this.sendStepResponse(
        gameSession.isActive,
        gameSession.isWin,
        gameSession.currentStep,
        this.round2(gameSession.winAmount),
        gameSession.betAmount,
        currentMultiplier,
        gameSession.difficulty,
        endReason,
        hazardColumns,
      );
    }
    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      this.round2(gameSession.winAmount),
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      endReason,
    );
  }

  async cashOut(userId: string): Promise<StepResponse | null> {
    const rawSession = await this.redisService.get(this.getRedisKey(userId));
    const gameSession = rawSession as GameSession;

    if (!gameSession || !gameSession.isActive) {
      this.logger.warn(`Invalid game session for user ${userId}`);
      return null;
    }

    // Increment nonce for cashout randomness accounting (even if not used for RNG now, keeps sequence consistent)
    await this.fairService.incrementNonce(userId);
    gameSession.isActive = false;
    const reachedFinal = gameSession.currentStep === this.totalColumns - 1;
    gameSession.isWin = reachedFinal;
    const endReason: 'cashout' | 'win' = reachedFinal ? 'win' : 'cashout';

    await this.redisService.set(this.getRedisKey(userId), gameSession);
    await this.payoutIfNeeded(userId, gameSession, endReason);
    await this.redisService.set(this.getRedisKey(userId), gameSession);
    this.logger.log(`User ${userId} cashed out`);
    const currentMultiplier =
      gameSession.currentStep >= 0
        ? gameSession.columnMultipliers[gameSession.currentStep]
        : 1;
    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      this.round2(gameSession.winAmount),
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      endReason,
    );
  }

  private async getGameSession(userId: string): Promise<GameSession | null> {
    const rawSession = await this.redisService.get(this.getRedisKey(userId));
    const gameSession = rawSession as GameSession;
    if (!gameSession) {
      this.logger.warn(`No active game session for user ${userId}`);
      return null;
    }
    return gameSession;
  }

  async getActiveSession(userId: string): Promise<StepResponse | null> {
    const gameSession = await this.getGameSession(userId);
    if (!gameSession) {
      this.logger.warn(`No active game session for user ${userId}`);
      return null;
    }
    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      this.round2(gameSession.winAmount),
      gameSession.betAmount,
      gameSession.currentStep >= 0
        ? gameSession.columnMultipliers[gameSession.currentStep]
        : 1,
      gameSession.difficulty,
    );
  }

  private async getHazardCountConfig(difficulty: Difficulty): Promise<number> {
    //get from cache or db
    let gameConfig;
    const cachedGameConfig = (await this.redisService.get('gameConfig')) as any;
    if (cachedGameConfig) {
      try {
        gameConfig = JSON.parse(cachedGameConfig);
      } catch (e) {
        this.logger.error(`Failed to parse cached game config`, e as any);
      }
    }
    if (!gameConfig) {
      gameConfig = await this.gameConfigService.getConfig('gameConfig');
      await this.redisService.set('gameConfig', JSON.stringify(gameConfig));
    }
    try {
      const hazardData = gameConfig.hazards;
      return hazardData[difficulty];
    } catch (e) {
      this.logger.error(`Failed to parse hazard counts from config`, e as any);
      return this.difficultyHazards[difficulty];
    }
  }

  //
  async getGameConfig(): Promise<any> {
    let columnMultipliers;
    try {
      columnMultipliers =
        await this.gameConfigService.getConfig('coefficients');
    } catch (e) {
      this.logger.error(
        `Failed to parse column multipliers from config`,
        e as any,
      );
      let finalMultipliers = {
        [Difficulty.EASY]: 19.44,
        [Difficulty.MEDIUM]: 1788.8,
        [Difficulty.HARD]: 41321.43,
        [Difficulty.DAREDEVIL]: 2542251.93,
      };
      columnMultipliers = {
        EASY: generateColumnMultipliers(
          finalMultipliers[Difficulty.EASY],
          this.totalColumns,
        ),
        MEDIUM: generateColumnMultipliers(
          finalMultipliers[Difficulty.MEDIUM],
          this.totalColumns,
        ),
        HARD: generateColumnMultipliers(
          finalMultipliers[Difficulty.HARD],
          this.totalColumns,
        ),
        DAREDEVIL: generateColumnMultipliers(
          finalMultipliers[Difficulty.DAREDEVIL],
          this.totalColumns,
        ),
      };
    } finally {
      return {
        coefficients: columnMultipliers,
      };
    }
  }
}
