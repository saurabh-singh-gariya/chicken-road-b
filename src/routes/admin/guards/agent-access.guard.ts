import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AdminRole } from "../../../entities/admin.entity";

/**
 * Guard to ensure Agent Admins can only access their own agent's data.
 * 
 * This guard should be used on routes that have agentId in params or body.
 * It automatically filters access based on the admin's role:
 * - SUPER_ADMIN: Can access any agent's data
 * - ADMIN (Agent Admin): Can only access their own agentId (which is their username)
 * 
 * Usage:
 * @UseGuards(AdminAuthGuard, AgentAccessGuard)
 * @Get('users/:agentId')
 * async getUsers(@Param('agentId') agentId: string) { ... }
 */
@Injectable()
export class AgentAccessGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const admin = request.admin;

        if (!admin) {
            throw new ForbiddenException('Admin not authenticated');
        }

        // Super Admin can access everything
        if (admin.role === AdminRole.SUPER_ADMIN) {
            return true;
        }

        // For Agent Admin, agentId = username
        const adminAgentId = admin.agentId || admin.username;

        // Check agentId in route params
        const paramAgentId = request.params?.agentId;
        if (paramAgentId && paramAgentId !== adminAgentId) {
            throw new ForbiddenException('Access denied: Cannot access other agent\'s data');
        }

        // Check agentId in query params
        const queryAgentId = request.query?.agentId;
        if (queryAgentId && queryAgentId !== adminAgentId) {
            throw new ForbiddenException('Access denied: Cannot access other agent\'s data');
        }

        // Check agentId in request body (for create/update operations)
        const bodyAgentId = request.body?.agentId;
        if (bodyAgentId && bodyAgentId !== adminAgentId) {
            throw new ForbiddenException('Access denied: Cannot create/update users for other agents');
        }

        // If no agentId specified, Agent Admin should only see their own data
        // This will be handled in the service layer by filtering queries
        return true;
    }
}

