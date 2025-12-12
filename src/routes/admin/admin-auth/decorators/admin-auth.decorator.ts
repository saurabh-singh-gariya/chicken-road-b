import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Decorator to extract the current admin from the request.
 * 
 * The admin is attached to the request by AdminAuthGuard.
 * 
 * Usage:
 * ```typescript
 * @Get('profile')
 * async getProfile(@CurrentAdmin() admin: AdminTokenPayload) {
 *   return admin;
 * }
 * ```
 */
export const CurrentAdmin = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.admin;
    },
);

