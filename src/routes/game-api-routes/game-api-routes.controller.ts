import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthLoginDto, AuthLoginResponse } from './DTO/auth-login.dto';
import { OnlineCounterResponse } from './DTO/online-counter.dto';
import { GameApiRoutesService } from './game-api-routes.service';

@ApiTags('game-api')
@Controller('api')
export class GameApiRoutesController {
  constructor(private readonly service: GameApiRoutesService) {}

  @Post('auth')
  async authenticate(@Body() body: AuthLoginDto): Promise<AuthLoginResponse> {
    return this.service.authenticateGame(body);
  }

  @Get('online-counter/v1/data')
  async getOnlineCounter(
    @Headers('authorization') authorization: string,
  ): Promise<OnlineCounterResponse> {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authorization.substring(7);
    return this.service.getOnlineCounter(token);
  }

  @Get('games')
  async getActiveGames(): Promise<Array<{ gameCode: string; gameName: string; isActive: boolean }>> {
    return this.service.getActiveGames();
  }
}
