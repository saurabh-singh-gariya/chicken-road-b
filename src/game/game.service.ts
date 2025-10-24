import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TransactionType } from '../entities/transaction-history.entity';
import { RedisService } from '../redis/redis.service';
import { TransactionService } from '../transaction/transaction.service';
import { WalletService } from '../wallet/wallet.service';
import { Difficulty } from './dto/bet-payload.dto';
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
  isActive: boolean;
  isWin: boolean;
  currentStep: number;
  winAmount: number;
  betAmount: number;
  multiplier: number;
  difficulty: Difficulty;
  profit: number; // winAmount - betAmount
  endReason?: 'win' | 'cashout' | 'hazard';
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  private totalColumns = 15;
  private difficultyHazards = {
    [Difficulty.EASY]: 1,
    [Difficulty.MEDIUM]: 2,
    [Difficulty.HARD]: 3,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  private getRedisKey(userId: string): string {
    return `game_session:${userId}`;
  }

  private generateServerSeed(): string {
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
  ): StepResponse {
    return {
      isActive,
      isWin,
      currentStep,
      winAmount,
      betAmount,
      multiplier,
      difficulty,
      profit: winAmount - betAmount,
      endReason,
    };
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
    if (session.betDebited) return;
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
    const columnMultipliers = generateColumnMultipliers(
      20.5,
      this.totalColumns,
    );

    const serverSeed = this.generateServerSeed();

    const gameSession: GameSession = {
      userId,
      difficulty,
      serverSeed,
      columnMultipliers,
      currentStep: -1,
      winAmount: betAmount,
      betAmount,
      isActive: true,
      isWin: false,
      payoutProcessed: false,
      betDebited: false,
    };

    await this.redisService.set(this.getRedisKey(userId), gameSession);
    // Debit bet upfront
    await this.debitBetIfNeeded(userId, gameSession);
    await this.redisService.set(this.getRedisKey(userId), gameSession);
    this.logger.log(
      `Game started for user ${userId} with difficulty ${difficulty}`,
    );
    const currentMultiplier =
      gameSession.currentStep >= 0
        ? gameSession.columnMultipliers[gameSession.currentStep]
        : 1; // No step taken yet
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
    if (lineNumber > 0 && lineNumber == this.totalColumns - 1) {
      // Final step reached – auto win condition
      gameSession.currentStep++;
      gameSession.winAmount *=
        gameSession.columnMultipliers[gameSession.currentStep];
      gameSession.isActive = false;
      gameSession.isWin = true;
      endReason = 'win';
      this.logger.log(`User ${userId} reached the FINAL step and WON`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const hazardCount = this.difficultyHazards[gameSession.difficulty];
      const hazardColumns = generateHazardColumns(
        gameSession.serverSeed,
        lineNumber,
        hazardCount,
        this.totalColumns,
      );

      const hitHazard = hazardColumns.includes(lineNumber);

      if (!hitHazard) {
        gameSession.currentStep++;
        gameSession.winAmount *=
          gameSession.columnMultipliers[gameSession.currentStep];

        this.logger.log(
          `User ${userId} moved to step ${gameSession.currentStep}`,
        );
      } else {
        gameSession.isActive = false;
        gameSession.isWin = false;
        gameSession.winAmount = 0;
        gameSession.collisionColumns = hazardColumns;
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
        : 0; // If still -1 (shouldn't happen after a valid step), treat as 0 multiplier
    return this.sendStepResponse(
      gameSession.isActive,
      gameSession.isWin,
      gameSession.currentStep,
      gameSession.winAmount,
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
      gameSession.winAmount,
      gameSession.betAmount,
      currentMultiplier,
      gameSession.difficulty,
      endReason,
    );
  }
}
