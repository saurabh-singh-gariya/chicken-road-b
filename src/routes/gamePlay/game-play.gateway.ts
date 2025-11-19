import { Logger } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';
import {
  JwtTokenService,
  UserTokenPayload,
} from '../../modules/jwt/jwt-token.service';
import { GameAction, GameActionDto } from './DTO/game-action.dto';
import { GamePlayService } from './game-play.service';
import { SingleWalletFunctionsService } from '../single-wallet-functions/single-wallet-functions.service';
import { UserService } from '../../modules/user/user.service';

const WS_EVENTS = {
  CONNECTION_ERROR: 'connection-error',
  BALANCE_CHANGE: 'onBalanceChange',
  BET_CONFIG: 'betConfig',
  MY_DATA: 'myData',
  GAME_SERVICE: 'gameService',
  BETS_RANGES: 'betsRanges',
  GAME_PLAY_SERVICE: 'gamePlayService',
  PING: 'ping',
  PONG: 'pong',
} as const;

const CONNECTION_ERRORS = {
  MISSING_GAMEMODE: 'MISSING_GAMEMODE',
  MISSING_OPERATOR_ID: 'MISSING_OPERATOR_ID',
  MISSING_AUTH: 'MISSING_AUTH',
  INVALID_TOKEN: 'INVALID_TOKEN',
} as const;

const ERROR_RESPONSES = {
  MISSING_ACTION: 'missing_action',
  CONFIG_FETCH_FAILED: 'config_fetch_failed',
  MISSING_CONTEXT: 'missing_context',
  BET_FAILED: 'bet_failed',
  MISSING_USER_OR_AGENT: 'missing_user_or_agent',
  INVALID_LINE_NUMBER: 'invalid_line_number',
  STEP_FAILED: 'step_failed',
  CASHOUT_FAILED: 'cashout_failed',
  GET_SESSION_FAILED: 'get_session_failed',
  UNSUPPORTED_ACTION: 'unsupported_action',
} as const;

const TOKEN_SUFFIX_PATTERN = /=4$/;
const DEFAULT_CURRENCY = 'INR';
const DEFAULT_BALANCE = '1000000';

interface BalanceEventPayload {
  currency: string;
  balance: string;
}

interface MyDataEvent {
  userId: string;
  nickname: string;
  gameAvatar: string | null;
}

@WebSocketGateway({ cors: true, path: '/io/' })
export class GamePlayGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(GamePlayGateway.name);

  constructor(
    private readonly jwtTokens: JwtTokenService,
    private readonly gamePlayService: GamePlayService,
    private readonly singleWalletFunctionsService: SingleWalletFunctionsService,
    private readonly userService: UserService,
  ) { }

  async handleConnection(client: Socket) {
    const q: any = client.handshake.query;
    const gameMode = this.firstOf(q?.gameMode);
    const operatorId = this.firstOf(q?.operatorId);
    let rawToken = this.firstOf(q?.Authorization);

    if (!gameMode) {
      this.emitAndDisconnect(
        client,
        'Missing gameMode query parameter',
        CONNECTION_ERRORS.MISSING_GAMEMODE,
      );
      return;
    }
    if (!operatorId) {
      this.emitAndDisconnect(
        client,
        'Missing operatorId query parameter',
        CONNECTION_ERRORS.MISSING_OPERATOR_ID,
      );
      return;
    }
    if (!rawToken) {
      this.emitAndDisconnect(
        client,
        'Missing Authorization query parameter',
        CONNECTION_ERRORS.MISSING_AUTH,
      );
      return;
    }

    if (
      TOKEN_SUFFIX_PATTERN.test(rawToken) &&
      rawToken.split('.').length === 3
    ) {
      rawToken = rawToken.replace(TOKEN_SUFFIX_PATTERN, '');
    }

    let authPayload: UserTokenPayload | undefined;
    try {
      authPayload = await this.jwtTokens.verifyToken(rawToken);
    } catch (e) {
      this.logger.warn(
        `Token verification failed for ${client.id}: ${(e as any)?.message || e}`,
      );
      this.emitAndDisconnect(
        client,
        'Invalid or expired token',
        CONNECTION_ERRORS.INVALID_TOKEN,
      );
      return;
    }

    (client.data ||= {}).auth = authPayload;
    (client.data ||= {}).gameMode = gameMode;
    (client.data ||= {}).operatorId = operatorId;

    const userId = authPayload.sub;
    const agentId = (authPayload as any).agentId || operatorId;

    (client.data ||= {}).userId = userId;
    (client.data ||= {}).agentId = agentId;

    const balance: BalanceEventPayload = {
      currency: DEFAULT_CURRENCY,
      balance: DEFAULT_BALANCE,
    };

    const walletBalance = await this.singleWalletFunctionsService.getBalance(agentId, userId);
    balance.balance = walletBalance.balance.toString();
    balance.currency = DEFAULT_CURRENCY;

    const betsRanges = { INR: ['0.01', '150.00'] };

    let { betConfig } = await this.gamePlayService.getGameConfigPayload();

    betConfig = {
      INR: {
        ...betConfig,
      },
    };

    const userData = await this.userService.findOne(userId, agentId);

    const myData: MyDataEvent = {
      userId: userId,
      nickname: userData.username || userId,
      gameAvatar: userData?.avatar || null,
    };

    client.emit(WS_EVENTS.BALANCE_CHANGE, balance);
    client.emit(WS_EVENTS.BETS_RANGES, betsRanges);
    client.emit(WS_EVENTS.BET_CONFIG, betConfig);
    client.emit(WS_EVENTS.MY_DATA, myData);

    this.logger.log(
      `GamePlay socket connected id=${client.id} userId=${userId} agentId=${agentId} gameMode=${gameMode} operatorId=${operatorId}`,
    );
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    const agentId = client.data?.agentId;

    this.logger.log(
      `GamePlay socket disconnected id=${client.id} userId=${userId || 'unknown'} agentId=${agentId || 'unknown'}`,
    );

    // TEMPORARY: Clean up Redis and placed bets on disconnect
    //only if environment is not production
      if (process.env.APP_ENV !== 'production' && process.env.APP_ENV !== 'staging' && process.env.APP_ENV !== 'development') {
        try {
        await this.gamePlayService.cleanupOnDisconnect();
      } catch (error) {
        this.logger.error(
          `Failed to cleanup on disconnect for client ${client.id}: ${error.message}`,
        );
      }
    }
  }

  @SubscribeMessage(WS_EVENTS.GAME_SERVICE)
  async handleGameService(
    @MessageBody() data: GameActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    const rawAction: string | undefined = data?.action;

    if (!rawAction) {
      client.emit(WS_EVENTS.GAME_SERVICE, {
        error: ERROR_RESPONSES.MISSING_ACTION,
      });
      return;
    }

    if (rawAction === 'get-game-config') {
      const payload = await this.gamePlayService.getGameConfigPayload();
      this.logger.log(`Emitting game config (event) to ${client.id}`);
      client.emit(WS_EVENTS.GAME_SERVICE, payload);
      return;
    }
    const knownPlaceholders: GameAction[] = [
      GameAction.WITHDRAW,
      GameAction.CASHOUT,
      GameAction.GET_GAME_SESSION,
      GameAction.GET_GAME_SEEDS,
      GameAction.SET_USER_SEED,
    ];

    if (rawAction === GameAction.BET) {
      // Do not emit bet response via event; rely solely on ACK for protocol consistency
      this.logger.debug(
        `Bet action event received from ${client.id}; deferring to ACK handler.`,
      );
      return;
    }

    if (
      rawAction === GameAction.STEP ||
      rawAction === GameAction.CASHOUT ||
      rawAction === GameAction.GET_GAME_SESSION
    ) {
      // Event path does not emit responses for these; rely on ACK only
      this.logger.debug(
        `Event received for ${rawAction} from ${client.id}; deferring to ACK.`,
      );
      return;
    }
    if (knownPlaceholders.includes(rawAction as GameAction)) {
      const placeholder = this.gamePlayService.buildPlaceholder(
        rawAction,
        data?.payload,
      );
      this.logger.debug(
        `Placeholder action response -> ${rawAction} for client ${client.id}`,
      );
      client.emit(WS_EVENTS.GAME_SERVICE, placeholder);
      return;
    }

    this.logger.warn(
      `Unknown game action "${rawAction}" from client ${client.id}`,
    );
    client.emit(WS_EVENTS.GAME_SERVICE, {
      action: rawAction,
      status: ERROR_RESPONSES.UNSUPPORTED_ACTION,
    });
  }

  @SubscribeMessage(WS_EVENTS.PING)
  async handlePing(@ConnectedSocket() client: Socket) {
    client.emit(WS_EVENTS.PONG, { ts: Date.now() });
  }

  private firstOf(val: unknown): string | undefined {
    if (Array.isArray(val)) return val[0];
    if (typeof val === 'string') return val;
    return undefined;
  }

  private emitAndDisconnect(client: Socket, error: string, code: string) {
    client.emit(WS_EVENTS.CONNECTION_ERROR, { error, code });
    client.disconnect();
  }

  afterInit(server: Server) {
    server.on('connection', (sock: Socket) => {
      const ackHandler = (data: any, ack?: Function) => {
        if (typeof ack !== 'function') return;
        const rawAction: string | undefined = data?.action;
        if (!rawAction) return ack({ error: ERROR_RESPONSES.MISSING_ACTION });
        if (rawAction === GameAction.GET_GAME_CONFIG) {
          this.gamePlayService
            .getGameConfigPayload()
            .then((payload) => {
              this.logger.log(`Returning game config (ACK) to ${sock.id}`);
              ack(payload);
            })
            .catch((e) => {
              this.logger.error(`ACK game config failed: ${e}`);
              ack({ error: ERROR_RESPONSES.CONFIG_FETCH_FAILED });
            });
          return;
        }
        const knownPlaceholders: GameAction[] = [
          GameAction.GET_GAME_SESSION,
          GameAction.GET_GAME_SEEDS,
          GameAction.SET_USER_SEED,
        ];

        if (rawAction === GameAction.BET) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;
          const gameMode: string | undefined = sock.data?.gameMode;
          if (!userId || !agentId || !gameMode) {
            return ack({
              error: ERROR_RESPONSES.MISSING_CONTEXT,
              details: { userId, agentId, gameMode },
            });
          }
          this.gamePlayService
            .performBetFlow(userId, agentId, gameMode, data?.payload)
            .then(async (resp) => {
              // Emit onBalanceChange after successful bet
              ack(resp);
              if (!('error' in resp)) {
                const walletBalance = await this.singleWalletFunctionsService.getBalance(agentId, userId);
                const balanceEvent: BalanceEventPayload = {
                  currency: DEFAULT_CURRENCY,
                  balance: walletBalance.balance.toString(),
                };
                sock.emit(WS_EVENTS.BALANCE_CHANGE, balanceEvent);
                this.logger.debug(
                  `Emitted onBalanceChange after bet: balance=${walletBalance.balance} currency=${DEFAULT_CURRENCY}`,
                );
              }
            })
            .catch((e) => {
              this.logger.error(`Bet flow failed for socket ${sock.id}: ${e}`);
              ack({ error: ERROR_RESPONSES.BET_FAILED });
            });
          return;
        }

        if (rawAction === GameAction.STEP) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;

          if (!userId || !agentId) {
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          const lineNumber = Number(data?.payload?.lineNumber);
          if (!isFinite(lineNumber))
            return ack({ error: ERROR_RESPONSES.INVALID_LINE_NUMBER });

          this.gamePlayService
            .performStepFlow(userId, agentId, lineNumber)
            .then(async (r) => {
              ack(r);
              // Emit onBalanceChange after step when isFinished is true
              if (!('error' in r) && r.isFinished) {
                const walletBalance = await this.singleWalletFunctionsService.getBalance(agentId, userId);
                const balanceEvent: BalanceEventPayload = {
                  currency: r.currency,
                  balance: walletBalance.balance.toString(),
                };
                sock.emit(WS_EVENTS.BALANCE_CHANGE, balanceEvent);
                this.logger.debug(
                  `Emitted onBalanceChange after step (finished): balance=${walletBalance.balance} currency=${DEFAULT_CURRENCY}`,
                );
              }
            })
            .catch((e) => {
              this.logger.error(`Step flow failed: ${e}`);
              ack({ error: ERROR_RESPONSES.STEP_FAILED });
            });
          return;
        }

        if (rawAction === GameAction.CASHOUT || rawAction === GameAction.WITHDRAW) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;
          if (!userId || !agentId) {
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          this.gamePlayService
            .performCashOutFlow(userId, agentId)
            .then(async (r) => {
              // Emit onBalanceChange after successful cashout
              ack(r);
              if (!('error' in r)) {
                const walletBalance = await this.singleWalletFunctionsService.getBalance(agentId, userId);
                const balanceEvent: BalanceEventPayload = {
                  currency: DEFAULT_CURRENCY,
                  balance: walletBalance.balance.toString(),
                };
                sock.emit(WS_EVENTS.BALANCE_CHANGE, balanceEvent);
                this.logger.debug(
                  `Emitted onBalanceChange after cashout: balance=${walletBalance.balance} currency=${DEFAULT_CURRENCY}`,
                );
              }
            })
            .catch((e) => {
              this.logger.error(`Cashout flow failed: ${e}`);
              ack({ error: ERROR_RESPONSES.CASHOUT_FAILED });
            });
          return;
        }

        if (rawAction === GameAction.GET_GAME_SESSION) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;
          if (!userId || !agentId) {
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          this.gamePlayService
            .performGetSessionFlow(userId, agentId)
            .then((r) => ack(r))
            .catch((e) => {
              this.logger.error(`Get session flow failed: ${e}`);
              ack({ error: ERROR_RESPONSES.GET_SESSION_FAILED });
            });
          return;
        }

        if (knownPlaceholders.includes(rawAction as GameAction)) {
          return ack(
            this.gamePlayService.buildPlaceholder(rawAction, data?.payload),
          );
        }
        return ack(
          {
            action: rawAction,
            status: 'unsupported_action',
          },
        );
      };
      sock.prependListener(WS_EVENTS.GAME_SERVICE, ackHandler);
    });
  }
}
