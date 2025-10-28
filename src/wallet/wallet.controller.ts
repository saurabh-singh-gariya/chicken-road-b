import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { DepositBalanceDto } from './dto/deposit-balance.dto';
import { WithdrawBalanceDto } from './dto/withdraw-balance.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('/api/v1/wallet')
@Public() // TEMP: remove when auth enforced
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/balance')
  @ApiOperation({ summary: 'Get wallet balance by userId' })
  @ApiResponse({
    status: 200,
    description: 'Balance fetched',
    schema: { example: { currency: 'USD', balance: 1000 } },
  })
  getBalance(@Query('userId') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Post('/deposit')
  @ApiOperation({ summary: 'Deposit amount to wallet' })
  @ApiResponse({
    status: 201,
    description: 'Deposit success',
    schema: { example: { currency: 'USD', balance: 1500 } },
  })
  deposit(@Body() depositDto: DepositBalanceDto) {
    return this.walletService.depositToWallet(
      depositDto.userId,
      depositDto.amount,
    );
  }

  @Post('/withdraw')
  @ApiOperation({ summary: 'Withdraw amount from wallet' })
  @ApiResponse({
    status: 201,
    description: 'Withdraw success',
    schema: { example: { currency: 'USD', balance: 750 } },
  })
  withdraw(@Body() withdrawDto: WithdrawBalanceDto) {
    return this.walletService.withdrawFromWallet(
      withdrawDto.userId,
      withdrawDto.amount,
    );
  }
}
