import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global auth guard (internally bypasses if ENABLE_AUTH=false)
  const jwtAuthGuard = app.get(JwtAuthGuard);
  app.useGlobalGuards(jwtAuthGuard);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port);
  const enableAuth = configService.get<boolean>('app.enableAuth');
  const envName = configService.get<string>('app.env');
  const dbHost = configService.get<string>('database.host');
  const redisHost = configService.get<string>('redis.host');
  Logger.log(
    `Application is running on: ${port} env=${envName} auth=${enableAuth ? 'ENABLED' : 'DISABLED'} dbHost=${dbHost} redisHost=${redisHost}`,
  );
}

bootstrap();
