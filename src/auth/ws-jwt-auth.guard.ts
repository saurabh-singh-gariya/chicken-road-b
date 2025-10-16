import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = this.jwt.verify(token);
      // Attach to client for later use
      (client.data ||= {}).auth = payload;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    // Priority: header Authorization, then query.token
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    // Next: Socket.IO auth payload (client side: io(url, { auth: { token } }))
    const authObj: any = client.handshake.auth;
    if (authObj?.token) {
      if (Array.isArray(authObj.token)) return authObj.token[0];
      return authObj.token;
    }
    const q: any = client.handshake.query;
    if (q?.token) return Array.isArray(q.token) ? q.token[0] : q.token;
    return undefined;
  }
}
