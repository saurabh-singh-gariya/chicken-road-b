import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Bet, BetStatus, Difficulty } from '../../entities/bet.entity';
import { DEFAULTS } from '../../config/defaults.config';

export interface CreateBetParams {
  externalPlatformTxId: string;
  userId: string;
  roundId: string;
  difficulty: Difficulty;
  betType?: string;
  betAmount: string;
  currency: string;
  platform?: string;
  gameType?: string;
  gameCode?: string;
  gameName?: string;
  isPremium?: boolean;
  betPlacedAt?: Date;
  balanceAfterBet?: string;
  createdBy: string;
  operatorId: string;
}

export interface SettlementParams {
  externalPlatformTxId: string;
  winAmount: string;
  settleType?: string;
  settlementRefTxId?: string;
  settledAt?: Date;
  balanceAfterSettlement?: string;
  gameInfo?: string;
  updatedBy: string;
  finalCoeff?: string;
  withdrawCoeff?: string;
  fairnessData?: {
    decimal: string;
    clientSeed: string;
    serverSeed: string;
    combinedHash: string;
    hashedServerSeed: string;
  };
}

export interface UpdateBetStatusParams {
  externalPlatformTxId: string;
  status: BetStatus;
  updatedBy: string;
}

const ERROR_MESSAGES = {
  BET_EXISTS: 'Bet already exists (idempotent placement)',
  BET_NOT_FOUND: 'Bet not found',
  SETTLEMENT_NOT_FOUND: 'Bet not found for settlement',
} as const;

@Injectable()
export class BetService {
  private readonly logger = new Logger(BetService.name);

  constructor(@InjectRepository(Bet) private readonly repo: Repository<Bet>) { }

  private whereByExternalTx(
    externalPlatformTxId: string,
  ): FindOptionsWhere<Bet> {
    return { externalPlatformTxId };
  }

  async createPlacement(params: CreateBetParams): Promise<Bet> {
    const existing = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (existing) {
      this.logger.warn(
        `Duplicate bet placement attempt: ${params.externalPlatformTxId}`,
      );
      throw new ConflictException(ERROR_MESSAGES.BET_EXISTS);
    }
    const entity = this.repo.create({
      externalPlatformTxId: params.externalPlatformTxId,
      userId: params.userId,
      roundId: params.roundId,
      difficulty: params.difficulty,
      betType: params.betType,
      betAmount: params.betAmount,
      currency: params.currency,
      platform: params.platform,
      gameType: params.gameType,
      gameCode: params.gameCode,
      gameName: params.gameName,
      isPremium: params.isPremium,
      betPlacedAt: params.betPlacedAt,
      balanceAfterBet: params.balanceAfterBet,
      status: BetStatus.PLACED,
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
      operatorId: params.operatorId,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(
      `Bet placed: ${params.externalPlatformTxId} (user: ${params.userId}, amount: ${params.betAmount})`,
    );
    return saved;
  }

  async recordSettlement(params: SettlementParams): Promise<Bet> {
    const bet = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (!bet) {
      this.logger.warn(
        `Settlement failed: bet not found (${params.externalPlatformTxId})`,
      );
      throw new NotFoundException(ERROR_MESSAGES.SETTLEMENT_NOT_FOUND);
    }
    bet.winAmount = params.winAmount;
    bet.settleType = params.settleType;
    bet.settlementRefTxId = params.settlementRefTxId;
    bet.settledAt = params.settledAt ?? new Date();
    bet.balanceAfterSettlement = params.balanceAfterSettlement;
    bet.gameInfo = params.gameInfo;
    bet.finalCoeff = params.finalCoeff;
    bet.withdrawCoeff = params.withdrawCoeff;
    bet.fairnessData = params.fairnessData;

    if (bet.winAmount && Number(bet.winAmount) > 0) {
      bet.status = BetStatus.WON;
    } else {
      bet.status = BetStatus.LOST;
    }

    bet.updatedBy = params.updatedBy;
    const settled = await this.repo.save(bet);
    this.logger.log(
      `Bet settled: ${params.externalPlatformTxId} (status: ${bet.status}, win: ${params.winAmount})`,
    );
    return settled;
  }

  async updateStatus(params: UpdateBetStatusParams): Promise<Bet> {
    const bet = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (!bet) {
      this.logger.warn(
        `Status update failed: bet not found (${params.externalPlatformTxId})`,
      );
      throw new NotFoundException(ERROR_MESSAGES.BET_NOT_FOUND);
    }
    bet.status = params.status;
    bet.updatedBy = params.updatedBy;
    return this.repo.save(bet);
  }

  async markPendingSettlement(
    externalPlatformTxId: string,
    updatedBy: string,
  ): Promise<Bet> {
    return this.updateStatus({
      externalPlatformTxId,
      status: BetStatus.PENDING_SETTLEMENT,
      updatedBy,
    });
  }

  async markSettlementFailed(
    externalPlatformTxId: string,
    updatedBy: string,
  ): Promise<Bet> {
    return this.updateStatus({
      externalPlatformTxId,
      status: BetStatus.SETTLEMENT_FAILED,
      updatedBy,
    });
  }

  async getByExternalTxId(externalPlatformTxId: string): Promise<Bet | null> {
    return this.repo.findOne({
      where: this.whereByExternalTx(externalPlatformTxId),
    });
  }

  async listUserBets(userId: string, limit: number = DEFAULTS.BET.DEFAULT_LIMIT): Promise<Bet[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listUserBetsByTimeRange(userId: string, startTime: Date, endTime: Date, limit: number = DEFAULTS.BET.DEFAULT_LIMIT): Promise<Bet[]> {
    return this.repo.find({
      where: { userId, createdAt: Between(startTime, endTime) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listByRound(roundId: string): Promise<Bet[]> {
    return this.repo.find({ where: { roundId } });
  }

  async deletePlacedBets(): Promise<number> {
    const result = await this.repo.delete({ status: BetStatus.PLACED });
    const count = result.affected || 0;
    if (count > 0) {
      this.logger.log(`Deleted ${count} placed bets`);
    }
    return count;
  }

  /**
   * Find all PLACED bets that are older than the specified time threshold
   * Checks both betPlacedAt and createdAt to handle cases where betPlacedAt might be null
   * @param olderThanMs - Time threshold in milliseconds
   * @returns Array of bets that need to be refunded
   */
  async findOldPlacedBets(olderThanMs: number): Promise<Bet[]> {
    const thresholdDate = new Date(Date.now() - olderThanMs);
    return this.repo
      .createQueryBuilder('bet')
      .where('bet.status = :status', { status: BetStatus.PLACED })
      .andWhere(
        '(bet.betPlacedAt < :threshold OR (bet.betPlacedAt IS NULL AND bet.createdAt < :threshold))',
        { threshold: thresholdDate },
      )
      .getMany();
  }
}
