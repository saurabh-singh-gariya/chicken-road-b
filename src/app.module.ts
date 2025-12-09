import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';

import { User } from './entities/User.entity';
import { Agents } from './entities/agents.entity';
import { GameConfig } from './entities/game-config.entity';
import { Bet } from './entities/bet.entity';
import { WalletAudit } from './entities/wallet-audit.entity';
import { WalletRetryJob } from './entities/wallet-retry-job.entity';

import { AgentsModule } from './modules/agents/agents.module';
import { BetModule } from './modules/bet/bet.module';
import { BetCleanupSchedulerModule } from './modules/bet-cleanup/bet-cleanup-scheduler.module';
import { HazardModule } from './modules/hazard/hazard.module';
import { WalletErrorModule } from './modules/wallet-error/wallet-error.module';
import { WalletAuditModule } from './modules/wallet-audit/wallet-audit.module';
import { WalletRetryModule } from './modules/wallet-retry/wallet-retry.module';
import { CommonApiFunctionsModule } from './routes/common-api-functions/common-api-functions.module';
import { GameApiRoutesModule } from './routes/game-api-routes/game-api-routes.module';
import { GamePlayModule } from './routes/gamePlay/game-play.module';
import { SingleWalletFunctionsModule } from './routes/single-wallet-functions/single-wallet-functions.module';
import {HealthController} from './routes/extra/health.controller';

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
          entities: [User, Agents, GameConfig, Bet, WalletAudit, WalletRetryJob],
          // Connection pool optimization - CRITICAL BOTTLENECK FIX
          extra: {
            connectionLimit: parseInt(
              process.env.DB_CONNECTION_LIMIT || '30',
              10,
            ), // Default: 30 connections per pod (was 10)
            acquireTimeout: 60000, // 60 seconds to acquire connection
            timeout: 60000, // 60 seconds query timeout
            reconnect: true,
            // Enable connection pooling
            pool: {
              min: 5, // Minimum connections in pool
              max: parseInt(process.env.DB_CONNECTION_LIMIT || '30', 10), // Maximum connections
              idleTimeoutMillis: 30000, // Close idle connections after 30s
            },
          },
          // logging: ['error'] // optional, omit for compatibility
        };
        Logger.log(
          `Database config -> host=${cfgObj.host} port=${cfgObj.port} db=${cfgObj.database} sync=${cfgObj.synchronize}`,
        );
        return cfgObj;
      },
    }),
    TypeOrmModule.forFeature([User, GameConfig, Agents]),
    AgentsModule,
    HazardModule,
    BetModule,
    BetCleanupSchedulerModule,
    WalletErrorModule,
    WalletAuditModule,
    WalletRetryModule,
    CommonApiFunctionsModule,
    GameApiRoutesModule,
    GamePlayModule,
    SingleWalletFunctionsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
