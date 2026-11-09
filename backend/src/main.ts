import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarApp } from './config/configurar-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();
  const puerto = Number(process.env.PORT ?? 3000);
  await app.listen(puerto);
  Logger.log(`API lista en http://localhost:${puerto}/api`, 'Estética');
}
await bootstrap();
