import { Controller, Get, Query, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { AdminBetService } from "./admin-bet.service";
import { type AdminTokenPayload } from "../admin-auth/admin-auth.service";
import { AdminAuthGuard } from "../guards/admin-auth.guard";
import { AgentAccessGuard } from "../guards/agent-access.guard";
import { CurrentAdmin } from "../admin-auth/decorators/admin-auth.decorator";
import { BetQueryDto } from "./dto/bet-query.dto";
import { BetTotalsDto } from "./dto/bet-totals.dto";
import { BetResponseDto } from "./dto/bet-response.dto";
import { BetFilterOptionsDto } from "./dto/bet-filter-options.dto";

@ApiTags('Admin Bets')
@Controller('admin/api/v1/bets')
@UseGuards(AdminAuthGuard, AgentAccessGuard)
@ApiBearerAuth()
export class AdminBetController {
    constructor(private readonly adminBetService: AdminBetService) { }

    @Get()
    @ApiOperation({ summary: 'List bets with filters and pagination' })
    @ApiResponse({ 
        status: 200, 
        description: 'Bets retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                status: { type: 'string', example: '0000' },
                data: {
                    type: 'object',
                    properties: {
                        bets: { type: 'array', items: { type: 'object' } },
                        pagination: {
                            type: 'object',
                            properties: {
                                page: { type: 'number' },
                                limit: { type: 'number' },
                                total: { type: 'number' },
                                totalPages: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async findAll(
        @Query() queryDto: BetQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const result = await this.adminBetService.findAll(
            queryDto,
            admin.role,
            admin.agentId,
        );

        return {
            status: '0000',
            data: result,
        };
    }

    @Get('totals')
    @ApiOperation({ summary: 'Get bet totals for all filtered records' })
    @ApiResponse({ 
        status: 200, 
        description: 'Bet totals retrieved successfully',
        type: BetTotalsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getTotals(
        @Query() queryDto: BetQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const totals = await this.adminBetService.getTotals(
            queryDto,
            admin.role,
            admin.agentId,
        );

        return {
            status: '0000',
            data: totals,
        };
    }

    @Get('filter-options')
    @ApiOperation({ summary: 'Get distinct filter options (games, currencies, agentIds)' })
    @ApiResponse({ 
        status: 200, 
        description: 'Filter options retrieved successfully',
        type: BetFilterOptionsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getFilterOptions(
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const options = await this.adminBetService.getFilterOptions(
            admin.role,
            admin.agentId,
        );

        return {
            status: '0000',
            data: options,
        };
    }

    @Get(':betId')
    @ApiOperation({ summary: 'Get bet details by ID' })
    @ApiParam({ name: 'betId', description: 'Bet ID' })
    @ApiResponse({ 
        status: 200, 
        description: 'Bet retrieved successfully',
        type: BetResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Bet not found' })
    async findOne(
        @Param('betId') betId: string,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const bet = await this.adminBetService.findOne(
            betId,
            admin.role,
            admin.agentId,
        );

        return {
            status: '0000',
            data: { bet },
        };
    }
}

