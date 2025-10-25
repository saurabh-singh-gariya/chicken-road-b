import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXTREME = 'extreme',
}

export class BetPayloadDto {
  @ApiProperty({
    example: 500,
    description: 'Amount of the bet placed by the user',
  })
  @IsNumber()
  @IsNotEmpty()
  betAmount: number;

  @ApiProperty({
    enum: Difficulty,
    example: Difficulty.MEDIUM,
    description: 'Selected difficulty level impacting odds/payout',
  })
  @IsEnum(Difficulty)
  @IsNotEmpty()
  difficulty: Difficulty;
}
