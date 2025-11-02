import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { BetPayloadDto } from './bet-payload.dto';
import { StepPayloadDto } from './step-payload.dto';

export enum GameAction {
  BET = 'BET',
  STEP = 'STEP',
  WITHDRAW = 'WITHDRAW', // renamed from CASHOUT
  // Legacy string kept for compatibility when parsing inbound payloads
  CASHOUT = 'CASHOUT',
  GET_GAME_SESSION = 'GET-GAME-SESSION',
  GET_GAME_CONFIG = 'GET-GAME-CONFIG',
  GET_GAME_SEEDS = 'GET-GAME-SEEDS',
  SET_USER_SEED = 'SET-USER-SEED',
  REVEAL_SERVER_SEED = 'REVEAL-SERVER-SEED',
  ROTATE_SERVER_SEED = 'ROTATE-SERVER-SEED',
}

export class GameActionDto {
  @ApiProperty({
    enum: GameAction,
    example: GameAction.BET,
    description: 'Type of game action to perform',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const upper = value.toUpperCase();
    // Map legacy / lowercase synonyms to canonical enum members
    switch (upper) {
      case 'CASHOUT':
        return GameAction.WITHDRAW; // unify
      case 'WITHDRAW':
        return GameAction.WITHDRAW;
      case 'BET':
        return GameAction.BET;
      case 'STEP':
        return GameAction.STEP;
      case 'GET_GAME_SESSION':
        return GameAction.GET_GAME_SESSION;
      case 'GET_GAME_CONFIG':
        return GameAction.GET_GAME_CONFIG;
      case 'GET_GAME_SEEDS':
        return GameAction.GET_GAME_SEEDS;
      case 'SET_USER_SEED':
        return GameAction.SET_USER_SEED;
      case 'REVEAL_SERVER_SEED':
        return GameAction.REVEAL_SERVER_SEED;
      case 'ROTATE_SERVER_SEED':
        return GameAction.ROTATE_SERVER_SEED;
      default:
        return upper; // let enum validation fail if unknown
    }
  })
  @IsEnum(GameAction)
  action: GameAction;

  @ApiProperty({
    description:
      'Action-specific payload. Required for bet and step actions; omitted for other actions.',
    required: false,
    oneOf: [
      { $ref: '#/components/schemas/BetPayloadDto' },
      { $ref: '#/components/schemas/StepPayloadDto' },
    ],
    examples: {
      bet: {
        value: { betAmount: 500, difficulty: 'medium' },
      },
      step: { value: { lineNumber: 3 } },
      withdraw: { value: undefined },
    },
  })
  payload?: BetPayloadDto | StepPayloadDto;
}
