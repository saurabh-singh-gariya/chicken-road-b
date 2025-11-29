import { Module } from '@nestjs/common';
import { AgentAuthGuard } from '../../auth/agent-auth.guard';
import { AgentsModule } from '../../modules/agents/agents.module';
import { GameConfigModule } from '../../modules/gameConfig/game-config.module';
import { JwtTokenModule } from '../../modules/jwt/jwt-token.module';
import { UserModule } from '../../modules/user/user.module';
import { UserSessionModule } from '../../modules/user-session/user-session.module';
import { CommonApiFunctionsController } from './common-api-functions.controller';
import { CommonApiFunctionsService } from './common-api-functions.service';

@Module({
  imports: [AgentsModule, GameConfigModule, UserModule, JwtTokenModule, UserSessionModule],
  controllers: [CommonApiFunctionsController],
  providers: [CommonApiFunctionsService, AgentAuthGuard],
  exports: [],
})
export class CommonApiFunctionsModule {}
