import { ApiProperty } from "@nestjs/swagger";

export class PlayerSummaryTotalsDto {
    @ApiProperty({ example: 1000, description: 'Unique count of players (not row count)' })
    totalPlayers: number;

    @ApiProperty({ example: 50000, description: 'Total bet count across all filtered players' })
    totalBetCount: number;

    @ApiProperty({ example: "5000000.00", description: 'Total bet amount across all filtered players' })
    totalBetAmount: string;

    @ApiProperty({ example: "-450000.00", description: 'Total Player Win/Loss across all filtered players' })
    totalPlayerWinLoss: string;

    @ApiProperty({ example: "-450000.00", description: 'Total Win/Loss (same as totalPlayerWinLoss)' })
    totalWinLoss: string;
}

