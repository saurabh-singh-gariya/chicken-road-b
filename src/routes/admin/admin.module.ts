import { Module } from '@nestjs/common';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminBetModule } from './admin-bet/admin-bet.module';
import { AdminAgentModule } from './admin-agent/admin-agent.module';
import { AdminPlayerSummaryModule } from './admin-player-summary/admin-player-summary.module';
// import { AdminUserModule } from './admin-user/admin-user.module'; // Uncomment when available
// Import other admin modules here as they are created
// import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
// import { AdminConfigModule } from './admin-config/admin-config.module';

/**
 * Consolidated Admin Module
 * Imports all admin sub-modules for cleaner app.module.ts organization
 */
@Module({
    imports: [
        AdminAuthModule,
        AdminBetModule,
        // AdminUserModule, // Uncomment when available
        AdminAgentModule,
        AdminPlayerSummaryModule,
        // Add other admin modules here as they are created
        // AdminDashboardModule,
        // AdminConfigModule,
    ],
    exports: [
        AdminAuthModule,
        AdminBetModule,
        // AdminUserModule, // Uncomment when available
        AdminAgentModule,
        AdminPlayerSummaryModule,
        // Export other admin modules here
    ],
})
export class AdminModule {}
