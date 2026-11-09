// Configuración común de la aplicación (la usan main.ts y las pruebas e2e).
import { INestApplication, Logger } from '@nestjs/common';
import { ErroresPgFilter } from '../middleware/errores-pg.filter.js';
import { crearValidationPipe } from '../middleware/validacion.js';

// 4200 = ng serve (front en Angular)
const ORIGENES_POR_DEFECTO = 'http://localhost:4200,http://127.0.0.1:4200';

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(crearValidationPipe());
  app.useGlobalFilters(new ErroresPgFilter());

  // CORS: el front (Angular, puerto 4200) es otro origen que la API (puerto 3000).
  // Para el navegador, el puerto cuenta: http://localhost:4200 y http://localhost:3000 son orígenes DISTINTOS.
  const permitidos = new Set(
    (process.env.CORS_ORIGIN ?? ORIGENES_POR_DEFECTO).split(',').map((o) => o.trim()).filter(Boolean),
  );
  const logger = new Logger('CORS');
  const avisados = new Set<string>();
  app.enableCors({
    origin: (origen: string | undefined, responder: (error: Error | null, permitir?: boolean) => void) => {
      // Sin cabecera Origin = no es una petición de navegador entre orígenes (curl, Postman, misma página)
      if (!origen || permitidos.has(origen)) return responder(null, true);
      if (!avisados.has(origen)) {
        avisados.add(origen);
        logger.warn(`Origen bloqueado: ${origen}. Si es tu front, agrégalo a CORS_ORIGIN en .env y reinicia la API.`);
      }
      responder(null, false);
    },
  });
}
