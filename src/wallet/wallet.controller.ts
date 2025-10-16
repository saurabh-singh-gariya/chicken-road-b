import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DepositBalanceDto } from './dto/deposit-balance.dto';
import { WithdrawBalanceDto } from './dto/withdraw-balance.dto';
import { WalletService } from './wallet.service';

@Controller('/api/v1/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/balance')
  getBalance(@Query('userId') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Post('/deposit')
  deposit(@Body() depositDto: DepositBalanceDto) {
    return this.walletService.depositToWallet(
      depositDto.userId,
      depositDto.amount,
    );
  }

  @Post('/withdraw')
  withdraw(@Body() withdrawDto: WithdrawBalanceDto) {
    return this.walletService.withdrawFromWallet(
      withdrawDto.userId,
      withdrawDto.amount,
    );
  }
}
