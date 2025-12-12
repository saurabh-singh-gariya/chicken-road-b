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
import { WalletAuditModule } from './modules/wallet-audit/wallet-audit.module';
import { WalletRetryModule } from './modules/wallet-retry/wallet-retry.module';
import { CommonApiFunctionsModule } from './routes/common-api-functions/common-api-functions.module';
import { GameApiRoutesModule } from './routes/game-api-routes/game-api-routes.module';
import { GamePlayModule } from './routes/gamePlay/game-play.module';
import { SingleWalletFunctionsModule } from './routes/single-wallet-functions/single-wallet-functions.module';
import { HealthController } from './routes/extra/health.controller';
import { Game } from './entities/game.entity';
import { GameModule } from './modules/games/game.module';
import { AppController } from './app.controller';
import { Admin } from './entities/admin.entity';
import { AdminModule } from './routes/admin/admin.module';
import { RefundSchedulerModule } from './modules/refund-scheduler/refund-scheduler.module';

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
          entities: [User, Agents, GameConfig, Bet, WalletAudit, WalletRetryJob, Game, Admin],
          extra: {
            // Valid MySQL2 connection pool options for TypeORM
            connectionLimit: parseInt(
              process.env.DB_CONNECTION_LIMIT || '30',
              10,
            )
          },
        };
        Logger.log(
          `Database config -> host=${cfgObj.host} port=${cfgObj.port} db=${cfgObj.database} sync=${cfgObj.synchronize}`,
        );
        return cfgObj;
      },
    }),
    TypeOrmModule.forFeature([User, GameConfig, Agents, Game]),
    AgentsModule,
    HazardModule,
    BetModule,
    BetCleanupSchedulerModule,
    RefundSchedulerModule,
    WalletAuditModule,
    WalletRetryModule,
    CommonApiFunctionsModule,
    GameApiRoutesModule,
    GamePlayModule,
    SingleWalletFunctionsModule,
    GameModule,
    AdminModule,
  ],
  controllers: [HealthController, AppController],
  providers: [],
})
export class AppModule { }
