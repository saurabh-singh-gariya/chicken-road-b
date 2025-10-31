import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { GameConfigService } from '../gameConfig/game-config.service';

export interface JwtPayload {
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly gameConfig: GameConfigService,
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (_request, rawJwt, done) => {
        try {
          const secret = await this.gameConfig.getJwtSecret();
          done(null, secret);
        } catch (e) {
          done(e as any, null);
        }
      },
    });
  }

  async validate(payload: JwtPayload): Promise<Admin | any> {
    const enableAuth = this.config.get<boolean>('app.enableAuth') ?? true;
    if (!enableAuth) {
      return { id: 'anonymous', username: 'anonymous', anonymous: true };
    }
    const admin = await this.adminRepo.findOne({ where: { id: payload.sub } });
    if (!admin) throw new UnauthorizedException('Invalid token subject');
    return admin; // attached to request.user
  }
}
