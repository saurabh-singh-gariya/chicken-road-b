import { Module } from '@nestjs/common';
import { JwtTokenModule } from '../../modules/jwt/jwt-token.module';
import { UserSessionModule } from '../../modules/user-session/user-session.module';
import { GameApiRoutesController } from './game-api-routes.controller';
import { GameApiRoutesService } from './game-api-routes.service';

@Module({
  imports: [JwtTokenModule, UserSessionModule],
  controllers: [GameApiRoutesController],
  providers: [GameApiRoutesService],
  exports: [GameApiRoutesService],
})
export class GameApiRoutesModule {}
