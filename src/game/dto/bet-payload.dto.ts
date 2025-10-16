import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXTREME = 'extreme',
}

export class BetPayloadDto {
  @IsNumber()
  @IsNotEmpty()
  betAmount: number;

  @IsEnum(Difficulty)
  @IsNotEmpty()
  difficulty: Difficulty;
}
