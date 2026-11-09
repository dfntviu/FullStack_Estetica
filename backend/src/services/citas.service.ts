import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ahoraNegocio, esFechaValida, horariosLibres, motivoTiempo, turnosDelDia } from '../common/agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';
import { DatabaseService } from '../config/database.service.js';
import { ClientesRepository } from '../repositories/clientes.repository.js';
import { EmpleadosRepository } from '../repositories/empleados.repository.js';
import { ServiciosRepository } from '../repositories/servicios.repository.js';
import { Cita, CitasRepository, EstadoCita } from '../repositories/citas.repository.js';
import { AgendarCitaDto } from '../dto/cita.dto.js';

/** Hacia afuera: sin ids internos. */
const publica = ({ id: _i, clienteId: _c, servicioId: _s, ...resto }: Cita) => resto;

@Injectable()
export class CitasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly citas: CitasRepository,
    private readonly clientes: ClientesRepository,
    private readonly servicios: ServiciosRepository,
    private readonly empleados: EmpleadosRepository,
  ) {}

  async buscar(texto = '') {
    if (!texto.trim()) return [];
    return (await this.citas.buscar(texto)).map(publica);
  }

  async obtener(folio: string) {
    const c = await this.citas.porFolio(folio);
    if (!c) throw this.noExiste();
    return publica(c);
  }

  /** Horarios libres de un día, o el motivo por el que no hay. */
  async disponibilidad(fecha: string) {
    if (!esFechaValida(fecha)) throw new ReglaNegocioException('fecha', 'La fecha no es válida.');
    const pasado = motivoTiempo(fecha);
    if (pasado) return { fecha, horarios: [], motivo: pasado };
    if (!turnosDelDia(fecha).length) return { fecha, horarios: [], motivo: 'La estética no trabaja los domingos.' };
    const horarios = horariosLibres(fecha, await this.citas.horasOcupadas(fecha), ahoraNegocio());
    return { fecha, horarios, motivo: horarios.length ? null : 'No quedan horarios disponibles ese día.' };
  }

  /**
   * Agenda en UNA transacción: identifica (o registra) al cliente por teléfono y crea la cita
   * con el precio congelado. Si la base rechaza la cita (turno ocupado, domingo…), el ROLLBACK
   * también deshace el alta del cliente: no quedan clientes huérfanos.
   */
  async agendar(d: AgendarCitaDto) {
    if (!esFechaValida(d.fecha)) throw new ReglaNegocioException('fecha', 'La fecha no es válida.');
    const pasado = motivoTiempo(d.fecha, d.hora);
    if (pasado) throw new ReglaNegocioException(d.fecha < ahoraNegocio().fecha ? 'fecha' : 'hora', pasado);

    const servicio = await this.servicios.buscarPorClave(d.servicio);
    if (!servicio) throw new ReglaNegocioException('servicio', 'Selecciona un servicio del catálogo.');

    let empleadoId: number | null = null;
    if (d.empleado) {
      const e = await this.empleados.porFolio(d.empleado);
      if (!e || !e.activo) throw new ReglaNegocioException('empleado', 'El empleado no existe o está inactivo.');
      empleadoId = e.id;
    }

    return this.db.transaccion(async (tx) => {
      const cliente = await this.clientes.resolverParaCita(d.cliente, d.telefono, tx);
      if (!cliente) {
        throw new ReglaNegocioException('cliente', 'Teléfono no registrado: escribe el nombre del cliente para darlo de alta.');
      }
      const cita = await this.citas.insertar(
        { clienteId: cliente.id, servicioId: servicio.id, empleadoId, fecha: d.fecha, hora: d.hora, precio: servicio.costo },
        tx,
      );
      return { cita: publica(cita), clienteNuevo: cliente.nuevo };
    });
  }

  confirmar(folio: string) {
    return this.transicion(folio, ['pendiente'], 'confirmada');
  }

  cancelar(folio: string) {
    return this.transicion(folio, ['pendiente', 'confirmada'], 'cancelada');
  }

  private async transicion(folio: string, desde: EstadoCita[], hacia: EstadoCita) {
    if (await this.citas.cambiarEstado(folio, desde, hacia)) return this.obtener(folio);
    const actual = await this.citas.porFolio(folio);
    if (!actual) throw this.noExiste();
    throw new ConflictException({
      statusCode: 409,
      mensaje: `No se puede pasar de "${actual.estado}" a "${hacia}".`,
    });
  }

  private noExiste() {
    return new NotFoundException({ statusCode: 404, mensaje: 'No existe la cita.' });
  }
}
