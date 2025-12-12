import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateUserDto {
    @ApiProperty({ description: 'User ID', example: 'user123' })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ description: 'Agent ID', example: 'agent123' })
    @IsString()
    @IsNotEmpty()
    agentId: string;

    @ApiProperty({ description: 'Currency', example: 'USD' })
    @IsString()
    @IsNotEmpty()
    currency: string;

    @ApiProperty({ description: 'Bet limit', example: '1000' })
    @IsString()
    @IsNotEmpty()
    betLimit: string;

    @ApiProperty({ description: 'Username', example: 'John Doe' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiProperty({ description: 'Language', example: 'en' })
    @IsString()
    @IsOptional()
    language?: string;

    @ApiProperty({ description: 'Password', example: 'password' })
    @IsString()
    @IsOptional()
    password?: string;
    
    @ApiProperty({ description: 'Avatar', example: 'https://example.com/avatar.png' })
    @IsString()
    @IsOptional()
    avatar?: string;
}