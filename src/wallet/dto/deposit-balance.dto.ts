import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class DepositBalanceDto {
  @ApiProperty({
    example: 'user-123',
    description: 'Identifier of the user whose wallet will be credited',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  //number should be positive
  @ApiProperty({ example: 500, description: 'Positive amount to deposit' })
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  amount: number;
}
