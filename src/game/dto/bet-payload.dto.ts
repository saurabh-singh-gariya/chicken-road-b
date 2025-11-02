import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  DAREDEVIL = 'DAREDEVIL',
}

export class BetPayloadDto {
  @ApiProperty({
    example: 500,
    description: 'Amount of the bet placed by the user',
  })
  @IsString()
  @IsNotEmpty()
  betAmount: string;

  @ApiProperty({
    enum: Difficulty,
    example: Difficulty.MEDIUM,
    description: 'Selected difficulty level impacting odds/payout',
  })
  @IsEnum(Difficulty)
  @IsNotEmpty()
  difficulty: Difficulty;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code for the bet amount',
  })
  currencyCode?: string;

  @ApiProperty({
    example: 'US',
    description: 'Country code of the user placing the bet',
  })
  countryCode?: string;
}
