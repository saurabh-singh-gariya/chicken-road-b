import { IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";


//Add @Type(() => Number) for numeric fields
export class UserQueryDto {
   @ApiProperty({ description: 'Page number', example: 1 , default: 1})
   @IsNumber()
   @IsOptional()
   @Type(() => Number)
   @Min(1)
   page?: number;

   @ApiProperty({ description: 'Limit number', example: 10 , default: 10})
   @IsNumber()
   @IsOptional()
   @Type(() => Number)
   @Max(100)
   limit?: number;

   @ApiProperty({ description: 'Agent ID', example: 'agent123' })
   @IsString()
   @IsOptional()
   agentId?: string;

   @ApiProperty({ description: 'Currency', example: 'USD' })
   @IsString()
   @IsOptional()
   currency?: string;

   @ApiProperty({ description: 'Search', example: 'search' })
   @IsString()
   @IsOptional()
   search?: string;

   @ApiProperty({ description: 'Created from', example: '2021-01-01' })
   @IsString()
   @IsOptional()
   createdFrom?: string;

   @ApiProperty({ description: 'Created to', example: '2021-01-01' })
   @IsString()
   @IsOptional()
   createdTo?: string;
}