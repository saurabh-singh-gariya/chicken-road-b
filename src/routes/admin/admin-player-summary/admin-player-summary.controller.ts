import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminPlayerSummaryService } from './admin-player-summary.service';
import { PlayerSummaryQueryDto } from './dto/player-summary-query.dto';
import { PlayerSummaryResponseDto } from './dto/player-summary-response.dto';
import { PlayerSummaryTotalsDto } from './dto/player-summary-totals.dto';
import { PlayerSummaryFilterOptionsDto } from './dto/player-summary-filter-options.dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { AdminRole } from '../../../entities/admin.entity';
import { CurrentAdmin } from '../admin-auth/decorators/admin-auth.decorator';
import type { AdminTokenPayload } from '../admin-auth/admin-auth.service';

@ApiTags('Admin - Player Summary')
@Controller('admin/api/v1/player-summary')
@UseGuards(AdminAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminPlayerSummaryController {
    constructor(private readonly adminPlayerSummaryService: AdminPlayerSummaryService) {}

    @Get()
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get player statistics grouped by player-platform-game' })
    @ApiResponse({
        status: 200,
        description: 'Player statistics retrieved successfully',
        type: [PlayerSummaryResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    async findAll(
        @Query() queryDto: PlayerSummaryQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const result = await this.adminPlayerSummaryService.findAll(
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
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get player summary totals across all matching records' })
    @ApiResponse({
        status: 200,
        description: 'Player summary totals retrieved successfully',
        type: PlayerSummaryTotalsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    async getTotals(
        @Query() queryDto: PlayerSummaryQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const totals = await this.adminPlayerSummaryService.getTotals(
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
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get distinct filter options (games, platforms, agentIds)' })
    @ApiResponse({
        status: 200,
        description: 'Filter options retrieved successfully',
        type: PlayerSummaryFilterOptionsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    async getFilterOptions(
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const options = await this.adminPlayerSummaryService.getFilterOptions(
            admin.role,
            admin.agentId,
        );

        return {
            status: '0000',
            data: options,
        };
    }
}

