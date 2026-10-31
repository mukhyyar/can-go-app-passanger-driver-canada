import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // rawBody required for Stripe webhook HMAC verification (exact request bytes).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  // Behind nginx: trust X-Forwarded-For so req.ip (rate limiting, audit logs)
  // is the real client IP, not the proxy's 127.0.0.1 shared by every user.
  const trustProxy = config.get<number | boolean>('trustProxy');
  if (trustProxy) app.set('trust proxy', trustProxy);
  const origins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
}

bootstrap();
