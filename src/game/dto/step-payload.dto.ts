import { IsNotEmpty, IsNumber } from 'class-validator';

export class StepPayloadDto {
  @IsNumber()
  @IsNotEmpty()
  lineNumber: number;
}
