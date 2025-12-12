import { ApiProperty } from "@nestjs/swagger";

export class AgentTotalsDto {
    @ApiProperty({ example: 50000, description: "Total bet count across all matching records" })
    totalBetCount: number;

    @ApiProperty({ example: "5000000.00", description: "Total bet amount across all matching records" })
    totalBetAmount: string;

    @ApiProperty({ example: "-450000.00", description: "Total win/loss across all matching records" })
    totalWinLoss: string;

    @ApiProperty({ example: 9.0, description: "Overall margin percentage" })
    totalMarginPercent: number;

    @ApiProperty({ example: "500000.00", description: "Company total win/loss across all matching records" })
    companyTotalWinLoss: string;
}

