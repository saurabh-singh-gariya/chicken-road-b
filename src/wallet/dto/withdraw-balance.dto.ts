import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class WithdrawBalanceDto {
  @ApiProperty({
    example: 'user-123',
    description: 'Identifier of the user whose wallet will be debited',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  //number should be positive
  @ApiProperty({ example: 250, description: 'Positive amount to withdraw' })
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  amount: number;
}
