import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateUserDto {

    @ApiProperty({ description: 'Username', example: 'John Doe' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiProperty({ description: 'Bet limit', example: '1000' })
    @IsString()
    @IsOptional()
    betLimit?: string;

    @ApiProperty({ description: 'Currency', example: 'USD' })
    @IsString()
    @IsOptional()
    currency?: string;

    @ApiProperty({ description: 'Language', example: 'en' })
    @IsString()
    @IsOptional()
    language?: string;

    @ApiProperty({ description: 'Avatar', example: 'https://example.com/avatar.png' })
    @IsString()
    @IsOptional()
    avatar?: string;
}