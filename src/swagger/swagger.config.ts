import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterAdminDto } from '../auth/dto/register-admin.dto';
import { BetPayloadDto } from '../game/dto/bet-payload.dto';
// Legacy DTO imports trimmed; withdraw replaces cashout in socket actions
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
      type: 'implicit-test-user',
      note: 'Server currently binds first user automatically (TEST MODE). Authorization token optional until real auth enabled.',
    },
    queryParameters: {
      gameMode: {
        type: 'string',
        description: 'Difficulty preset: EASY | MEDIUM | HARD | DAREDEVIL',
        required: true,
        example: 'EASY',
      },
      operatorId: {
        type: 'string',
        description: 'Operator / tenant id',
        required: true,
        example: 'operator1',
      },
      Authorization: {
        type: 'string',
        description:
          'JWT (optional in test mode). Sent as query for simplicity.',
        required: false,
      },
    },
    eventModel: {
      name: 'gameService',
      description:
        'Single multiplexed channel. Client emits { action, payload? }. If a callback is supplied, server returns bare ACK payload (array/object) with no event wrapper; otherwise server emits named events (game-state, gameService, onBalanceChange).',
      ackBehavior: {
        request:
          'socket.emit(\'gameService\', { action: \"STEP\", payload:{ lineNumber: 1 } }, (resp)=>...)',
        responseExamples: [
          {
            action: 'BET',
            request: {
              action: 'BET',
              payload: { betAmount: '1', difficulty: 'EASY' },
            },
            ack: [
              {
                isFinished: false,
                currency: 'USD',
                betAmount: '1.000000000',
                coeff: '1',
                winAmount: '1.00',
                difficulty: 'EASY',
                lineNumber: -1,
              },
            ],
          },
          {
            action: 'STEP',
            request: { action: 'STEP', payload: { lineNumber: 0 } },
            ack: [
              {
                isFinished: false,
                currency: 'USD',
                betAmount: '1.000000000',
                coeff: '1.03',
                winAmount: '1.03',
                difficulty: 'EASY',
                lineNumber: 0,
              },
            ],
          },
          {
            action: 'WITHDRAW',
            request: { action: 'WITHDRAW' },
            ack: { status: 'ok' },
          },
          {
            action: 'GET_GAME_SESSION',
            request: { action: 'GET_GAME_SESSION' },
            ack: {
              currentStep: 0,
              betAmount: '1.000000000',
              multiplier: '1.03',
            },
          },
        ],
      },
      actions: [
        {
          action: 'BET',
          legacy: ['bet'],
          requiresPayload: true,
          payloadSchema: '#/components/schemas/BetPayloadDto',
          ackResponse:
            'Step-like object (single object) with fields: isFinished,currency,betAmount,coeff,winAmount,difficulty,lineNumber,(optional)collisionPositions,isWin',
          eventMode: {
            emits: ['game-state', 'onBalanceChange (if balance changed)'],
          },
          errors: ['NO_USER', 'ValidationError', 'InsufficientBalance'],
        },
        {
          action: 'STEP',
          legacy: ['step'],
          requiresPayload: true,
          payloadSchema: '#/components/schemas/StepPayloadDto',
          ackResponse:
            'Step-like object (same shape as BET ack). If finished, may trigger onBalanceChange.',
          eventMode: { emits: ['game-state', 'onBalanceChange (if finished)'] },
          errors: [
            'NO_USER',
            'ValidationError',
            'NO_ACTIVE_SESSION',
            'ALREADY_FINISHED',
          ],
        },
        {
          action: 'WITHDRAW',
          legacy: ['CASHOUT', 'cashout', 'withdraw'],
          requiresPayload: false,
          ackResponse:
            'Either step-like object (if session ends in winning state) OR { status:"ok" } / { error }',
          eventMode: { emits: ['gameService', 'onBalanceChange'] },
          errors: ['NO_ACTIVE_SESSION', 'ALREADY_FINISHED'],
        },
        {
          action: 'GET_GAME_SESSION',
          legacy: ['GET_GAME_SESSION', 'get_game_session', 'GET-GAME-SESSION'],
          requiresPayload: false,
          ackResponse: 'Active session raw object or null',
          eventMode: { emits: ['gameService'] },
        },
        {
          action: 'GET_GAME_CONFIG',
          legacy: ['GET_GAME_CONFIG', 'get_game_config', 'GET-GAME-CONFIG'],
          requiresPayload: false,
          ackResponse: 'Raw config object',
          eventMode: { emits: ['gameService'] },
        },
        {
          action: 'GET_GAME_SEEDS',
          legacy: ['GET_GAME_SEEDS', 'get_game_seeds', 'GET-GAME-SEEDS'],
          requiresPayload: false,
          ackResponse:
            '{ userSeed, currentServerSeedHash, nextServerSeedHash, nonce }',
          eventMode: { emits: ['gameService'] },
        },
        {
          action: 'SET_USER_SEED',
          legacy: ['SET_USER_SEED', 'set_user_seed', 'SET-USER-SEED'],
          requiresPayload: true,
          payloadSchema: '{ userSeed?: string }',
          ackResponse:
            '{ userSeed, currentServerSeedHash, nextServerSeedHash, nonce }',
          eventMode: { emits: ['gameService'] },
          notes: 'If userSeed omitted server generates one',
        },
        {
          action: 'REVEAL_SERVER_SEED',
          legacy: [
            'REVEAL_SERVER_SEED',
            'reveal_server_seed',
            'REVEAL-SERVER-SEED',
          ],
          requiresPayload: false,
          ackResponse: '{ userSeed, serverSeed, serverSeedHash, finalNonce }',
          eventMode: { emits: ['gameService'] },
          notes: 'Use before rotating to verify fairness',
        },
        {
          action: 'ROTATE_SERVER_SEED',
          legacy: [
            'ROTATE_SERVER_SEED',
            'rotate_server_seed',
            'ROTATE-SERVER-SEED',
          ],
          requiresPayload: false,
          ackResponse:
            '{ currentServerSeedHash, nextServerSeedHash, roundsCount }',
          eventMode: { emits: ['gameService'] },
          notes:
            'Advances to next server seed; increments optional roundsCount',
        },
      ],
      serverEvents: [
        { name: 'onBalanceChange', when: 'After BET/STEP finish/WITHDRAW' },
        {
          name: 'game-state',
          when: 'Emitted only for STEP/BET without callback (event mode)',
        },
        { name: 'gameService', when: 'Non-step actions without callback' },
        { name: 'betConfig', when: 'On connect (initial config)' },
        { name: 'betsRanges', when: 'On connect (initial ranges)' },
        {
          name: 'connection-error',
          when: 'On missing gameMode/operatorId or auth problems',
        },
      ],
      errorFormat: {
        description:
          'Errors delivered either as ACK object { error: CODE | message } or event payload { error } on gameService channel.',
        examples: [
          {
            scenario: 'Unknown action',
            ack: { error: 'ACK_UNSUPPORTED_ACTION', action: 'FOO' },
          },
          {
            scenario: 'Validation failure',
            ack: { error: 'lineNumber must be a number' },
          },
        ],
      },
      legacy: {
        inboundAliases: ['game-service'],
        actionCase:
          'Case-insensitive; kebab_case / snake_case mapped to canonical UPPER with dashes as stored in enum.',
      },
    },
  };

  (document.paths ||= {})['/io'] = {
    get: {
      tags: ['game'],
      summary: 'Socket.IO endpoint (documentation only)',
      description:
        'This is NOT an HTTP call. Establish a WebSocket connection to ws://<host>/io with query ?gameMode=EASY&operatorId=operator1. Then emit events as documented under x-websocket.eventModel.',
      responses: { 101: { description: 'Upgraded to WebSocket (conceptual)' } },
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
