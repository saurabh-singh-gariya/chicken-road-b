import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly enableAuth: boolean;

  constructor(
    private readonly jwt: JwtService,
    cfg: ConfigService,
  ) {
    this.enableAuth = cfg.get<boolean>('app.enableAuth') ?? true;
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    if (!this.enableAuth) {
      (client.data ||= {}).auth = { sub: 'anonymous', anonymous: true };
      return true;
    }
    const token = this.extractToken(client);
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = this.jwt.verify(token);
      (client.data ||= {}).auth = payload;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
      }
      if (
        /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+$/.test(
          authHeader.trim(),
        )
      ) {
        return authHeader.trim();
      }
    }
    const authObj: any = client.handshake.auth;
    if (authObj?.token) {
      if (Array.isArray(authObj.token)) return authObj.token[0];
      return authObj.token;
    }
    const q: any = client.handshake.query;
    if (q?.token) return Array.isArray(q.token) ? q.token[0] : q.token;
    if (q?.Authorization)
      return Array.isArray(q.Authorization)
        ? q.Authorization[0]
        : q.Authorization;
    return undefined;
  }
}
