import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AgentsModule } from '../../modules/agents/agents.module';
import { GameConfigModule } from '../../modules/gameConfig/game-config.module';
import { RedisModule } from '../../modules/redis/redis.module';
import { WalletErrorModule } from '../../modules/wallet-error/wallet-error.module';
import { SingleWalletFunctionsService } from './single-wallet-functions.service';

@Module({
  imports: [HttpModule, AgentsModule, GameConfigModule, RedisModule, WalletErrorModule],
  controllers: [],
  providers: [SingleWalletFunctionsService],
  exports: [SingleWalletFunctionsService],
})
export class SingleWalletFunctionsModule {}
