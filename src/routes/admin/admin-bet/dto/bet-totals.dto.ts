import { ApiProperty } from "@nestjs/swagger";

export class BetTotalsDto {
    @ApiProperty({ example: 500, description: "Total number of bets" })
    totalBets: number;

    @ApiProperty({ example: "50000.00", description: "Total bet amount" })
    totalBetAmount: string;

    @ApiProperty({ example: "45000.00", description: "Total win amount" })
    totalWinAmount: string;

    @ApiProperty({ example: "5000.00", description: "Net revenue (bet amount - win amount)" })
    netRevenue: string;
}

