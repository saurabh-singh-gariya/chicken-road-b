import { ApiProperty } from "@nestjs/swagger";

export class PlayerSummaryFilterOptionsDto {
    @ApiProperty({ description: 'Distinct game codes', type: [String] })
    games: string[];

    @ApiProperty({ description: 'Distinct platforms', type: [String] })
    platforms: string[];

    @ApiProperty({ description: 'Distinct agent IDs (Super Admin only)', type: [String], required: false })
    agentIds?: string[];
}

