import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
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
