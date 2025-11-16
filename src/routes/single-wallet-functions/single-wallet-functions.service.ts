import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AgentsService } from '../../modules/agents/agents.service';

@Injectable()
export class SingleWalletFunctionsService {
  private readonly logger = new Logger(SingleWalletFunctionsService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly http: HttpService,
  ) {}

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
    return {
      balance: 10002,
      balanceTs: new Date().toISOString(),
      status: '0000',
      userId: data.userId,
      raw: data,
    };
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
    const url = callbackURL; // assumed full endpoint from DB
    const messageObj = { action: 'getBalance', userId };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(`Calling getBalance url=${url} agent=${agentId}`);
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      return this.mapAgentResponse(resp.data);
    } catch (err) {
      this.logger.error(
        `getBalance failed agent=${agentId} user=${userId}`,
        err as any,
      );
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
      platform: 'SPADE',
      gameType: 'SPADE',
      gameCode: 'chicken-road-2',
      gameName: 'ChickenRoad',
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
      return this.mapAgentResponse(resp.data);
    } catch (err) {
      this.logger.error(
        `placeBet failed agent=${agentId} user=${userId}`,
        err as any,
      );
      throw err;

      //Return mock response for now
      return {
        balance: 1000,
        balanceTs: new Date().toISOString(),
        status: 'success',
        userId,
        raw: {},
      };
    }
  }

  // 3. settleBet
  async settleBet(
    agentId: string,
    platformTxId: string,
    userId: string,
    winAmount: string,
    roundId: string,
    betAmount: string,
  ): Promise<{
    balance: number;
    balanceTs: string | null;
    status: string;
    userId: string | null;
    raw: any;
  }> {
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    // Settlement txn per earlier example; refPlatformTxId null and settleType platformTxId
    const txTime = new Date().toISOString();
    const txn = {
      platformTxId,
      userId,
      platform: 'SPADE',
      refPlatformTxId: null,
      settleType: 'platformTxId',
      gameType: 'SPADE',
      gameCode: 'chicken-road-2',
      gameName: 'ChickenRoad',
      betType: null,
      betAmount: Number(betAmount),
      winAmount: Number(winAmount),
      turnover: Number(betAmount),
      betTime: txTime,
      txTime,
      updateTime: txTime,
      roundId,
      gameInfo: {
        result: Number(winAmount) > 0 ? 1 : -1,
        settled: 1,
        matchResult: Number(winAmount) > 0 ? 'WIN' : 'LOSE',
        odds: '1.00',
        ip: '0.0.0.0',
        matchno: 1,
        oddsMode: 0,
        arena: 'N/A',
        bddType: 0,
        status: Number(winAmount) > 0 ? 'WIN' : 'LOSE',
      },
    };
    const messageObj = { action: 'settle', txns: [txn] };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    this.logger.debug(
      `Calling settleBet url=${url} agent=${agentId} txId=${platformTxId}`,
    );
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      return this.mapAgentResponse(resp.data);
    } catch (err) {
      this.logger.error(
        `settleBet failed agent=${agentId} txId=${platformTxId}`,
        err as any,
      );
      throw err;
    }
  }
}
