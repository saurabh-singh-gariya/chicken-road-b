import { ApiProperty } from "@nestjs/swagger";

export class PlayerSummaryResponseDto {
    @ApiProperty({ description: 'Player ID' })
    playerId: string;

    @ApiProperty({ description: 'Platform' })
    platform: string;

    @ApiProperty({ description: 'Game name/code' })
    game: string;

    @ApiProperty({ example: 150, description: 'Total bet count for this player-platform-game combination' })
    betCount: number;

    @ApiProperty({ example: "15000.00", description: 'Total bet amount for this player-platform-game combination' })
    betAmount: string;

    @ApiProperty({ example: "-1350.00", description: 'Player Win/Loss (positive = company profit, negative = players won more)' })
    playerWinLoss: string;

    @ApiProperty({ example: "-1350.00", description: 'Total Win/Loss (same as playerWinLoss, adjustments not applied at player level)' })
    totalWinLoss: string;
}

