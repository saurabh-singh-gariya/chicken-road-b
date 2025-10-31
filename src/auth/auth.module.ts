import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../entities/admin.entity';
import { User } from '../entities/User.entity';
import { GameConfigModule } from '../gameConfig/game-config.module';
import { GameConfigService } from '../gameConfig/game-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    GameConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([Admin, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule, GameConfigModule],
      inject: [ConfigService, GameConfigService],
      useFactory: async (cfg: ConfigService, gc: GameConfigService) => {
        const jwtCfg = cfg.get('jwt') as
          | { secret: string; expiresIn: string }
          | undefined;
        const expiresRaw = jwtCfg?.expiresIn ?? '3600';
        const expiresIn: any = /^\d+$/.test(expiresRaw)
          ? parseInt(expiresRaw, 10)
          : expiresRaw;
        const secret = await gc.getJwtSecret();
        return {
          secret,
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
