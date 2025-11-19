import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WalletError,
  WalletApiAction,
  WalletErrorType,
} from '../../entities/wallet-error.entity';

export interface CreateWalletErrorParams {
  agentId: string;
  userId: string;
  apiAction: WalletApiAction;
  errorType: WalletErrorType;
  errorMessage?: string;
  errorStack?: string;
  requestPayload?: any;
  responseData?: any;
  httpStatus?: number;
  platformTxId?: string;
  roundId?: string;
  betAmount?: number | string;
  winAmount?: number | string;
  currency?: string;
  callbackUrl?: string;
  rawError?: string;
}

export interface UpdateWalletErrorParams {
  resolved?: boolean;
  resolutionNotes?: string;
}

@Injectable()
export class WalletErrorService {
  private readonly logger = new Logger(WalletErrorService.name);

  constructor(
    @InjectRepository(WalletError)
    private readonly repo: Repository<WalletError>,
  ) {}

  async createError(params: CreateWalletErrorParams): Promise<WalletError> {
    try {
      const error = this.repo.create({
        agentId: params.agentId,
        userId: params.userId,
        apiAction: params.apiAction,
        errorType: params.errorType,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack,
        requestPayload: params.requestPayload,
        responseData: params.responseData,
        httpStatus: params.httpStatus,
        platformTxId: params.platformTxId,
        roundId: params.roundId,
        betAmount: params.betAmount ? String(params.betAmount) : undefined,
        winAmount: params.winAmount ? String(params.winAmount) : undefined,
        currency: params.currency,
        callbackUrl: params.callbackUrl,
        rawError: params.rawError,
        resolved: false,
      });

      const saved = await this.repo.save(error);
      this.logger.warn(
        `Wallet error logged: ${params.apiAction} - ${params.errorType} for user ${params.userId} agent ${params.agentId}`,
      );
      return saved;
    } catch (err) {
      this.logger.error(
        `Failed to log wallet error: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  async updateError(
    id: string,
    params: UpdateWalletErrorParams,
  ): Promise<WalletError> {
    const error = await this.repo.findOne({ where: { id } });
    if (!error) {
      throw new Error(`Wallet error with id ${id} not found`);
    }

    if (params.resolved !== undefined) {
      error.resolved = params.resolved;
      if (params.resolved) {
        error.resolvedAt = new Date();
      }
    }

    if (params.resolutionNotes !== undefined) {
      error.resolutionNotes = params.resolutionNotes;
    }

    return this.repo.save(error);
  }

  async findById(id: string): Promise<WalletError | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByUser(
    userId: string,
    agentId?: string,
    limit = 50,
  ): Promise<WalletError[]> {
    const where: any = { userId };
    if (agentId) {
      where.agentId = agentId;
    }
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findByPlatformTxId(
    platformTxId: string,
  ): Promise<WalletError[]> {
    return this.repo.find({
      where: { platformTxId },
      order: { createdAt: 'DESC' },
    });
  }

  async findUnresolved(limit = 100): Promise<WalletError[]> {
    return this.repo.find({
      where: { resolved: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findByAgent(
    agentId: string,
    limit = 100,
  ): Promise<WalletError[]> {
    return this.repo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getErrorStats(
    agentId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    total: number;
    unresolved: number;
    byType: Record<string, number>;
    byAction: Record<string, number>;
  }> {
    const query = this.repo.createQueryBuilder('error');

    if (agentId) {
      query.where('error.agentId = :agentId', { agentId });
    }

    if (startDate) {
      query.andWhere('error.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('error.createdAt <= :endDate', { endDate });
    }

    const total = await query.getCount();

    const unresolved = await query
      .andWhere('error.resolved = :resolved', { resolved: false })
      .getCount();

    const byType = await query
      .select('error.errorType', 'errorType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('error.errorType')
      .getRawMany();

    const byAction = await query
      .select('error.apiAction', 'apiAction')
      .addSelect('COUNT(*)', 'count')
      .groupBy('error.apiAction')
      .getRawMany();

    return {
      total,
      unresolved,
      byType: byType.reduce((acc, row) => {
        acc[row.errorType] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
      byAction: byAction.reduce((acc, row) => {
        acc[row.apiAction] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

