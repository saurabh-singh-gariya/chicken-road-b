import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsBoolean, IsOptional, IsArray, IsUrl, IsNotEmpty, MinLength, Matches, MaxLength } from "class-validator";

export class CreateAgentDto {
    @ApiProperty({ description: 'Agent ID (alphanumeric, max 20 characters)', example: 'agent001' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    @Matches(/^[a-zA-Z0-9]+$/, { message: 'Agent ID must contain only alphanumeric characters' })
    agentId: string;

    @ApiProperty({ description: 'Certificate', example: 'secret_cert' })
    @IsString()
    @IsNotEmpty()
    cert: string;

    @ApiProperty({ description: 'Agent IP Address (use "*" for wildcard)', example: '192.168.1.100' })
    @IsString()
    @IsNotEmpty()
    agentIPaddress: string;

    @ApiProperty({ description: 'Callback URL', example: 'https://example.com/callback' })
    @IsString()
    @IsNotEmpty()
    @IsUrl()
    callbackURL: string;

    @ApiProperty({ description: 'Currency', example: 'INR', default: 'INR' })
    @IsString()
    @IsNotEmpty()
    currency: string;

    @ApiProperty({ description: 'Is Whitelisted (Active)', example: true, default: true })
    @IsBoolean()
    @IsOptional()
    isWhitelisted?: boolean;

    @ApiProperty({ description: 'Allowed Game Codes', type: [String], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedGameCodes?: string[];

    @ApiProperty({ description: 'Password for admin account (min 8 characters)', example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password: string;
}

