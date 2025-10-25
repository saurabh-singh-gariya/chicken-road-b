import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum GameAction {
  BET = 'bet',
  STEP = 'step',
  CASHOUT = 'cashout',
  GET_ACTIVE_SESSION = 'get_active_session',
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
    description: 'Action-specific payload. Shape depends on the action chosen.',
    examples: {
      bet: { betAmount: 500, difficulty: 'medium' },
      step: { lineNumber: 3 },
      cashout: {},
      get_active_session: {},
    },
  })
  payload: any;
}
