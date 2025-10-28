import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
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
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';
import { DatabaseSeedService } from './scripts/database-seed.service';
import { TransactionModule } from './transaction/transaction.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { WellKnownController } from './well-known.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): TypeOrmModuleOptions => {
        interface DatabaseConfig {
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
          synchronize: boolean;
        }
        const dbConfig = cfg.get<DatabaseConfig>('database');
        const cfgObj: TypeOrmModuleOptions = {
          type: 'mysql',
          host: dbConfig?.host,
          port: dbConfig?.port,
          username: dbConfig?.username,
          password: dbConfig?.password,
          database: dbConfig?.database,
          synchronize: dbConfig?.synchronize,
          autoLoadEntities: true,
          // logging: ['error'] // optional, omit for compatibility
        };
        Logger.log(
          `Database config -> host=${cfgObj.host} port=${cfgObj.port} db=${cfgObj.database} sync=${cfgObj.synchronize}`,
        );
        return cfgObj;
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
    UserModule,
    GameConfigModule,
    GameModule,
    TransactionModule,
    AuthModule,
  ],
  controllers: [AppController, HealthController, WellKnownController],
  providers: [AppService, DatabaseSeedService],
})
export class AppModule {}
