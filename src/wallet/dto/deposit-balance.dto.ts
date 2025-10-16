import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class DepositBalanceDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  //number should be positive
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  amount: number;
}
