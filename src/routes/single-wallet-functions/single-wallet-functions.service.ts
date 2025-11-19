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
    currency: string = 'INR',
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
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
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
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
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
          currency: gamePayloads.currency || 'INR',
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
          currency: gamePayloads.currency || 'INR',
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
