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
import { LastWinBroadcasterService } from '../../modules/last-win/last-win-broadcaster.service';

const WS_EVENTS = {
  CONNECTION_ERROR: 'connection-error',
  BALANCE_CHANGE: 'onBalanceChange',
  BET_CONFIG: 'betsConfig',
  MY_DATA: 'myData',
  CURRENCIES: 'currencies',
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

@WebSocketGateway({
  cors: {
    origin: true, // Allow all origins
    credentials: true, // Allow credentials
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  },
  path: '/io/',
})
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
    private readonly lastWinBroadcasterService: LastWinBroadcasterService,
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

    const currencies = await this.gamePlayService.getCurrencies();

    client.emit(WS_EVENTS.BALANCE_CHANGE, balance);
    client.emit(WS_EVENTS.BETS_RANGES, betsRanges);
    client.emit(WS_EVENTS.BET_CONFIG, betConfig);
    client.emit(WS_EVENTS.MY_DATA, myData);
    client.emit(WS_EVENTS.CURRENCIES, currencies);

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
    // if (process.env.APP_ENV !== 'production' && process.env.APP_ENV !== 'staging' && process.env.APP_ENV !== 'development') {
    try {
      await this.gamePlayService.cleanupOnDisconnect();
    } catch (error) {
      this.logger.error(
        `Failed to cleanup on disconnect for client ${client.id}: ${error.message}`,
      );
      // }
    }
  }

  // @SubscribeMessage(WS_EVENTS.GAME_SERVICE)
  // async handleGameService(
  //   @MessageBody() data: GameActionDto,
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   const rawAction: string | undefined = data?.action;

  //   if (!rawAction) {
  //     client.emit(WS_EVENTS.GAME_SERVICE, {
  //       error: ERROR_RESPONSES.MISSING_ACTION,
  //     });
  //     return;
  //   }

  //   if (rawAction === 'get-game-config') {
  //     const payload = await this.gamePlayService.getGameConfigPayload();
  //     this.logger.log(`Emitting game config (event) to ${client.id}`);
  //     client.emit(WS_EVENTS.GAME_SERVICE, payload);
  //     return;
  //   }
  //   const knownPlaceholders: GameAction[] = [
  //     GameAction.WITHDRAW,
  //     GameAction.CASHOUT,
  //     GameAction.GET_GAME_SESSION,
  //     GameAction.GET_GAME_SEEDS,
  //     GameAction.SET_USER_SEED,
  //   ];

  //   if (rawAction === GameAction.BET) {
  //     // Do not emit bet response via event; rely solely on ACK for protocol consistency
  //     this.logger.debug(
  //       `Bet action event received from ${client.id}; deferring to ACK handler.`,
  //     );
  //     return;
  //   }

  //   if (
  //     rawAction === GameAction.STEP ||
  //     rawAction === GameAction.CASHOUT ||
  //     rawAction === GameAction.GET_GAME_SESSION
  //   ) {
  //     // Event path does not emit responses for these; rely on ACK only
  //     this.logger.debug(
  //       `Event received for ${rawAction} from ${client.id}; deferring to ACK.`,
  //     );
  //     return;
  //   }
  //   if (knownPlaceholders.includes(rawAction as GameAction)) {
  //     const placeholder = this.gamePlayService.buildPlaceholder(
  //       rawAction,
  //       data?.payload,
  //     );
  //     this.logger.debug(
  //       `Placeholder action response -> ${rawAction} for client ${client.id}`,
  //     );
  //     client.emit(WS_EVENTS.GAME_SERVICE, placeholder);
  //     return;
  //   }

  //   this.logger.warn(
  //     `Unknown game action "${rawAction}" from client ${client.id}`,
  //   );
  //   client.emit(WS_EVENTS.GAME_SERVICE, {
  //     action: rawAction,
  //     status: ERROR_RESPONSES.UNSUPPORTED_ACTION,
  //   });
  // }

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

  /**
   * Manually send Socket.IO acknowledgement packet with specific callback ID
   * Socket.IO ack format: 43[callbackId, data]
   * This mimics sending the same ack twice with the same callback ID
   * Based on network traffic: 4325[{...}] = type 43 + callbackId 25 + data
   */
  private sendManualAck(sock: Socket, callbackId: number, data: any): void {
    try {
      // Method 1: Use Socket.IO's internal packet method (preferred)
      // @ts-ignore - accessing internal Socket.IO method
      if (sock.conn && typeof sock.conn.packet === 'function') {
        // @ts-ignore
        sock.conn.packet({
          type: 3, // ACK packet type
          id: callbackId,
          data: [data],
          nsp: sock.nsp.name,
        });
        this.logger.debug(`✅ Sent manual ack via conn.packet with callbackId: ${callbackId}`);
        return;
      }

      // Method 2: Use socket's packet method directly
      // @ts-ignore
      if (typeof sock.packet === 'function') {
        // @ts-ignore
        sock.packet({
          type: 3,
          id: callbackId,
          data: [data],
        });
        this.logger.debug(`✅ Sent manual ack via sock.packet with callbackId: ${callbackId}`);
        return;
      }

      // Method 3: Manually encode and send via engine (last resort)
      // @ts-ignore
      const engine = sock.conn?.transport?.socket || sock.conn?.transport?.ws || sock.conn?.transport;
      if (engine && typeof engine.send === 'function') {
        // Socket.IO ack format: 43[callbackId, data]
        // The format is: packet type (43) + callbackId + JSON array of data
        const packet = `43${callbackId}${JSON.stringify([data])}`;
        engine.send(packet);
        this.logger.debug(`✅ Sent manual ack via engine with callbackId: ${callbackId}`);
      } else {
        this.logger.error('❌ Could not find engine to send manual ack');
      }
    } catch (error) {
      this.logger.error(`❌ Failed to send manual ack: ${error}`);
    }
  }

  /**
   * Extract callback ID and packet method from ack function's closure
   * The ack function has 'id' and 'self' (socket) in its closure
   * We'll try to access them or use the ack function directly to send second packet
   */
  private extractAckInfo(ackFunction: Function): { id: number | null; packetMethod: any } {
    try {
      // Method 1: Try to access closure variables (id and self) from ack function
      // The ack function structure: function() { ... self.packet({ id: id, ... }) ... }
      // @ts-ignore - trying to access closure
      const ackString = ackFunction.toString();
      this.logger.debug(`Ack function structure: ${ackString.substring(0, 200)}...`);

      // Method 2: Check if ack function has properties set by Socket.IO
      // @ts-ignore
      if (ackFunction.id !== undefined) {
        // @ts-ignore
        return { id: ackFunction.id, packetMethod: null };
      }

      // Method 3: Try to extract from ack function's bound context
      // @ts-ignore
      if (ackFunction._id !== undefined) {
        // @ts-ignore
        return { id: ackFunction._id, packetMethod: null };
      }

      // Method 4: Create a wrapper that captures id and self before first call
      // We'll call the ack function in a try-catch and inspect what happens
      return { id: null, packetMethod: null };
    } catch (error) {
      this.logger.error(`Failed to extract ack info: ${error}`);
      return { id: null, packetMethod: null };
    }
  }

  /**
   * Extract callback ID from Socket.IO's internal state
   * The callback ID is stored when the client sends the event with ack callback
   */
  private extractCallbackId(sock: Socket, ackFunction: Function): number | null {
    try {
      // Method 1: Check socket's internal ack callbacks map
      // @ts-ignore - accessing internal Socket.IO properties
      const ackCallbacks = sock._callbacks || sock.ackCallbacks || (sock as any).acks || (sock as any)._acks;

      if (ackCallbacks && typeof ackCallbacks === 'object') {
        // Find the callback ID by matching the ack function
        for (const [id, callback] of Object.entries(ackCallbacks)) {
          if (callback === ackFunction) {
            const parsedId = parseInt(id as string, 10);
            this.logger.debug(`Found callback ID in ackCallbacks: ${parsedId}`);
            return parsedId;
          }
        }
      }

      // Method 2: Check socket's _ids map (Socket.IO stores callback IDs here)
      // @ts-ignore
      const ids = (sock as any)._ids || (sock as any).ids;
      if (ids && typeof ids === 'object') {
        // Try to find the ID by checking which one corresponds to our ack
        for (const [id, callback] of Object.entries(ids)) {
          if (callback === ackFunction) {
            return parseInt(id as string, 10);
          }
        }
      }

      // Method 3: Check if ack function has id property
      // @ts-ignore
      if (ackFunction.id !== undefined && typeof ackFunction.id === 'number') {
        // @ts-ignore
        return ackFunction.id;
      }

      this.logger.warn('Could not extract callback ID using standard methods');
      return null;
    } catch (error) {
      this.logger.error(`Failed to extract callback ID: ${error}`);
      return null;
    }
  }

  afterInit(server: Server) {
    // Start broadcasting last-win notifications
    this.lastWinBroadcasterService.startBroadcasting(server);

    server.on('connection', (sock: Socket) => {
      const ackHandler = (data: any, ack?: Function, ...rest: any[]) => {
        this.logger.log(`ACK handler called with data: ${JSON.stringify(data)} and ack function: ${ack}`);
        this.logger.log(`REST args: ${JSON.stringify(rest)}`);
        if (typeof ack !== 'function') return;

        const rawAction: string | undefined = data?.action;
        if (!rawAction) return ack({ error: ERROR_RESPONSES.MISSING_ACTION });

        if (rawAction === GameAction.GET_GAME_CONFIG) {
          this.gamePlayService
            .getGameConfigPayload()
            .then((payload) => {
              this.logger.log(`Returning game config (ACK) to ${sock.id}`);
              //from the payload delete the betConfig key and for decimalPlaces, return null
              const { betConfig, ...rest } = payload;
              ack({ ...rest });
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
          GameAction.GET_GAME_STATE
        ];

        if (rawAction === GameAction.BET) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;
          const gameMode: string | undefined = sock.data?.gameMode;
          if (!userId || !agentId || !gameMode) {
            this.logger.warn(
              `Bet action missing context: socket=${sock.id} userId=${userId} agentId=${agentId} gameMode=${gameMode}`,
            );
            return ack({
              error: ERROR_RESPONSES.MISSING_CONTEXT,
              details: { userId, agentId, gameMode },
            });
          }
          this.logger.debug(
            `Bet action received: socket=${sock.id} user=${userId} agent=${agentId} payload=${JSON.stringify(data?.payload)}`,
          );
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
                this.logger.log(
                  `Balance updated after bet: socket=${sock.id} user=${userId} balance=${walletBalance.balance} currency=${DEFAULT_CURRENCY}`,
                );
              } else {
                this.logger.warn(
                  `Bet failed - no balance update: socket=${sock.id} user=${userId} error=${resp.error}`,
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
            this.logger.warn(
              `Step action missing user/agent: socket=${sock.id} userId=${userId} agentId=${agentId}`,
            );
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          const lineNumber = Number(data?.payload?.lineNumber);
          if (!isFinite(lineNumber)) {
            this.logger.warn(
              `Invalid line number: socket=${sock.id} user=${userId} lineNumber=${data?.payload?.lineNumber}`,
            );
            return ack({ error: ERROR_RESPONSES.INVALID_LINE_NUMBER });
          }

          this.logger.debug(
            `Step action received: socket=${sock.id} user=${userId} agent=${agentId} lineNumber=${lineNumber}`,
          );
          this.gamePlayService
            .performStepFlow(userId, agentId, lineNumber)
            .then(async (r) => {
              if (!('error' in r) && r.isFinished) {
                const walletBalance = await this.singleWalletFunctionsService.getBalance(agentId, userId);
                const balanceEvent: BalanceEventPayload = {
                  currency: r.currency,
                  balance: walletBalance.balance.toString(),
                };
                sock.emit(WS_EVENTS.BALANCE_CHANGE, balanceEvent);
                ack(r);
                this.logger.log(
                  `Balance updated after step (finished): socket=${sock.id} user=${userId} balance=${walletBalance.balance} currency=${r.currency} endReason=${r.endReason || 'N/A'}`,
                );
              } else {
                ack(r);
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
            this.logger.warn(
              `Cashout action missing user/agent: socket=${sock.id} userId=${userId} agentId=${agentId}`,
            );
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          this.logger.debug(
            `Cashout action received: socket=${sock.id} user=${userId} agent=${agentId}`,
          );
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
                this.logger.log(
                  `Balance updated after cashout: socket=${sock.id} user=${userId} balance=${walletBalance.balance} currency=${DEFAULT_CURRENCY}`,
                );
              } else {
                this.logger.warn(
                  `Cashout failed - no balance update: socket=${sock.id} user=${userId} error=${r.error}`,
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

        if (rawAction === GameAction.GET_MY_BETS_HISTORY) {
          const userId: string | undefined = sock.data?.userId;
          const agentId: string | undefined = sock.data?.agentId;
          if (!userId || !agentId) {
            return ack({ error: ERROR_RESPONSES.MISSING_USER_OR_AGENT });
          }
          this.gamePlayService
            .getMyBetsHistory(userId, agentId)
            .then((bets) => ack(bets))
            .catch((e) => {
              this.logger.error(`Get bet history failed: ${e}`);
              ack({ error: 'get_bet_history_failed' });
            });
          return;
        }

        if (knownPlaceholders.includes(rawAction as GameAction)) {
          return ack(null);
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
