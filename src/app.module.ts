import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { Admin } from './entities/admin.entity';
import { GameConfig } from './entities/game-config.entity';
import { GameHistory } from './entities/game-history.entity';
import { GameSession } from './entities/game-session.entity';
import { TransactionHistory } from './entities/transaction-history.entity';
import { User } from './entities/User.entity';
import { Wallet } from './entities/Wallet.entity';
import { GameModule } from './game/game.module';
import { GameConfigModule } from './gameConfig/game-config.module';
import { RedisModule } from './redis/redis.module';
import { TransactionModule } from './transaction/transaction.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        interface DatabaseConfig {
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
          synchronize: boolean;
        }
        const dbConfig = cfg.get<DatabaseConfig>('database');
        return {
          type: 'mysql',
          host: dbConfig?.host,
          port: dbConfig?.port,
          username: dbConfig?.username,
          password: dbConfig?.password,
          database: dbConfig?.database,
          synchronize: dbConfig?.synchronize,
          autoLoadEntities: true,
          logging: ['error'],
        };
      },
    }),
    TypeOrmModule.forFeature([
      GameConfig,
      User,
      GameSession,
      GameHistory,
      Wallet,
      TransactionHistory,
      Admin,
    ]),
    RedisModule,
    WalletModule,
    GameConfigModule,
    GameModule,
    TransactionModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
