import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BetPayloadDto } from './bet-payload.dto';
import { StepPayloadDto } from './step-payload.dto';

export enum GameAction {
  BET = 'bet',
  STEP = 'step',
  CASHOUT = 'cashout',
  GET_GAME_SESSION = 'get_game_session',
  GET_GAME_CONFIG = 'get_game_config',
  GET_GAME_SEEDS = 'get_game_seeds',
  SET_USER_SEED = 'set_user_seed',
  REVEAL_SERVER_SEED = 'reveal_server_seed',
  ROTATE_SERVER_SEED = 'rotate_server_seed',
}

export class GameActionDto {
  @ApiProperty({
    enum: GameAction,
    example: GameAction.BET,
    description: 'Type of game action to perform',
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
      cashout: { value: undefined },
    },
  })
  payload?: BetPayloadDto | StepPayloadDto;
}
