import { IsEnum } from 'class-validator';

export enum GameAction {
  BET = 'bet',
  STEP = 'step',
  CASHOUT = 'cashout',
  GET_ACTIVE_SESSION = 'get_active_session',
}
export class GameActionDto {
  @IsEnum(GameAction)
  action: GameAction;
  payload: any;
}
