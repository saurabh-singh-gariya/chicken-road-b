import { ApiProperty } from "@nestjs/swagger";

/**
 * Agent statistics response DTO
 * Represents aggregated statistics for a unique agent-platform-game combination
 */
export class AgentResponseDto {
    @ApiProperty({ description: 'Agent ID' })
    agentId: string;

    @ApiProperty({ description: 'Platform' })
    platform: string;

    @ApiProperty({ description: 'Game name' })
    game: string;

    @ApiProperty({ description: 'Total bet count' })
    betCount: number;

    @ApiProperty({ description: 'Total bet amount' })
    betAmount: string;

    @ApiProperty({ description: 'Win/Loss (positive = company profit, negative = players won more)' })
    winLoss: string;

    @ApiProperty({ description: 'Adjustment (always 0.00 for now)', example: "0.00" })
    adjustment: string;

    @ApiProperty({ description: 'Total Win/Loss (winLoss + adjustment)' })
    totalWinLoss: string;

    @ApiProperty({ description: 'Margin percentage: ((Bet Amount - Win Amount) / Bet Amount) * 100' })
    marginPercent: number;

    @ApiProperty({ description: 'Company Total Win/Loss (Bet Amount - Win Amount)' })
    companyTotalWinLoss: string;

    @ApiProperty({ description: 'Agent certificate (hidden)', required: false })
    cert?: string;

    @ApiProperty({ description: 'Agent IP address', required: false })
    agentIPaddress?: string;

    @ApiProperty({ description: 'Callback URL', required: false })
    callbackURL?: string;

    @ApiProperty({ description: 'Is whitelisted', required: false })
    isWhitelisted?: boolean;

    @ApiProperty({ description: 'Created at', required: false })
    createdAt?: string;

    @ApiProperty({ description: 'Updated at', required: false })
    updatedAt?: string;
}

