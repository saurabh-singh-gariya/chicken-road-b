import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { WsJwtAuthGuard } from '../auth/ws-jwt-auth.guard';
import { GameConfigService } from '../gameConfig/game-config.service';
import { BetPayloadDto } from './dto/bet-payload.dto';
import { GameAction, GameActionDto } from './dto/game-action.dto';
import { StepPayloadDto } from './dto/step-payload.dto';
import { GameService } from './game.service';

@WebSocketGateway({ namespace: 'game', cors: true })
@UseGuards(WsJwtAuthGuard)
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(GameGateway.name);

  constructor(
    private readonly gameService: GameService,
    private readonly gameConfigService: GameConfigService,
    private readonly jwt: JwtService,
  ) {}

  handleConnection(client: Socket) {
    // Attempt to read payload attached by guard
    let auth = (client.data as any)?.auth;
    if (!auth?.sub) {
      // Fallback: try to extract token manually (in case guard wasn't invoked before connection event)
      const token = this.extractToken(client);
      if (token) {
        try {
          auth = this.jwt.verify(token);
          (client.data ||= {}).auth = auth;
        } catch (e) {
          this.logger.warn(
            `Token verification failed on fallback for ${client.id}`,
          );
        }
      }
    }
    if (!auth?.sub) {
      this.logger.warn(`Connection missing auth sub: ${client.id}`);
      client.disconnect();
      return;
    }
    const betConfig = this.sendInitialData();
    client.emit('betConfig', betConfig);
    this.logger.log(`Client connected: ${client.id} (sub=${auth.sub})`);
  }

  private extractToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const authObj: any = client.handshake.auth;
    if (authObj?.token)
      return Array.isArray(authObj.token) ? authObj.token[0] : authObj.token;
    const q: any = client.handshake.query;
    if (q?.token) return Array.isArray(q.token) ? q.token[0] : q.token;
    return undefined;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private sendInitialData() {
    const betConfig = {
      minBet: 100,
      maxBet: 1000,
      defaultBet: 500,
    };

    return {
      betConfig,
    };
  }

  @SubscribeMessage('game-service')
  async handleGameEvent(
    @MessageBody() data: GameActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    const auth = (client.data as any)?.auth;
    const userId = auth?.sub as string | undefined;
    if (!userId) {
      this.logger.warn(
        `Game event without authenticated subject: ${client.id}`,
      );
      return;
    }

    try {
      // await validateOrReject(data);
      let response;
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
          break;
        }

        default:
          response = { error: 'Unknown action' };
          break;
      }

      client.emit('game-service', response);
    } catch (err) {
      this.logger.error(`Validation failed: ${err}`);
      const errorMessage =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : String(err);
      client.emit('game-service', { error: errorMessage });
    }
  }
}
