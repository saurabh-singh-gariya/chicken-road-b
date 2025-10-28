import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameConfigModule } from '../gameConfig/game-config.module';
import { RedisModule } from '../redis/redis.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ProvablyFairService } from './provably-fair.service';

@Module({
  imports: [
    RedisModule,
    GameConfigModule,
    AuthModule,
    WalletModule,
    TransactionModule,
    UserModule,
  ],
  providers: [GameService, GameGateway, ProvablyFairService],
  exports: [GameService, GameGateway, ProvablyFairService],
})
export class GameModule {}
