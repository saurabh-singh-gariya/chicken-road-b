import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

interface AnonymousAdmin {
  id: string;
  username: string;
  anonymous: true;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly enableAuth: boolean;

  constructor(
    private readonly reflector: Reflector,
    cfg: ConfigService,
  ) {
    super();
    this.enableAuth = cfg.get<boolean>('app.enableAuth') ?? true;
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!this.enableAuth) {
      const req = context.switchToHttp().getRequest();
      if (req && !req.user) {
        const anon: AnonymousAdmin = {
          id: 'anonymous',
          username: 'anonymous',
          anonymous: true,
        };
        req.user = anon;
      }
      return true;
    }
    return super.canActivate(context);
  }
}
