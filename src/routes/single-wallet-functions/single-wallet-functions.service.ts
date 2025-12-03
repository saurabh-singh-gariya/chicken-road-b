import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AgentsService } from '../../modules/agents/agents.service';
import { GameConfigService } from '../../modules/gameConfig/game-config.service';
import {
  WalletErrorService,
} from '../../modules/wallet-error/wallet-error.service';
import {
  WalletApiAction,
  WalletErrorType,
} from '../../entities/wallet-error.entity';
import { DEFAULTS } from '../../config/defaults.config';

@Injectable()
export class SingleWalletFunctionsService {

  private readonly logger = new Logger(SingleWalletFunctionsService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly http: HttpService,
    private readonly gameConfigService: GameConfigService,
    private readonly walletErrorService: WalletErrorService,
  ) { }

  private async resolveAgent(agentId: string) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent '${agentId}' not found`);
    }
    return {
      callbackURL: agent.callbackURL,
      cert: agent.cert,
      agentId: agent.agentId,
    };
  }

  /**
   * Retry helper for external API calls with exponential backoff
   * Retries on transient errors (network, timeout, 5xx) but not on business logic errors (4xx)
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    operationName: string = 'operation',
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on business logic errors (4xx) or agent rejections
        if (error.response?.status >= 400 && error.response?.status < 500) {
          this.logger.debug(
            `Non-retryable error (${error.response.status}) for ${operationName}, attempt ${attempt + 1}`,
          );
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Calculate exponential backoff delay
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        this.logger.warn(
          `Retrying ${operationName} after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    
    // All retries exhausted
    this.logger.error(
      `${operationName} failed after ${maxRetries + 1} attempts`,
    );
    throw lastError;
  }

  // Unified agent response interface
  private mapAgentResponse(data: any) {
    if (!data || typeof data.status !== 'string') {
      throw new InternalServerErrorException('Malformed agent response');
    }
    return {
      balance: Number(data.balance ?? 0),
      balanceTs: data.balanceTs ?? null,
      status: data.status,
      userId: data.userId ?? null,
      raw: data,
    } as const;
  }

  async getBalance(
    agentId: string,
    userId: string,
  ): Promise<{
    balance: number;
    balanceTs: string | null;
    status: string;
    userId: string | null;
    raw: any;
  }> {
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    const messageObj = { action: 'getBalance', userId };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(`Calling getBalance url=${url} agent=${agentId}`);
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      return this.mapAgentResponse(resp.data);
    } catch (err: any) {
      this.logger.error(
        `getBalance failed agent=${agentId} user=${userId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log error to database
      try {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.GET_BALANCE,
          errorType,
          errorMessage: err.message || 'Unknown error',
          errorStack: err.stack,
          requestPayload: { messageObj, url },
          responseData,
          httpStatus,
          callbackUrl: url,
          rawError: JSON.stringify(err),
        });
      } catch (logError) {
        this.logger.error(
          `Failed to log wallet error to database: ${logError}`,
        );
      }

      throw err;
    }
  }

  async placeBet(
    agentId: string,
    userId: string,
    amount: number,
    roundId: string,
    platformTxId: string,
    currency: string = DEFAULTS.CURRENCY.DEFAULT,
    gamePayloads: any
  ): Promise<{
    balance: number;
    balanceTs: string | null;
    status: string;
    userId: string | null;
    raw: any;
  }> {
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    const betTime = new Date().toISOString();

    const txn = {
      platformTxId,
      userId,
      currency,
      ...gamePayloads,
      betType: null,
      betAmount: amount,
      betTime,
      roundId,
      isPremium: false,
    };

    const messageObj = { action: 'bet', txns: [txn] };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(
      `Calling placeBet url=${url} agent=${agentId} round=${roundId}`,
    );
    try {
      const resp = await this.retryWithBackoff(
        () => firstValueFrom(this.http.post<any>(url, payload)),
        3,
        1000,
        `placeBet agent=${agentId} user=${userId}`,
      );
      const mappedResponse = this.mapAgentResponse(resp.data);
      
      // Check if agent rejected the bet
      if (mappedResponse.status !== '0000') {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.PLACE_BET,
          errorType: WalletErrorType.AGENT_REJECTED,
          errorMessage: `Agent rejected bet with status: ${mappedResponse.status}`,
          requestPayload: { messageObj, url },
          responseData: mappedResponse.raw,
          platformTxId,
          roundId,
          betAmount: amount,
          currency,
          callbackUrl: url,
        });
      }
      
      return mappedResponse;
    } catch (err: any) {
      this.logger.error(
        `placeBet failed agent=${agentId} user=${userId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log error to database
      try {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.PLACE_BET,
          errorType,
          errorMessage: err.message || 'Unknown error',
          errorStack: err.stack,
          requestPayload: { messageObj, url },
          responseData,
          httpStatus,
          platformTxId,
          roundId,
          betAmount: amount,
          currency,
          callbackUrl: url,
          rawError: JSON.stringify(err),
        });
      } catch (logError) {
        this.logger.error(
          `Failed to log wallet error to database: ${logError}`,
        );
      }

      throw err;
    }
  }


  async settleBet(
    agentId: string,
    platformTxId: string,
    userId: string,
    winAmount: number,
    roundId: string,
    betAmount: number,
    gamePayloads: any,
    gameSession?: any
  ): Promise<{
    balance: number;
    balanceTs: string | null;
    status: string;
    userId: string | null;
    raw: any;
  }> {
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    const txTime = new Date().toISOString();
    const txn = {
      platformTxId,
      userId,
      ...gamePayloads,
      refPlatformTxId: null,
      settleType: gamePayloads.settleType,
      gameType: gamePayloads.gameType,
      gameCode: gamePayloads.gameCode,
      gameName: gamePayloads.gameName,
      betType: null,
      betAmount: Number(betAmount),
      winAmount: Number(winAmount),
      betTime: txTime,
      roundId,
    };
    if(gameSession) {
      txn.gameInfo = JSON.stringify(gameSession);
    }
    const messageObj = { action: 'settle', txns: [txn] };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(
      `Calling settleBet url=${url} agent=${agentId} txId=${platformTxId}`,
    );
    try {
      const resp = await this.retryWithBackoff(
        () => firstValueFrom(this.http.post<any>(url, payload)),
        3,
        1000,
        `settleBet agent=${agentId} txId=${platformTxId}`,
      );
      const mappedResponse = this.mapAgentResponse(resp.data);
      
      // Check if agent rejected the settlement
      if (mappedResponse.status !== '0000') {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.SETTLE_BET,
          errorType: WalletErrorType.AGENT_REJECTED,
          errorMessage: `Agent rejected settlement with status: ${mappedResponse.status}`,
          requestPayload: { messageObj, url },
          responseData: mappedResponse.raw,
          httpStatus: resp.status,
          platformTxId,
          roundId,
          betAmount,
          winAmount,
          currency: gamePayloads.currency || DEFAULTS.CURRENCY.DEFAULT,
          callbackUrl: url,
        });
      }
      
      return mappedResponse;
    } catch (err: any) {
      this.logger.error(
        `settleBet failed agent=${agentId} txId=${platformTxId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log error to database
      try {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.SETTLE_BET,
          errorType,
          errorMessage: err.message || 'Unknown error',
          errorStack: err.stack,
          requestPayload: { messageObj, url },
          responseData,
          httpStatus,
          platformTxId,
          roundId,
          betAmount,
          winAmount,
          currency: gamePayloads.currency || DEFAULTS.CURRENCY.DEFAULT,
          callbackUrl: url,
          rawError: JSON.stringify(err),
        });
      } catch (logError) {
        this.logger.error(
          `Failed to log wallet error to database: ${logError}`,
        );
      }
      throw err;
    }
  }

  async refundBet(
    agentId: string,
    userId: string,
    refundTransactions: Array<{
      platformTxId: string;
      refundPlatformTxId: string;
      betAmount: number;
      winAmount: number;
      turnover?: number;
      betTime: string;
      updateTime: string;
      roundId: string;
      gamePayloads: {
        platform: string;
        gameType: string;
        gameCode: string;
        gameName: string;
        betType?: string | null;
        currency?: string;
      };
      gameInfo?: any;
    }>,
  ): Promise<{
    balance: number;
    balanceTs: string | null;
    status: string;
    userId: string | null;
    raw: any;
  }> {
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    const currency = refundTransactions[0]?.gamePayloads?.currency || DEFAULTS.CURRENCY.DEFAULT;

    // Build transaction array from refund transactions
    const txns = refundTransactions.map((refundTxn) => {
      const txn: any = {
        platformTxId: refundTxn.platformTxId,
        userId,
        platform: refundTxn.gamePayloads.platform,
        gameType: refundTxn.gamePayloads.gameType,
        gameCode: refundTxn.gamePayloads.gameCode,
        gameName: refundTxn.gamePayloads.gameName,
        betType: refundTxn.gamePayloads.betType ?? null,
        betAmount: Number(refundTxn.betAmount),
        winAmount: Number(refundTxn.winAmount),
        turnover: Number(refundTxn.turnover ?? 0),
        betTime: refundTxn.betTime,
        updateTime: refundTxn.updateTime,
        roundId: refundTxn.roundId,
        refundPlatformTxId: refundTxn.refundPlatformTxId,
      };

      // Add gameInfo if provided
      if (refundTxn.gameInfo) {
        txn.gameInfo = typeof refundTxn.gameInfo === 'string' 
          ? refundTxn.gameInfo 
          : JSON.stringify(refundTxn.gameInfo);
      }

      return txn;
    });

    const messageObj = { action: 'cancelBet', txns };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(
      `Calling refundBet url=${url} agent=${agentId} txns=${txns.length}`,
    );
    try {
      const resp = await this.retryWithBackoff(
        () => firstValueFrom(this.http.post<any>(url, payload)),
        3,
        1000,
        `refundBet agent=${agentId} user=${userId}`,
      );
      const mappedResponse = this.mapAgentResponse(resp.data);
      
      // Check if agent rejected the refund
      if (mappedResponse.status !== '0000') {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.REFUND_BET,
          errorType: WalletErrorType.AGENT_REJECTED,
          errorMessage: `Agent rejected refund with status: ${mappedResponse.status}`,
          requestPayload: { messageObj, url },
          responseData: mappedResponse.raw,
          httpStatus: resp.status,
          platformTxId: refundTransactions[0]?.platformTxId,
          roundId: refundTransactions[0]?.roundId,
          betAmount: refundTransactions.reduce((sum, txn) => sum + txn.betAmount, 0),
          winAmount: refundTransactions.reduce((sum, txn) => sum + txn.winAmount, 0),
          currency,
          callbackUrl: url,
        });
      }
      
      return mappedResponse;
    } catch (err: any) {
      this.logger.error(
        `refundBet failed agent=${agentId} user=${userId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log error to database
      try {
        await this.walletErrorService.createError({
          agentId,
          userId,
          apiAction: WalletApiAction.REFUND_BET,
          errorType,
          errorMessage: err.message || 'Unknown error',
          errorStack: err.stack,
          requestPayload: { messageObj, url },
          responseData,
          httpStatus,
          platformTxId: refundTransactions[0]?.platformTxId,
          roundId: refundTransactions[0]?.roundId,
          betAmount: refundTransactions.reduce((sum, txn) => sum + txn.betAmount, 0),
          winAmount: refundTransactions.reduce((sum, txn) => sum + txn.winAmount, 0),
          currency,
          callbackUrl: url,
          rawError: JSON.stringify(err),
        });
      } catch (logError) {
        this.logger.error(
          `Failed to log wallet error to database: ${logError}`,
        );
      }

      throw err;
    }
  }
}
