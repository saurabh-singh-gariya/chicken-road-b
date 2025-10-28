import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../entities/admin.entity';
import { User } from '../entities/User.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([Admin, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const jwtCfg = cfg.get('jwt') as
          | { secret: string; expiresIn: string }
          | undefined;
        const expiresRaw = jwtCfg?.expiresIn ?? '3600';
        // Accept numeric seconds or duration string like '1h'. If pure digits, convert to number.
        const expiresIn: any = /^\d+$/.test(expiresRaw)
          ? parseInt(expiresRaw, 10)
          : expiresRaw;
        return {
          secret: jwtCfg?.secret || 'CHANGE_ME_DEV_SECRET',
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, WsJwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, WsJwtAuthGuard, JwtModule],
})
export class AuthModule {}
