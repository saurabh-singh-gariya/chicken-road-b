import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { DepositBalanceDto } from './dto/deposit-balance.dto';
import { WithdrawBalanceDto } from './dto/withdraw-balance.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('/api/v1/wallet')
@Public()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/balance')
  @ApiOperation({ summary: 'Get wallet balance by userId (temporary public)' })
  getBalance(@Query('userId') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Post('/deposit')
  @ApiOperation({ summary: 'Deposit amount to wallet (temporary public)' })
  deposit(@Body() depositDto: DepositBalanceDto) {
    return this.walletService.depositToWallet(
      depositDto.userId,
      depositDto.amount,
    );
  }

  @Post('/withdraw')
  @ApiOperation({ summary: 'Withdraw amount from wallet (temporary public)' })
  withdraw(@Body() withdrawDto: WithdrawBalanceDto) {
    return this.walletService.withdrawFromWallet(
      withdrawDto.userId,
      withdrawDto.amount,
    );
  }
}
