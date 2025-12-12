import { ApiProperty } from "@nestjs/swagger";

export class BetFilterOptionsDto {
    @ApiProperty({ description: 'List of unique game codes/names', example: ['ChickenRoad', 'LuckyWheel', 'DiceGame'] })
    games: string[];

    @ApiProperty({ description: 'List of unique currencies', example: ['INR', 'USD'] })
    currencies: string[];

    @ApiProperty({ description: 'List of unique platforms from games table', example: ['SPADE', 'EVOLUTION', 'PRAGMATIC'] })
    platforms: string[];

    @ApiProperty({ description: 'List of unique agent IDs (Super Admin only)', example: ['agent001', 'agent002'], required: false })
    agentIds?: string[];
}

