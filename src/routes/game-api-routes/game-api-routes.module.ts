import { Module } from '@nestjs/common';
import { JwtTokenModule } from '../../modules/jwt/jwt-token.module';
import { UserSessionModule } from '../../modules/user-session/user-session.module';
import { GameModule } from '../../modules/games/game.module';
import { GameApiRoutesController } from './game-api-routes.controller';
import { GameApiRoutesService } from './game-api-routes.service';

@Module({
  imports: [JwtTokenModule, UserSessionModule, GameModule],
  controllers: [GameApiRoutesController],
  providers: [GameApiRoutesService],
  exports: [GameApiRoutesService],
})
export class GameApiRoutesModule {}
