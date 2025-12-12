import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Bet } from "../../../entities/bet.entity";
import { Game } from "../../../entities/game.entity";
import { AdminPlayerSummaryService } from "./admin-player-summary.service";
import { AdminPlayerSummaryController } from "./admin-player-summary.controller";
import { AdminAuthGuard } from "../guards/admin-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { JwtTokenModule } from "../../../modules/jwt/jwt-token.module";

@Module({
    imports: [TypeOrmModule.forFeature([Bet, Game]), JwtTokenModule],
    controllers: [AdminPlayerSummaryController],
    providers: [AdminPlayerSummaryService, AdminAuthGuard, RolesGuard],
    exports: [AdminPlayerSummaryService],
})
export class AdminPlayerSummaryModule {}

