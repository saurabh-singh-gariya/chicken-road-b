import { Module } from '@nestjs/common';
import { GameConfigModule } from 'src/gameConfig/game-config.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { TransactionModule } from '../transaction/transaction.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [
    RedisModule,
    GameConfigModule,
    AuthModule,
    WalletModule,
    TransactionModule,
  ],
  providers: [GameService, GameGateway],
  exports: [GameService, GameGateway],
})
export class GameModule {}
