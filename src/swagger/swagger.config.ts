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
      'REST and WebSocket API documentation. WebSocket events are described via the x-websocket extension. Use bearer JWT for secured endpoints; some endpoints may be temporarily public depending on configuration.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Supply the access token returned by /auth/token or /auth/player/login. Either use `Bearer <token>` or raw token for WebSocket connection (see x-websocket).',
      },
      'access-token',
    )
    .addTag('auth')
    .addTag('wallet')
    .addTag('health')
    .addTag('app')
    .addTag('game')
    .addTag('user')
    .addServer('http://localhost:3000', 'Local HTTP')
    .addServer('ws://localhost:3000/io', 'Local WebSocket (Socket.IO path)')
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

  // Vendor extension for websocket events (consumed by custom UI logic or future plugin)
  (document as any)['x-websocket'] = {
    transport: 'socket.io',
    path: '/io/',
    namespace: null,
    authentication: {
      type: 'bearer-or-raw-jwt',
      location:
        'Authorization header (Bearer <token> or raw token) OR handshake auth.token OR query parameters ?token=<jwt> / ?Authorization=<jwt>',
      format: 'JWT',
    },
    queryParameters: {
      gameMode: {
        type: 'string',
        description: 'Game mode identifier (e.g. chicken-road)',
      },
      operatorId: {
        type: 'string',
        description: 'External operator identifier / tenant id',
      },
      Authorization: {
        type: 'string',
        description: 'JWT token if not using header or auth object',
      },
    },
    events: [
      {
        name: 'betConfig',
        direction: 'server->client',
        description:
          'Initial betting limits/config sent once after authentication.',
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
          'Multiplexed event for all game actions; client emits GameActionDto, server responds with action-specific object or error.',
        payload: { $ref: '#/components/schemas/GameActionDto' },
        examples: {
          bet: {
            value: {
              action: 'bet',
              payload: { betAmount: 500, difficulty: 'medium' },
            },
          },
          step: {
            value: { action: 'step', payload: { lineNumber: 3 } },
          },
          cashout: { value: { action: 'cashout' } },
          getSession: { value: { action: 'get_game_session' } },
          getConfig: { value: { action: 'get_game_config' } },
        },
        actions: [
          {
            action: 'bet',
            description:
              'Place a bet with betAmount (number) & difficulty enum',
            payload: { $ref: '#/components/schemas/BetPayloadDto' },
          },
          {
            action: 'step',
            description:
              'Advance to the provided lineNumber in current session',
            payload: { $ref: '#/components/schemas/StepPayloadDto' },
          },
          {
            action: 'cashout',
            description: 'Attempt to cash out current session winnings',
          },
          {
            action: 'get_game_session',
            description: 'Retrieve current active session state if any',
          },
          {
            action: 'get_game_config',
            description: 'Fetch public game configuration/meta data',
          },
        ],
      },
    ],
  };

  (document.paths ||= {})['/io'] = {
    post: {
      tags: ['game'],
      summary: 'Emit game-service event (documentation only)',
      description:
        'Send Socket.IO event "game-service" with a JSON body matching GameActionDto. Do NOT call via HTTP. Examples cover bet, step, cashout, get_game_session, get_game_config.',
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
              step: { value: { action: 'step', payload: { lineNumber: 2 } } },
              cashout: { value: { action: 'cashout' } },
              getSession: { value: { action: 'get_game_session' } },
              getConfig: { value: { action: 'get_game_config' } },
            },
          },
        },
      },
      responses: {
        200: {
          description:
            'Action-specific response (varies). Errors returned as { error }.',
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
