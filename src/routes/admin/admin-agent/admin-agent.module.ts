import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { Bet } from "../../../entities/bet.entity";
import { Game } from "../../../entities/game.entity";
import { Agents } from "../../../entities/agents.entity";
import { Admin } from "../../../entities/admin.entity";
import { AdminAgentService } from "./admin-agent.service";
import { AdminAgentController } from "./admin-agent.controller";
import { AdminAuthGuard } from "../guards/admin-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { JwtTokenModule } from "../../../modules/jwt/jwt-token.module";

@Module({
    imports: [TypeOrmModule.forFeature([Bet, Game, Agents, Admin]), JwtTokenModule],
    controllers: [AdminAgentController],
    providers: [AdminAgentService, AdminAuthGuard, RolesGuard],
    exports: [AdminAgentService],
})
export class AdminAgentModule {}

