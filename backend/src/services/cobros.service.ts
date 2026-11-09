import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CajaRepository } from '../repositories/caja.repository.js';
import { ahoraNegocio } from '../common/agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';
import { DatabaseService, Ejecutor } from '../config/database.service.js';
import { CitasRepository } from '../repositories/citas.repository.js';
import { ClientesRepository } from '../repositories/clientes.repository.js';
import { ServiciosRepository } from '../repositories/servicios.repository.js';
import { CobrosRepository } from '../repositories/cobros.repository.js';
import { RegistrarCobroDto } from '../dto/cobro.dto.js';

@Injectable()
export class CobrosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cobros: CobrosRepository,
    private readonly citas: CitasRepository,
    private readonly clientes: ClientesRepository,
    private readonly servicios: ServiciosRepository,
    private readonly caja: CajaRepository,
  ) {}

  registrar(d: RegistrarCobroDto) {
    return d.citaFolio ? this.cobrarCita(d) : this.cobrarSinCita(d);
  }

  /**
   * Cobro de una cita, en UNA transacción:
   *  1. bloquea la fila de la cita (FOR UPDATE) para que dos cajas no la cobren a la vez,
   *  2. toma el precio CONGELADO de la cita,
   *  3. registra el cobro y 4. marca la cita como terminada.
   * Si algo falla (monto insuficiente, cita ya cobrada…), no queda nada a medias.
   */
  private cobrarCita(d: RegistrarCobroDto) {
    return this.db.transaccion(async (tx) => {
      const cita = await this.citas.porFolio(d.citaFolio!, tx, true);
      if (!cita) throw new NotFoundException({ statusCode: 404, mensaje: 'No existe una cita con ese folio.', errores: { citaFolio: 'No existe una cita con ese folio.' } });
      if (cita.estado !== 'pendiente' && cita.estado !== 'confirmada') {
        const mensaje = `La cita ${cita.folio} está ${cita.estado}; no se puede cobrar.`;
        throw new ConflictException({ statusCode: 409, mensaje, errores: { citaFolio: mensaje } });
      }
      const cobro = await this.cobros.insertar(
        {
          citaId: cita.id,
          clienteId: cita.clienteId,
          nombreCliente: cita.nombre,
          servicioId: cita.servicioId,
          total: cita.precio,
          metodo: d.metodo,
          pagado: d.pagado,
          referencia: d.referencia ?? null,
        },
        tx,
      );
      await this.citas.cambiarEstado(cita.folio, ['pendiente', 'confirmada'], 'terminada', tx);
      await this.rechazarSiCajaCerrada(tx);
      return cobro;
    });
  }

  /** Cliente de paso (o registrado, si se manda su teléfono) sin cita previa. */
  private async cobrarSinCita(d: RegistrarCobroDto) {
    const servicio = await this.servicios.buscarPorClave(d.servicio!);
    if (!servicio) throw new ReglaNegocioException('servicio', 'Selecciona un servicio del catálogo.');
    const cliente = d.telefono ? await this.clientes.porTelefono(d.telefono) : null;
    if (d.telefono && !cliente) throw new ReglaNegocioException('telefono', 'No hay un cliente registrado con ese teléfono.');

    return this.db.transaccion(async (tx) => {
      const cobro = await this.cobros.insertar(
        {
          citaId: null,
          clienteId: cliente?.id ?? null,
          nombreCliente: cliente?.nombre ?? d.cliente!,
          servicioId: servicio.id,
          total: servicio.costo,
          metodo: d.metodo,
          pagado: d.pagado,
          referencia: d.referencia ?? null,
        },
        tx,
      );
      await this.rechazarSiCajaCerrada(tx);
      return cobro;
    });
  }

  /**
   * Un día con la caja cerrada no admite cobros. Se pregunta DESPUÉS de insertar, dentro de la
   * misma transacción, por concurrencia: si sp_cerrar_caja está sumando en ese instante, tiene
   * `cobro` bloqueada (LOCK … SHARE MODE) y el INSERT espera a que termine; cuando el INSERT
   * continúa, el cierre ya existe, esta consulta lo ve y el ROLLBACK deshace el cobro.
   * Preguntar ANTES dejaría pasar un cobro que llega justo mientras se cierra.
   */
  private async rechazarSiCajaCerrada(tx: Ejecutor): Promise<void> {
    if (await this.caja.estaCerrado(ahoraNegocio().fecha, tx)) {
      const mensaje = 'La caja de hoy ya está cerrada: no se pueden registrar más cobros.';
      throw new ConflictException({ statusCode: 409, mensaje });
    }
  }

  delDia(dia = ahoraNegocio().fecha) {
    return this.cobros.delDia(dia);
  }

  async corte(dia = ahoraNegocio().fecha) {
    const porMetodo = await this.cobros.corte(dia);
    return {
      dia,
      porMetodo,
      cobros: porMetodo.reduce((n, m) => n + m.cobros, 0),
      total: Math.round(porMetodo.reduce((s, m) => s + m.total, 0) * 100) / 100,
    };
  }
}
