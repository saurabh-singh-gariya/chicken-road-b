import { Controller, Get, Query, UseGuards, Patch, Param, Body, Delete, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AdminAgentService } from './admin-agent.service';
import { AgentQueryDto } from './dto/agent-query.dto';
import { AgentResponseDto } from './dto/agent-response.dto';
import { AgentTotalsDto } from './dto/agent-totals.dto';
import { AgentFilterOptionsDto } from './dto/agent-filter-options.dto';
import { AgentListResponseDto } from './dto/agent-list-response.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { AdminRole } from '../../../entities/admin.entity';
import { CurrentAdmin } from '../admin-auth/decorators/admin-auth.decorator';
import type { AdminTokenPayload } from '../admin-auth/admin-auth.service';

@ApiTags('Admin - Agent Statistics')
@Controller('admin/api/v1/agents')
@UseGuards(AdminAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminAgentController {
    constructor(private readonly adminAgentService: AdminAgentService) {}

    @Get()
    @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
    @ApiOperation({ summary: 'Get agent statistics grouped by agent-platform-game' })
    @ApiResponse({
        status: 200,
        description: 'Agent statistics retrieved successfully',
        type: [AgentResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getAgents(
        @Query() queryDto: AgentQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        // For Agent Admin, force filter to their own agentId
        const adminAgentId = admin.role === AdminRole.SUPER_ADMIN ? null : (admin.agentId || admin.username);
        const result = await this.adminAgentService.findAll(queryDto, adminAgentId);
        return {
            status: '0000',
            data: result,
        };
    }

    @Get('totals')
    @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
    @ApiOperation({ summary: 'Get agent totals across all matching records' })
    @ApiResponse({
        status: 200,
        description: 'Agent totals retrieved successfully',
        type: AgentTotalsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getAgentTotals(
        @Query() queryDto: AgentQueryDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        // For Agent Admin, force filter to their own agentId
        const adminAgentId = admin.role === AdminRole.SUPER_ADMIN ? null : (admin.agentId || admin.username);
        const totals = await this.adminAgentService.getTotals(queryDto, adminAgentId);
        return {
            status: '0000',
            data: totals,
        };
    }

    @Get('filter-options')
    @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
    @ApiOperation({ summary: 'Get distinct filter options (games, platforms, agentIds)' })
    @ApiResponse({
        status: 200,
        description: 'Filter options retrieved successfully',
        type: AgentFilterOptionsDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getFilterOptions(
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        // For Agent Admin, pass their agentId to filter options
        const adminAgentId = admin.role === AdminRole.SUPER_ADMIN ? null : (admin.agentId || admin.username);
        const options = await this.adminAgentService.getFilterOptions(
            admin.role,
            adminAgentId,
        );

        return {
            status: '0000',
            data: options,
        };
    }

    @Get('list')
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get all agents (for agent management page)' })
    @ApiResponse({
        status: 200,
        description: 'Agents retrieved successfully',
        type: [AgentListResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    async getAllAgents() {
        const agents = await this.adminAgentService.findAllAgents();
        return {
            status: '0000',
            data: agents,
        };
    }

    @Get('list/:agentId')
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get single agent by ID' })
    @ApiParam({ name: 'agentId', description: 'Agent ID' })
    @ApiResponse({
        status: 200,
        description: 'Agent retrieved successfully',
        type: AgentListResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    @ApiResponse({ status: 404, description: 'Agent not found' })
    async getAgent(@Param('agentId') agentId: string) {
        const agent = await this.adminAgentService.findOneAgent(agentId);
        return {
            status: '0000',
            data: agent,
        };
    }

    @Patch('list/:agentId')
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Update agent details' })
    @ApiParam({ name: 'agentId', description: 'Agent ID' })
    @ApiResponse({
        status: 200,
        description: 'Agent updated successfully',
        type: AgentListResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    @ApiResponse({ status: 404, description: 'Agent not found' })
    async updateAgent(
        @Param('agentId') agentId: string,
        @Body() updateDto: UpdateAgentDto,
        @CurrentAdmin() admin: AdminTokenPayload,
    ) {
        const agent = await this.adminAgentService.updateAgent(
            agentId,
            updateDto,
            admin.username, // Use username as identifier for updatedBy
        );
        return {
            status: '0000',
            data: agent,
        };
    }

    @Post('list')
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Create a new agent and associated admin account' })
    @ApiResponse({
        status: 201,
        description: 'Agent created successfully',
        type: AgentListResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    @ApiResponse({ status: 409, description: 'Conflict - Agent ID or username already exists' })
    async createAgent(@Body() createDto: CreateAgentDto) {
        const agent = await this.adminAgentService.createAgent(createDto);
        return {
            status: '0000',
            data: agent,
            message: 'Agent created successfully',
        };
    }

    @Delete('list/:agentId')
    @Roles(AdminRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Delete agent' })
    @ApiParam({ name: 'agentId', description: 'Agent ID' })
    @ApiResponse({
        status: 200,
        description: 'Agent deleted successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
    @ApiResponse({ status: 404, description: 'Agent not found' })
    async deleteAgent(@Param('agentId') agentId: string) {
        await this.adminAgentService.deleteAgent(agentId);
        return {
            status: '0000',
            message: 'Agent deleted successfully',
        };
    }
}

