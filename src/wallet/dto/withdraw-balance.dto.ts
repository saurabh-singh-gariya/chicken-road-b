import { IsNotEmpty, IsNumber } from 'class-validator';
import { IsPositive } from 'class-validator/types/decorator/number/IsPositive';
import { IsString } from 'class-validator/types/decorator/typechecker/IsString';

export class WithdrawBalanceDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  //number should be positive
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  amount: number;
}
