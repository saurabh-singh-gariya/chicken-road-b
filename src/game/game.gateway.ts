import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { GameConfigService } from '../gameConfig/game-config.service';
import { UserService } from '../user/user.service';
import { WalletService } from '../wallet/wallet.service';
import { BetPayloadDto } from './dto/bet-payload.dto';
import {
  GameSeedsResponseDto,
  RevealServerSeedResponseDto,
  SetUserSeedDto,
} from './dto/fairness.dto';
import { GameAction, GameActionDto } from './dto/game-action.dto';
import { StepPayloadDto } from './dto/step-payload.dto';
import { GameService } from './game.service';
import { ProvablyFairService } from './provably-fair.service';

interface BalanceEventPayload {
  currency: string;
  balance: string; // stringified for frontend consistency
}

const WS_EVENTS = {
  CONNECTION_ERROR: 'connection-error',
  GAME_SERVICE: 'game-service',
  BALANCE_CHANGE: 'onBalanceChange',
  GAME_STATE: 'game-state', // new outbound payload replacing raw StepResponse
  BET_CONFIG: 'betConfig',
  MY_DATA: 'myData',
  BETS_RANGES: 'betsRanges',
  COEFFICIENTS: 'coefficients',
} as const;

@ApiTags('game')
@WebSocketGateway({ cors: true, path: '/io/' })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(GameGateway.name);

  constructor(
    private readonly gameService: GameService,
    private readonly gameConfigService: GameConfigService,
    private readonly walletService: WalletService,
    private readonly userService: UserService,
    private readonly jwt: JwtService,
    private readonly fairService: ProvablyFairService,
  ) {}

  async handleConnection(client: Socket) {
    let auth = (client.data as any)?.auth;
    let tokenUsed: string | undefined;
    if (!auth?.sub) {
      tokenUsed = this.extractToken(client);
      if (!tokenUsed) {
        this.logger.warn(`Missing token on connection: ${client.id}`);
        client.emit(WS_EVENTS.CONNECTION_ERROR, {
          error: 'Missing Authorization token',
          code: 'MISSING_TOKEN',
        });
        client.disconnect();
        return;
      }
      try {
        auth = this.jwt.verify(tokenUsed);
        (client.data ||= {}).auth = auth;
      } catch (e) {
        this.logger.warn(`Token verification failed for ${client.id}: ${e}`);
        client.emit(WS_EVENTS.CONNECTION_ERROR, {
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
        });
        client.disconnect();
        return;
      }
    }
    if (!auth?.sub) {
      this.logger.warn(`Token decoded without subject (sub) for ${client.id}`);
      client.emit(WS_EVENTS.CONNECTION_ERROR, {
        error: 'Token missing subject',
        code: 'TOKEN_NO_SUB',
      });
      client.disconnect();
      return;
    }

    const q: any = client.handshake.query;
    const gameMode = Array.isArray(q?.gameMode) ? q.gameMode[0] : q?.gameMode;
    const operatorId = Array.isArray(q?.operatorId)
      ? q.operatorId[0]
      : q?.operatorId;

    if (!gameMode) {
      this.logger.warn(`Missing gameMode for ${client.id}`);
      client.emit(WS_EVENTS.CONNECTION_ERROR, {
        error: 'Missing gameMode query parameter',
        code: 'MISSING_GAMEMODE',
      });
      client.disconnect();
      return;
    }
    if (!operatorId) {
      this.logger.warn(`Missing operatorId for ${client.id}`);
      client.emit('connection-error', {
        error: 'Missing operatorId query parameter',
        code: 'MISSING_OPERATOR_ID',
      });
      client.disconnect();
      return;
    }

    (client.data ||= {}).gameMode = gameMode;
    (client.data ||= {}).operatorId = operatorId;

    const { betConfig, myData, betsRanges, balance, coefficients } =
      await this.sendInitialData(client);

    client.emit(WS_EVENTS.BET_CONFIG, betConfig);
    client.emit(WS_EVENTS.MY_DATA, myData);
    client.emit(WS_EVENTS.BETS_RANGES, betsRanges);
    client.emit(WS_EVENTS.BALANCE_CHANGE, balance);

    client.emit(WS_EVENTS.COEFFICIENTS, coefficients);

    this.logger.log(
      `Client connected: ${client.id} (sub=${auth.sub})` +
        (gameMode ? ` gameMode=${gameMode}` : '') +
        (operatorId ? ` operatorId=${operatorId}` : ''),
    );
  }

  private extractToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
      }
      if (
        /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+$/.test(
          authHeader.trim(),
        )
      ) {
        return authHeader.trim();
      }
    }
    const authObj: any = client.handshake.auth;
    if (authObj?.token)
      return Array.isArray(authObj.token) ? authObj.token[0] : authObj.token;
    const q: any = client.handshake.query;
    if (q?.token) return Array.isArray(q.token) ? q.token[0] : q.token;
    if (q?.Authorization)
      return Array.isArray(q.Authorization)
        ? q.Authorization[0]
        : q.Authorization;
    return undefined;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private async sendInitialData(client: Socket) {
    const userId = (client.data as any)?.auth?.sub as string | undefined;

    const betConfig = await this.gameConfigService.getConfig('betsConfig');
    const betsRanges = await this.gameConfigService.getConfig('betsRanges');
    const coefficients = await this.gameConfigService.getConfig('coefficients');

    let balance = {};
    let myData = {};
    if (!userId) {
      this.logger.warn(
        `Cannot send initial data without authenticated subject: ${client.id}`,
      );
    } else {
      const wallet = await this.walletService.getUserWallet(userId);
      if (wallet) {
        balance = {
          currency: wallet.currency,
          balance: wallet.balance.toString(),
        };
      }
      const user = await this.userService.findOne(userId);
      if (user) {
        myData = {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
        };
      } else {
        this.logger.warn(
          `User not found for initial data: ${client.id} (sub=${userId})`,
        );
        myData = {
          id: userId,
          name: 'Unknown',
          avatar: '',
        };
      }
    }

    return {
      balance,
      betConfig,
      myData,
      betsRanges,
      coefficients,
    };
  }

  @SubscribeMessage(WS_EVENTS.GAME_SERVICE)
  async handleGameEvent(
    @MessageBody() data: GameActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.getUserId(client);
    if (!userId) return;

    try {
      // await validateOrReject(data);
      let response: unknown;
      switch (data.action) {
        case GameAction.BET: {
          const payload = plainToInstance(BetPayloadDto, data.payload);
          await validateOrReject(payload);
          this.logger.log(
            `User ${userId} placed a bet: ${JSON.stringify(payload)} on difficulty ${payload.difficulty}`,
          );
          response = await this.gameService.placeBet(
            userId,
            payload.betAmount,
            payload.difficulty,
          );
          await this.safeEmitBalance(client, userId, 'post-bet');
          break;
        }

        case GameAction.STEP: {
          const payload = plainToInstance(StepPayloadDto, data.payload);
          await validateOrReject(payload);
          this.logger.log(
            `User ${userId} moved to step: ${payload.lineNumber}`,
          );
          response = await this.gameService.step(userId, payload.lineNumber);
          break;
        }

        case GameAction.CASHOUT: {
          response = await this.gameService.cashOut(userId);
          await this.safeEmitBalance(client, userId, 'post-cashout');
          break;
        }

        case GameAction.GET_GAME_CONFIG: {
          response = await this.gameConfigService.getConfig('gameConfig');
          break;
        }

        case GameAction.GET_GAME_SESSION: {
          response = await this.gameService.getActiveSession(userId);
          break;
        }

        case GameAction.GET_GAME_SEEDS: {
          const seeds = await this.fairService.getSeeds();
          const userState = await this.fairService.getUserSeedState(userId);
          const payload: GameSeedsResponseDto = {
            userSeed: userState.userSeed,
            currentServerSeedHash: seeds.currentServerSeedHash,
            nextServerSeedHash: seeds.nextServerSeedHash,
            nonce: userState.nonce,
          };
          response = payload;
          break;
        }

        case GameAction.SET_USER_SEED: {
          const dto = plainToInstance(SetUserSeedDto, data.payload);
          // optional validation can be added
          const state = await this.fairService.setUserSeed(
            userId,
            dto.userSeed,
          );
          const seeds = await this.fairService.getSeeds();
          response = {
            userSeed: state.userSeed,
            currentServerSeedHash: seeds.currentServerSeedHash,
            nextServerSeedHash: seeds.nextServerSeedHash,
            nonce: state.nonce,
          } as GameSeedsResponseDto;
          break;
        }

        case GameAction.REVEAL_SERVER_SEED: {
          // For now reveal current server seed; later could restrict to finished session only
          const seeds = await this.fairService.getSeeds();
          const userState = await this.fairService.getUserSeedState(userId);
          const payload: RevealServerSeedResponseDto = {
            userSeed: userState.userSeed,
            serverSeed: seeds.currentServerSeed,
            serverSeedHash: seeds.currentServerSeedHash,
            finalNonce: userState.nonce,
          };
          response = payload;
          break;
        }

        case GameAction.ROTATE_SERVER_SEED: {
          const rotated = await this.fairService.rotateServerSeed();
          response = {
            currentServerSeedHash: rotated.currentServerSeedHash,
            nextServerSeedHash: rotated.nextServerSeedHash,
            roundsCount: rotated.roundsCount,
          };
          break;
        }

        default:
          response = { error: 'Unknown action' };
          break;
      }

      // Transform StepResponse / session responses into the required client shape if applicable
      if (this.isStepResponse(response)) {
        const transformed = await this.toClientGameState(
          response as any,
          userId,
        );
        client.emit(WS_EVENTS.GAME_STATE, transformed);
      } else {
        client.emit(WS_EVENTS.GAME_SERVICE, response);
      }
    } catch (err) {
      this.logger.error(`Validation failed: ${err}`);
      const errorMessage =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : String(err);
      client.emit(WS_EVENTS.GAME_SERVICE, { error: errorMessage });
    }
  }

  /** Helper: Extract authenticated user id or warn & emit error */
  private getUserId(client: Socket): string | undefined {
    const auth = (client.data as any)?.auth;
    const userId = auth?.sub as string | undefined;
    if (!userId) {
      this.logger.warn(
        `Game event without authenticated subject: ${client.id}`,
      );
      client.emit(WS_EVENTS.CONNECTION_ERROR, {
        error: 'Missing authenticated subject',
        code: 'GAME_EVENT_NO_SUB',
      });
    }
    return userId;
  }

  /** Helper: Safely fetch and emit latest wallet balance. */
  private async safeEmitBalance(
    client: Socket,
    userId: string,
    context: 'post-bet' | 'post-cashout' | 'manual' = 'manual',
  ) {
    try {
      const wallet = await this.walletService.getUserWallet(userId);
      if (!wallet) return;
      const payload: BalanceEventPayload = {
        currency: wallet.currency,
        balance: wallet.balance.toFixed(2),
      };
      client.emit(WS_EVENTS.BALANCE_CHANGE, payload);
      this.logger.debug(
        `Emitted balance change (${context}) for user ${userId}: ${payload.balance}`,
      );
    } catch (e) {
      this.logger.warn(
        `Failed to emit balance (${context}) for user ${userId}: ${e}`,
      );
    }
  }

  // Type guard for StepResponse shape
  private isStepResponse(obj: unknown): obj is {
    isActive: boolean;
    isWin: boolean;
    currentStep: number;
    winAmount: number;
    betAmount: number;
    multiplier: number;
    difficulty: string;
    profit: number;
    endReason?: string;
  } {
    if (!obj || typeof obj !== 'object') return false;
    const o: any = obj;
    return (
      'isActive' in o &&
      'currentStep' in o &&
      'winAmount' in o &&
      'betAmount' in o &&
      'multiplier' in o &&
      'difficulty' in o
    );
  }

  private async toClientGameState(
    step: {
      isActive: boolean;
      isWin: boolean;
      currentStep: number;
      winAmount: number;
      betAmount: number;
      multiplier: number;
      difficulty: string;
      profit: number;
      endReason?: string;
    },
    userId: string,
  ) {
    let currency = 'USD';
    try {
      const wallet = await this.walletService.getUserWallet(userId);
      if (wallet?.currency) currency = wallet.currency;
    } catch {}

    const formatBet = (n: number) => n.toFixed(9); // matches example 0.600000000
    const formatWin = (n: number) => n.toFixed(2); // example shows 0.60
    const coeffStr = step.multiplier.toString();

    return [
      {
        isFinished: !step.isActive,
        currency,
        betAmount: formatBet(step.betAmount),
        coeff: coeffStr,
        winAmount: formatWin(step.winAmount),
        difficulty: step.difficulty,
        lineNumber: step.currentStep,
      },
    ];
  }
}
