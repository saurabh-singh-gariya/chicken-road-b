import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterAdminDto } from '../auth/dto/register-admin.dto';
import { BetPayloadDto } from '../game/dto/bet-payload.dto';
import { CashoutPayloadDto } from '../game/dto/cashout-paylod.dto';
import { GameActionDto } from '../game/dto/game-action.dto';
import { StepPayloadDto } from '../game/dto/step-payload.dto';
import { DepositBalanceDto } from '../wallet/dto/deposit-balance.dto';
import { WithdrawBalanceDto } from '../wallet/dto/withdraw-balance.dto';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Chicken Road API')
    .setDescription(
      'REST and WebSocket API documentation. WebSocket events are described via the x-websocket extension. (Auth temporarily disabled for wallet/game.)',
    )
    .setVersion('1.0.0')
    .addTag('auth')
    .addTag('wallet')
    .addTag('health')
    .addTag('app')
    .addTag('game')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      BetPayloadDto,
      StepPayloadDto,
      GameActionDto,
      CashoutPayloadDto,
      DepositBalanceDto,
      WithdrawBalanceDto,
      LoginDto,
      RegisterAdminDto,
    ],
  });

  // Vendor extension for websocket events
  (document as any)['x-websocket'] = {
    transport: 'socket.io',
    namespace: 'game',
    authentication: {
      type: 'bearer',
      location: 'Authorization header or handshake auth.token / query.token',
      format: 'JWT',
    },
    events: [
      {
        name: 'betConfig',
        direction: 'server->client',
        description:
          'Initial bet configuration emitted after successful connection.',
        payload: {
          type: 'object',
          properties: {
            betConfig: {
              type: 'object',
              properties: {
                minBet: { type: 'number', example: 100 },
                maxBet: { type: 'number', example: 1000 },
                defaultBet: { type: 'number', example: 500 },
              },
            },
          },
        },
      },
      {
        name: 'game-service',
        direction: 'bidirectional',
        description:
          'Single multiplexed event for all game actions. Client emits GameActionDto; server responds on same event with an action-specific response or error.',
        payload: { $ref: '#/components/schemas/GameActionDto' },
        actions: [
          {
            action: 'bet',
            description: 'Place a bet with betAmount and difficulty',
            payload: { $ref: '#/components/schemas/BetPayloadDto' },
          },
          {
            action: 'step',
            description:
              'Advance to the next line number in an active session.',
            payload: { $ref: '#/components/schemas/StepPayloadDto' },
          },
          {
            action: 'cashout',
            description: 'Attempt to cash out current session winnings.',
            payload: { $ref: '#/components/schemas/CashoutPayloadDto' },
          },
          {
            action: 'get_active_session',
            description: 'Retrieve the active game session state if any.',
          },
        ],
      },
    ],
  };

  // Synthetic path to surface websocket actions directly in UI (since vendor extensions not rendered by default)
  (document.paths ||= {})['/ws/game'] = {
    post: {
      tags: ['game'],
      summary: 'Send a game action over WebSocket (documentation shim)',
      description:
        'This is a documentation-only endpoint representing the Socket.IO `game-service` event. Use a WS client; do not call via HTTP. Payload conforms to GameActionDto.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GameActionDto' },
            examples: {
              bet: {
                value: {
                  action: 'bet',
                  payload: { betAmount: 500, difficulty: 'medium' },
                },
              },
              step: {
                value: { action: 'step', payload: { lineNumber: 2 } },
              },
              cashout: { value: { action: 'cashout', payload: {} } },
              getActive: {
                value: { action: 'get_active_session', payload: {} },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description:
            'Action-specific response (varies by server logic). For errors, an object with { error }.',
        },
      },
    },
  } as any;

  SwaggerModule.setup('/api/swagger', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
    },
    customSiteTitle: 'Chicken Road API Docs',
  });
}
