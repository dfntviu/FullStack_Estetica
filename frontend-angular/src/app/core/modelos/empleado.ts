/** Empleado tal como lo envía la API. */
export interface EmpleadoApi {
  folio: string;
  nombre: string;
  telefono: string;
  fechaIngreso: string;
  activo: boolean;
}

/** Empleado como lo usan las páginas: `id` = folio (E001…) y la antigüedad ya calculada. */
export interface Empleado {
  id: string;
  nombre: string;
  telefono: string;
  fechaIngreso: string;
  activo: boolean;
  /** Solo presentación, p. ej. "2 años, 3 meses". */
  antiguedad: string;
}

export type EstadoEmpleados = 'activos' | 'inactivos' | 'todos';

export interface FiltroEmpleados {
  texto: string;
  estado: EstadoEmpleados;
}

/** Datos para registrar o editar (`POST` / `PUT /api/empleados`). */
export interface DatosEmpleado {
  nombre: string;
  telefono: string;
  fechaIngreso: string;
}
