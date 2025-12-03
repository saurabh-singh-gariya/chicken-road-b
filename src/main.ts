import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { WinstonLoggerService } from './common/logger/winston-logger.service';
import { DEFAULTS } from './config/defaults.config';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const winstonLogger = new WinstonLoggerService();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger,
  });

  app.use(express.urlencoded({ extended: true }));

  app.enableCors({
    origin: '*', // Allow all origins explicitly
    credentials: false, // Must be false when origin is '*'
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
  });

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Chicken Road API')
    .setDescription('API documentation for Chicken Road Backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('app', 'Application endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep auth token after page refresh
    },
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.set('trust proxy', true);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || DEFAULTS.APP.PORT;
  await app.listen(port);
  const enableAuth = configService.get<boolean>('app.enableAuth');
  const envName = configService.get<string>('app.env');
  const dbHost = configService.get<string>('database.host');
  winstonLogger.log(
    `Application is running on: ${port} env=${envName} auth=${enableAuth ? 'ENABLED' : 'DISABLED'} dbHost=${dbHost}`,
    'Bootstrap',
  );
  winstonLogger.log(`Swagger documentation available at: http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
