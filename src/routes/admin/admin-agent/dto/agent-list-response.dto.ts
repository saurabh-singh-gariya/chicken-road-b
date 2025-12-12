import { ApiProperty } from "@nestjs/swagger";

export class AgentListResponseDto {
    @ApiProperty({ description: 'Agent ID' })
    agentId: string;

    @ApiProperty({ description: 'Certificate' })
    cert: string;

    @ApiProperty({ description: 'Agent IP Address' })
    agentIPaddress: string;

    @ApiProperty({ description: 'Callback URL' })
    callbackURL: string;

    @ApiProperty({ description: 'Is Whitelisted' })
    isWhitelisted: boolean;

    @ApiProperty({ description: 'Currency', required: false })
    currency?: string;

    @ApiProperty({ description: 'Allowed Game Codes', type: [String], required: false })
    allowedGameCodes?: string[];

    @ApiProperty({ description: 'Created At' })
    createdAt: string;

    @ApiProperty({ description: 'Updated At' })
    updatedAt: string;
}

