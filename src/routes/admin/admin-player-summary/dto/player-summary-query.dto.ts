import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsNumber, Min, Max, IsString, IsDateString } from "class-validator";

export class PlayerSummaryQueryDto {
    @ApiProperty({ required: false, example: 1, description: "Page number" })
    @Type(() => Number)
    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number;

    @ApiProperty({ required: false, example: 20, description: "Items per page (max 100)" })
    @Type(() => Number)
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiProperty({ required: false, example: "user123", description: "Filter by player ID" })
    @IsOptional()
    @IsString()
    playerId?: string;

    @ApiProperty({ required: false, example: "SPADE", description: "Filter by platform" })
    @IsOptional()
    @IsString()
    platform?: string;

    @ApiProperty({ required: false, example: "ChickenRoad", description: "Filter by game name/code" })
    @IsOptional()
    @IsString()
    game?: string;

    @ApiProperty({ required: false, example: "agent001", description: "Filter by agent ID" })
    @IsOptional()
    @IsString()
    agentId?: string;

    @ApiProperty({ required: true, example: "2024-01-01T00:00:00Z", description: "Filter from date (ISO string)" })
    @IsDateString()
    fromDate: string;

    @ApiProperty({ required: true, example: "2024-12-31T23:59:59Z", description: "Filter to date (ISO string)" })
    @IsDateString()
    toDate: string;
}

