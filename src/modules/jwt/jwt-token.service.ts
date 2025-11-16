import { Injectable } from '@nestjs/common';
import { JwtService, JwtVerifyOptions } from '@nestjs/jwt';
import { GameConfigService } from '../gameConfig/game-config.service';

export interface UserTokenPayload {
  sub: string;
  agentId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly gameConfigService: GameConfigService,
  ) {}

  async signUserToken(
    userId: string,
    agentId: string,
    ttlSeconds = 3600,
  ): Promise<string> {
    const secret = await this.gameConfigService.getJwtSecret();
    const payload: UserTokenPayload = {
      sub: userId,
      agentId,
      iat: Math.floor(Date.now() / 1000),
    };
    return this.jwtService.sign(payload, {
      secret,
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
    });
  }

  async verifyToken<T extends object = any>(
    token: string,
  ): Promise<UserTokenPayload & T> {
    const secret = await this.gameConfigService.getJwtSecret();
    const options: JwtVerifyOptions = { secret, algorithms: ['HS256'] };
    return this.jwtService.verify<UserTokenPayload & T>(token, options);
  }

  async signGenericToken(
    payload: Record<string, any>,
    ttlSeconds = 900,
  ): Promise<string> {
    const secret = await this.gameConfigService.getJwtSecret();
    const base: Record<string, any> = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    };
    return this.jwtService.sign(base, {
      secret,
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
    });
  }
}
