import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AgentsModule } from '../../modules/agents/agents.module';
import { SingleWalletFunctionsService } from './single-wallet-functions.service';

@Module({
  imports: [HttpModule, AgentsModule],
  controllers: [],
  providers: [SingleWalletFunctionsService],
  exports: [SingleWalletFunctionsService],
})
export class SingleWalletFunctionsModule {}
