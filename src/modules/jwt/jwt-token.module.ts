import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameConfigModule } from '../gameConfig/game-config.module';
import { JwtTokenService } from './jwt-token.service';

@Module({
  imports: [GameConfigModule, JwtModule.register({})],
  providers: [JwtTokenService],
  exports: [JwtTokenService],
})
export class JwtTokenModule {}
