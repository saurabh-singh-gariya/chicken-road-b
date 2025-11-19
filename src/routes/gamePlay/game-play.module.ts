import { Module } from '@nestjs/common';
import { AgentsModule } from '../../modules/agents/agents.module';
import { BetModule } from '../../modules/bet/bet.module';
import { GameConfigModule } from '../../modules/gameConfig/game-config.module';
import { HazardModule } from '../../modules/hazard/hazard.module';
import { JwtTokenModule } from '../../modules/jwt/jwt-token.module';
import { LastWinModule } from '../../modules/last-win/last-win.module';
import { RedisModule } from '../../modules/redis/redis.module';
import { WalletErrorModule } from '../../modules/wallet-error/wallet-error.module';
import { SingleWalletFunctionsModule } from '../single-wallet-functions/single-wallet-functions.module';
import { GamePlayGateway } from './game-play.gateway';
import { GamePlayService } from './game-play.service';
import { UserModule } from '../../modules/user/user.module';

@Module({
  imports: [
    JwtTokenModule,
    GameConfigModule,
    RedisModule,
    AgentsModule,
    BetModule,
    HazardModule,
    SingleWalletFunctionsModule,
    UserModule,
    WalletErrorModule,
    LastWinModule,
  ],
  providers: [GamePlayGateway, GamePlayService],
  exports: [GamePlayGateway, GamePlayService],
})
export class GamePlayModule {}
