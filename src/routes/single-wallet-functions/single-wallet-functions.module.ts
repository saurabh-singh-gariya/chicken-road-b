import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { AgentsModule } from '../../modules/agents/agents.module';
import { BetModule } from '../../modules/bet/bet.module';
import { GameConfigModule } from '../../modules/gameConfig/game-config.module';
import { RedisModule } from '../../modules/redis/redis.module';
import { WalletAuditModule } from '../../modules/wallet-audit/wallet-audit.module';
import { WalletRetryModule } from '../../modules/wallet-retry/wallet-retry.module';
import { SingleWalletFunctionsService } from './single-wallet-functions.service';

@Module({
  imports: [
    HttpModule,
    AgentsModule,
    BetModule,
    GameConfigModule,
    RedisModule,
    forwardRef(() => WalletAuditModule),
    forwardRef(() => WalletRetryModule),
  ],
  controllers: [],
  providers: [SingleWalletFunctionsService],
  exports: [SingleWalletFunctionsService],
})
export class SingleWalletFunctionsModule {}
