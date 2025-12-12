import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { Bet } from "../../../entities/bet.entity";
import { Game } from "../../../entities/game.entity";
import { AdminBetService } from "./admin-bet.service";
import { AdminBetController } from "./admin-bet.controller";
import { AdminAuthGuard } from "../guards/admin-auth.guard";
import { AgentAccessGuard } from "../guards/agent-access.guard";
import { JwtTokenModule } from "../../../modules/jwt/jwt-token.module";

@Module({
    imports: [TypeOrmModule.forFeature([Bet, Game]),JwtTokenModule],
    controllers: [AdminBetController],
    providers: [AdminBetService, AdminAuthGuard, AgentAccessGuard],
    exports: [AdminBetService],
})
export class AdminBetModule { }

