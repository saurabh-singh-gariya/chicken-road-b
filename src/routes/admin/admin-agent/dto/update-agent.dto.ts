import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsBoolean, IsOptional, IsArray, IsUrl } from "class-validator";

export class UpdateAgentDto {
    @ApiProperty({ required: false, description: 'Certificate' })
    @IsOptional()
    @IsString()
    cert?: string;

    @ApiProperty({ required: false, description: 'Agent IP Address (use "*" for wildcard)' })
    @IsOptional()
    @IsString()
    agentIPaddress?: string;

    @ApiProperty({ required: false, description: 'Callback URL' })
    @IsOptional()
    @IsString()
    @IsUrl()
    callbackURL?: string;

    @ApiProperty({ required: false, description: 'Is Whitelisted' })
    @IsOptional()
    @IsBoolean()
    isWhitelisted?: boolean;

    @ApiProperty({ required: false, description: 'Currency' })
    @IsOptional()
    @IsString()
    currency?: string;

    @ApiProperty({ required: false, description: 'Allowed Game Codes', type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedGameCodes?: string[];
}

