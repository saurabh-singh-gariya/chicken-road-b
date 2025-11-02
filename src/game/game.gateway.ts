import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { GameConfigService } from '../gameConfig/game-config.service';
import { RedisService } from '../redis/redis.service';
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
import {
  formatBet,
  formatCoeff,
  formatMoney,
  toNumberSafe,
} from './utils/ui-format.util';

interface BalanceEventPayload {
  currency: string;
  balance: string; // stringified for frontend consistency
}

const WS_EVENTS = {
  CONNECTION_ERROR: 'connection-error',
  GAME_SERVICE: 'gameService',
  BALANCE_CHANGE: 'onBalanceChange',
  GAME_STATE: 'game-state', // new outbound payload replacing raw StepResponse
  BET_CONFIG: 'betConfig',
  MY_DATA: 'myData',
  BETS_RANGES: 'betsRanges',
  COEFFICIENTS: 'coefficients',
} as const;

@ApiTags('game')
// Restoring original Socket.IO path expected by frontend ('/io/')
@WebSocketGateway({ cors: true, path: '/io/' })
export class GameGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
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
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    // TEST MODE (simplified): Ignore any provided token entirely and always bind the first user in DB.
    // This should NOT ship to production. Replace with real auth before release.
    let auth = (client.data as any)?.auth;
    try {
      const users = await this.userService.findAll();
      if (users.length > 0) {
        const first = users[0];
        auth = { sub: first.id } as any;
        (client.data ||= {}).auth = auth;
        this.logger.warn(
          `TEST MODE: Force-bound client ${client.id} to first user id=${first.id}`,
        );
      } else {
        this.logger.error(
          `TEST MODE: No users found to bind for client ${client.id}; proceeding without user context`,
        );
      }
    } catch (e) {
      this.logger.error(
        `TEST MODE: Failed to load users for binding client ${client.id}: ${e}`,
      );
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

    const { betConfig, myData, betsRanges, balance } =
      await this.sendInitialData(client);

    // Stringify numeric arrays inside configs if they are JSON arrays
    const stringifyNestedNumbers = (val: any) => {
      try {
        const parsed = JSON.parse(val);
        const transform = (obj: any): any => {
          if (Array.isArray(obj)) {
            return obj.map((v) =>
              typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))
                ? v.toString()
                : transform(v),
            );
          }
          if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const k of Object.keys(obj)) {
              const v = obj[k];
              if (
                typeof v === 'number' ||
                (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))
              ) {
                out[k] = v.toString();
              } else {
                out[k] = transform(v);
              }
            }
            return out;
          }
          return obj;
        };
        const transformed = transform(parsed);
        return JSON.stringify(transformed);
      } catch {
        return val; // not JSON
      }
    };

    const betConfigOut = stringifyNestedNumbers(betConfig);
    const betsRangesOut = stringifyNestedNumbers(betsRanges);
    // const coefficientsOut = stringifyNestedNumbers(coefficients);

    client.emit(WS_EVENTS.BET_CONFIG, betConfigOut);
    client.emit(WS_EVENTS.MY_DATA, myData);
    client.emit(WS_EVENTS.BETS_RANGES, betsRangesOut);
    client.emit(WS_EVENTS.BALANCE_CHANGE, balance);

    // client.emit(WS_EVENTS.COEFFICIENTS, coefficientsOut);

    this.logger.log(
      `Client connected: ${client.id} (sub=${auth.sub})` +
        (gameMode ? ` gameMode=${gameMode}` : '') +
        (operatorId ? ` operatorId=${operatorId}` : ''),
    );
  }

  private extractToken(client: Socket): string | undefined {
    // TEST MODE: Token intentionally ignored; function retained for potential future reactivation.
    return undefined;
  }

  async handleDisconnect(client: Socket) {
    // clean all cache in the redis
    await this.redisService.flushAll();
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
      try {
        const wallet = await this.walletService.getOrCreateUserWallet(userId);
        if (wallet) {
          balance = {
            currency: wallet.currency,
            balance: wallet.balance.toString(),
          };
        }
      } catch (e) {
        this.logger.warn(
          `Failed to obtain wallet for initial data: ${client.id} (sub=${userId}) err=${(e as any)?.message}`,
        );
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
    };
  }

  @SubscribeMessage(WS_EVENTS.GAME_SERVICE)
  async handleGameEvent(
    @MessageBody() data: GameActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.getUserId(client);
    if (!userId) return;
    // If ACK handler already marked this payload, skip decorator processing to avoid duplicate emits.
    if ((data as any)?.__skipDecorator) {
      this.logger.debug('Skipping decorator handling (ACK already processed)');
      return;
    }

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
            Number(payload.betAmount),
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
          if (
            this.isStepResponse(response) &&
            (response as any).isFinished === true
          ) {
            await this.safeEmitBalance(client, userId, 'post-step');
          }
          break;
        }

        case GameAction.WITHDRAW:
        case GameAction.CASHOUT: {
          response = await this.gameService.cashOut(userId);
          await this.safeEmitBalance(client, userId, 'post-cashout');
          break;
        }

        case GameAction.GET_GAME_CONFIG: {
          response = await this.gameService.getGameConfig();
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
            nonce: userState.nonce.toString(), // stringified per UI numeric rule
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
            nonce: state.nonce.toString(), // stringified
          } as GameSeedsResponseDto;
          break;
        }

        case GameAction.REVEAL_SERVER_SEED: {
          const seeds = await this.fairService.getSeeds();
          const userState = await this.fairService.getUserSeedState(userId);
          const payload: RevealServerSeedResponseDto = {
            userSeed: userState.userSeed,
            serverSeed: seeds.currentServerSeed,
            serverSeedHash: seeds.currentServerSeedHash,
            finalNonce: userState.nonce.toString(), // stringified
          };
          response = payload;
          break;
        }

        case GameAction.ROTATE_SERVER_SEED: {
          const rotated = await this.fairService.rotateServerSeed();
          const roundsCountSafe = (rotated.roundsCount ?? 0).toString();
          response = {
            currentServerSeedHash: rotated.currentServerSeedHash,
            nextServerSeedHash: rotated.nextServerSeedHash,
            roundsCount: roundsCountSafe, // stringified
          } as any;
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
  private async getUserId(client: Socket): Promise<string | undefined> {
    let auth = (client.data as any)?.auth;
    let userId = auth?.sub as string | undefined;
    if (!userId) {
      this.logger.warn(
        `Missing userId on socket ${client.id} during game event – attempting fallback binding`,
      );
      // Attempt to bind first existing user or auto-create one (TEST MODE)
      try {
        return await this.bindFirstUserOrCreate(client);
      } catch (e) {
        this.logger.error(
          `Fallback binding failed for client ${client.id}: ${e}`,
        );
        client.emit(WS_EVENTS.CONNECTION_ERROR, {
          error: 'Missing authenticated subject',
          code: 'GAME_EVENT_NO_SUB',
        });
        return undefined;
      }
    }
    return userId;
  }

  private async bindFirstUserOrCreate(
    client: Socket,
  ): Promise<string | undefined> {
    try {
      const users = await this.userService.findAll();
      if (users.length > 0) {
        const first = users[0];
        (client.data ||= {}).auth = { sub: first.id };
        this.logger.warn(
          `TEST MODE: Late-bound first user id=${first.id} to client ${client.id}`,
        );
        return first.id;
      }
      // Auto create a simple test user if none exist
      this.logger.warn('TEST MODE: No users found; creating test-user');
      const createFn: any = (this.userService as any).create?.bind(
        this.userService,
      );
      if (createFn) {
        const newUser = await createFn({ name: 'test-user', avatar: '' });
        (client.data ||= {}).auth = { sub: newUser.id };
        this.logger.warn(
          `TEST MODE: Created and bound test-user id=${newUser.id} to client ${client.id}`,
        );
        return newUser.id;
      } else {
        this.logger.error(
          'UserService.create not available; cannot auto-create test-user',
        );
        return undefined;
      }
    } catch (e) {
      this.logger.error(
        `bindFirstUserOrCreate failed for client ${client.id}: ${e}`,
      );
      return undefined;
    }
  }

  /** Helper: Safely fetch and emit latest wallet balance. */
  private async safeEmitBalance(
    client: Socket,
    userId: string,
    context: 'post-bet' | 'post-cashout' | 'manual' | 'post-step' = 'manual',
  ) {
    try {
      const wallet = await this.walletService.getUserWallet(userId);
      if (!wallet) return;
      const balanceNum =
        typeof wallet.balance === 'number'
          ? wallet.balance
          : Number(wallet.balance);
      if (Number.isNaN(balanceNum)) {
        this.logger.warn(
          `Balance value for user ${userId} not numeric: ${wallet.balance}`,
        );
        return;
      }
      const payload: BalanceEventPayload = {
        currency: wallet.currency,
        balance: formatMoney(balanceNum),
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

  // Type guard for current StepResponse shape returned by GameService
  private isStepResponse(obj: unknown): obj is {
    isFinished: boolean;
    isWin: boolean;
    lineNumber: number;
    winAmount: number;
    betAmount: number;
    coeff: number;
    difficulty: string;
    endReason?: string;
    collisionPositions?: number[];
  } {
    if (!obj || typeof obj !== 'object') return false;
    const o: any = obj;
    return (
      'isFinished' in o &&
      'lineNumber' in o &&
      'winAmount' in o &&
      'betAmount' in o &&
      'coeff' in o &&
      'difficulty' in o
    );
  }

  private async toClientGameState(
    step: {
      isFinished: boolean;
      lineNumber: number;
      winAmount: number;
      betAmount: number;
      coeff: number;
      difficulty: string;
      endReason?: string;
      collisionPositions?: number[];
      isWin?: boolean;
    },
    userId: string,
  ) {
    let currency = 'USD';
    try {
      const wallet = await this.walletService.getUserWallet(userId);
      if (wallet?.currency) currency = wallet.currency;
    } catch {}

    const betNum = toNumberSafe(step.betAmount);
    const winNum = toNumberSafe(step.winAmount);
    const coeffNum = toNumberSafe(step.coeff);
    return [
      {
        isFinished: step.isFinished,
        currency,
        betAmount: formatBet(betNum),
        coeff: formatCoeff(coeffNum),
        winAmount: formatMoney(winNum),
        difficulty: step.difficulty,
        lineNumber: step.lineNumber,
        collisionPositions: step.collisionPositions,
        isWin: step.isWin,
      },
    ];
  }

  private async toClientGameStateAck(
    step: {
      isFinished: boolean;
      lineNumber: number;
      winAmount: number;
      betAmount: number;
      coeff: number;
      difficulty: string;
      endReason?: string;
      collisionPositions?: number[];
      isWin?: boolean;
    },
    userId: string,
  ) {
    let currency = 'USD';
    try {
      const wallet = await this.walletService.getUserWallet(userId);
      if (wallet?.currency) currency = wallet.currency;
    } catch {}

    const betNum = toNumberSafe(step.betAmount);
    const winNum = toNumberSafe(step.winAmount);
    const coeffNum = toNumberSafe(step.coeff);
    return {
      isFinished: step.isFinished,
      currency,
      betAmount: formatBet(betNum),
      coeff: formatCoeff(coeffNum),
      winAmount: formatMoney(winNum),
      difficulty: step.difficulty,
      lineNumber: step.lineNumber,
      collisionPositions: step.collisionPositions,
      isWin: step.isWin,
    };
  }

  private async wwtoClientGameState(
    step: {
      isFinished: boolean;
      lineNumber: number;
      winAmount: number;
      betAmount: number;
      coeff: number;
      difficulty: string;
      endReason?: string;
      collisionPositions?: number[];
      isWin?: boolean;
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
    const coeffStr = step.coeff.toString();

    return [
      {
        isFinished: step.isFinished,
        currency,
        betAmount: formatBet(step.betAmount),
        coeff: coeffStr,
        winAmount: formatWin(step.winAmount),
        difficulty: step.difficulty,
        lineNumber: step.lineNumber,
      },
    ];
  }

  /**
   * Minimal ACK support: if a client emits 'game-service' with a callback, respond via ACK
   * returning a bare array/object (no event name) for STEP (and BET) actions.
   * This leaves existing event-based flow untouched when no callback is provided.
   */
  afterInit(server: Server) {
    server.on('connection', (sock: Socket) => {
      const ackHandler = async (data: any, ack?: Function) => {
        if (typeof ack !== 'function') return; // no callback supplied, allow decorator flow
        try {
          const userId = await this.getUserId(sock);
          if (!userId) return ack({ error: 'NO_USER' });
          // Mark payload so decorator listener can ignore it (prevent duplicate response)
          //IN CASH
          if (
            (data && typeof data === 'object') ||
            data?.action === GameAction.CASHOUT
          ) {
            (data as any).__skipDecorator = true;
          }

          const rawAction: string = data?.action;
          const actionUpper =
            typeof rawAction === 'string' ? rawAction.toUpperCase() : '';

          switch (actionUpper) {
            case GameAction.STEP: {
              const payload = plainToInstance(StepPayloadDto, data.payload);
              await validateOrReject(payload);
              const stepResp = await this.gameService.step(
                userId,
                payload.lineNumber,
              );
              if (this.isStepResponse(stepResp)) {
                const transformed = await this.toClientGameStateAck(
                  stepResp as any,
                  userId,
                );
                // If finished emit updated balance (already handled in decorator, replicate here)
                if ((stepResp as any).isFinished) {
                  await this.safeEmitBalance(sock, userId, 'post-step');
                }
                return ack(transformed);
              }
              return ack(stepResp);
            }

            case GameAction.BET: {
              const payload = plainToInstance(BetPayloadDto, data.payload);
              await validateOrReject(payload);
              const betResp = await this.gameService.placeBet(
                userId,
                Number(payload.betAmount),
                payload.difficulty,
              );
              await this.safeEmitBalance(sock, userId, 'post-bet');
              // If bet response itself looks like a step/session we could transform, but keep raw here
              if (this.isStepResponse(betResp)) {
                const transformed = await this.toClientGameStateAck(
                  betResp as any,
                  userId,
                );
                return ack(transformed);
              }
              return ack(betResp);
            }

            case GameAction.WITHDRAW:
            case GameAction.CASHOUT: {
              const resp = await this.gameService.cashOut(userId);
              await this.safeEmitBalance(sock, userId, 'post-cashout');
              if (this.isStepResponse(resp)) {
                const transformed = await this.toClientGameStateAck(
                  resp as any,
                  userId,
                );
                return ack(transformed);
              }
              return ack(resp);
            }

            case GameAction.GET_GAME_SESSION: {
              const resp = await this.gameService.getActiveSession(userId);
              // Session object is sent raw
              return ack(resp ?? null);
            }

            case GameAction.GET_GAME_CONFIG: {
              // Provide raw config; extend later if need combined coefficients/lastWin
              const resp = await this.gameService.getGameConfig();
              return ack(resp ?? null);
            }

            case GameAction.GET_GAME_SEEDS: {
              const seeds = await this.fairService.getSeeds();
              const userState = await this.fairService.getUserSeedState(userId);
              const payload: GameSeedsResponseDto = {
                userSeed: userState.userSeed,
                currentServerSeedHash: seeds.currentServerSeedHash,
                nextServerSeedHash: seeds.nextServerSeedHash,
                nonce: userState.nonce.toString(),
              };
              return ack(payload);
            }

            case GameAction.SET_USER_SEED: {
              const dto = plainToInstance(SetUserSeedDto, data.payload);
              const state = await this.fairService.setUserSeed(
                userId,
                dto.userSeed,
              );
              const seeds = await this.fairService.getSeeds();
              const payload: GameSeedsResponseDto = {
                userSeed: state.userSeed,
                currentServerSeedHash: seeds.currentServerSeedHash,
                nextServerSeedHash: seeds.nextServerSeedHash,
                nonce: state.nonce.toString(),
              };
              return ack(payload);
            }

            case GameAction.REVEAL_SERVER_SEED: {
              const seeds = await this.fairService.getSeeds();
              const userState = await this.fairService.getUserSeedState(userId);
              const payload: RevealServerSeedResponseDto = {
                userSeed: userState.userSeed,
                serverSeed: seeds.currentServerSeed,
                serverSeedHash: seeds.currentServerSeedHash,
                finalNonce: userState.nonce.toString(),
              };
              return ack(payload);
            }

            case GameAction.ROTATE_SERVER_SEED: {
              const rotated = await this.fairService.rotateServerSeed();
              const roundsCountSafe = (rotated.roundsCount ?? 0).toString();
              return ack({
                currentServerSeedHash: rotated.currentServerSeedHash,
                nextServerSeedHash: rotated.nextServerSeedHash,
                roundsCount: roundsCountSafe,
              });
            }

            default:
              return ack({
                error: 'ACK_UNSUPPORTED_ACTION',
                action: rawAction,
              });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return ack({ error: msg });
        }
      };

      // Support both kebab and camelCase event name variants for incoming actions.
      // Use prependListener so ACK handler runs before NestJS decorator listener.
      sock.prependListener(WS_EVENTS.GAME_SERVICE, ackHandler);
      sock.prependListener('game-service', ackHandler); // legacy alias for backward compatibility
    });
  }
}
