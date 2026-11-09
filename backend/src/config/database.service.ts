// Acceso a PostgreSQL con `pg` (SQL escrito a mano, sin ORM).
// - Un pool de conexiones para toda la API.
// - `transaccion()` entrega un ejecutor ligado a UNA conexión: BEGIN … COMMIT/ROLLBACK.
// - Los repositorios reciben un `Ejecutor`, así el mismo método sirve dentro o fuera de una transacción.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

// Tipos de PostgreSQL → JavaScript, sin conversiones sorpresa:
//  date (1082)    → 'AAAA-MM-DD' tal cual (por defecto pg crea un Date en la zona del servidor y puede correr un día)
//  numeric (1700) → number (por defecto llega como string)
pg.types.setTypeParser(1082, (valor) => valor);
pg.types.setTypeParser(1700, (valor) => Number(valor));

export interface Ejecutor {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, parametros?: unknown[]): Promise<T[]>;
}

@Injectable()
export class DatabaseService implements Ejecutor, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor(config: ConfigService) {
    this.pool = new pg.Pool({
      host: config.get<string>('PGHOST', 'localhost'),
      port: Number(config.get('PGPORT', 5432)),
      user: config.get<string>('PGUSER', 'postgres'),
      password: config.get<string>('PGPASSWORD'),
      database: config.get<string>('PGDATABASE', 'estetica'),
      max: Number(config.get('PG_POOL_MAX', 10)),
      // Identifica a la API ante PostgreSQL. La auditoría (database/schemas/auditoria-reportes.sql, origen_cambio())
      // marca como 'sistema' lo que llega con este nombre y como 'manual' lo que se hace en psql u otra herramienta.
      application_name: 'estetica-api',
      // Todas las tablas viven en el esquema `estetica`. `onConnect` ESPERA a que termine el SET
      // antes de entregar la conexión. (Hacerlo en el evento 'connect' sin esperar provocaba dos
      // consultas simultáneas en el mismo cliente: el DeprecationWarning de pg que se quita en pg@9.)
      onConnect: async (cliente: pg.ClientBase) => {
        await cliente.query('SET search_path TO estetica');
      },
    });
    this.pool.on('error', (e) => this.logger.error(`Error en el pool de PostgreSQL: ${e.message}`));
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query<T>(sql, parametros);
    return r.rows;
  }

  async transaccion<T>(trabajo: (tx: Ejecutor) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    const tx: Ejecutor = {
      query: async <R extends pg.QueryResultRow>(sql: string, parametros: unknown[] = []) =>
        (await cliente.query<R>(sql, parametros)).rows,
    };
    try {
      await cliente.query('BEGIN');
      const resultado = await trabajo(tx);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
