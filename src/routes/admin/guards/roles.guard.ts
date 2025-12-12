import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "../../../entities/admin.entity";

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * Usage: @Roles(AdminRole.SUPER_ADMIN)
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            // No roles specified, allow access
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const admin = request.admin;

        if (!admin) {
            throw new ForbiddenException('Admin not authenticated');
        }

        const hasRole = requiredRoles.some((role) => admin.role === role);
        
        if (!hasRole) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}

