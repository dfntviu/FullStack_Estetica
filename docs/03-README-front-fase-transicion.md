# Citas Estética Miss Name — stack nativo (HTML + CSS + JavaScript ES Modules)

Sistema de citas para una estética: catálogo, horarios, agenda, verificación, cobro, **clientes** y **empleados**.
No usa frameworks ni dependencias. La arquitectura es **MVC**, con un único punto de composición (`app.js`) y persistencia en `localStorage`.

## Cómo ejecutarlo

Hay que servirlo por HTTP, porque los ES Modules no cargan desde `file://`:

- **XAMPP:** copia la carpeta en `htdocs`, arranca Apache y abre
  `http://localhost/<ruta-en-htdocs>/citas_estetica_recuperado/Layouts/dashboard.html`
- **VS Code:** con la extensión Live Server, clic derecho en `Layouts/dashboard.html` → *Open with Live Server*.
- **Pruebas del modelo:** `npm test` (usa `node:test`, que ya viene con Node; no instala nada).

## Fase full-stack (en curso)

El front se conecta poco a poco a la API (`api/`, NestJS + PostgreSQL). **Para las vistas ya migradas, la API debe estar encendida** (`cd api && npm run start:dev`).

| Vista | Fuente de datos |
|---|---|
| Servicios | **API** → `GET /api/servicios` |
| Clientes | **API** → `/api/clientes` (listar, buscar, alta, edición, baja, reactivación, historial) |
| Horarios | **API** → `GET /api/citas/disponibilidad?fecha=` (consulta sola al abrir y al cambiar la fecha) |
| Agendar | **API** → catálogo, horas libres, reconocimiento por teléfono y `POST /api/citas` |
| Cobrar | **API** → `GET /api/citas/:folio` (precio pactado) y `POST /api/cobros`, con método de pago |
| Verificar | **API** → `GET /api/citas?buscar=` y `PATCH /api/citas/:folio/confirmar` · `/cancelar` |
| Empleados | **API** → `/api/empleados` (listar, buscar, filtrar por estado, alta, edición, baja, reactivación) |

**Las 8 vistas leen y escriben en PostgreSQL.** `localStorage` ya no se usa en ninguna vista; los archivos que lo manejaban (`almacen.js`, `ClientesModel.js`, `CitasModel.js`, `EmpleadosModel.js` y las semillas en `Layouts/data/`) se retiran en la fase de limpieza.

**Verificar es una vista de acciones, no una tabla.** Para buscar, el servidor une `cita` + `cliente` + `servicio` (JOIN), así que muestra el nombre actual del cliente. Confirmar y cancelar son `UPDATE` sobre `cita` que PostgreSQL solo aplica si la transición es válida. Si la cita cambió desde otro equipo, la API responde 409 y la lista se refresca con el estado real.

El flujo completo ya pasa por la base: **Agendar → Verificar (el enlace de la ficha busca la cita sola) → Confirmar → Cobrar → Historial del cliente**.

**Cobrar:**
- **Con folio de cita:** se cobra el **precio pactado al agendar**, aunque el catálogo haya cambiado después. Cliente y servicio quedan bloqueados porque el servidor los toma de la cita. Al cobrar, la cita pasa a `terminada`.
- **Sin folio:** cliente de paso. Si se escribe el teléfono de un cliente registrado, el cobro se suma a su historial.
- **Método de pago:** en efectivo se calcula el cambio; con tarjeta o transferencia el pago es exacto y la transferencia exige referencia. La base rechaza cualquier combinación inválida.
- **Folio de cobro `V0001`** (V de venta). Puede saltarse números cuando un cobro se rechaza; ver `db/README.md`.

- `source/config.js` define la URL de la API: `http://localhost:3000/api` por defecto. Se puede cambiar sin tocar el código definiendo `window.ESTETICA_API_URL` antes de cargar `app.js`.
- `source/services/api.js` es el cliente HTTP único. Convierte cualquier falla (validación, restricción de la base, servidor apagado o tiempo agotado) en `ErrorApi { status, mensaje, errores }`, la misma forma que ya pintan las vistas.
- Si la API está apagada, la vista muestra "No hay conexión con el servidor" y un botón **Reintentar**.
- Patrones comunes de las vistas migradas:
  - el botón **Guardar se bloquea** mientras responde la API, para evitar envíos dobles;
  - la **búsqueda espera 250 ms** a que dejes de escribir y descarta respuestas que lleguen fuera de orden;
  - al **volver a la pestaña**, la lista se refresca para traer los cambios hechos desde otro equipo. Esto sustituye al evento `storage`, que solo veía otras pestañas del mismo navegador.

## Arquitectura MVC

```
app.js                      composición: lee <body data-page> y crea Modelo → Vista → Controlador
Layouts/data/               semillas: servicios, citas, clientes, empleados
source/model/               reglas y estado, sin DOM
  reglasAgenda.js           horarios, traslapes, cupo, cambio
  validaciones.js           nombre, teléfono, cumpleaños, ids (compartido)
  CitasModel.js             citas y cobros (+ historial por cliente)
  ClientesModel.js          clientes
  EmpleadosModel.js         empleados
source/services/almacen.js  localStorage + aviso de cambios en otras pestañas
source/views/*.view.js      pintan el HTML (textContent, nunca innerHTML con datos) y emiten eventos
source/controllers/*.js     conectan eventos de la vista con casos de uso del modelo
views/*.html                una página por vista
```

## Las dos vistas nuevas

### Clientes (`views/clientes.html`)
Sirve para registrar, consultar y dar seguimiento a los clientes, y facilita agendar sin duplicar personas.

| Campo | Propósito |
|---|---|
| ID cliente (`C001`…) | Se asigna automáticamente. |
| Nombre completo | Identifica a la persona. |
| Teléfono (10 dígitos, **único**) | Contacto y **llave para reconocer al cliente** al agendar. |
| Fecha de registro | Se guarda automáticamente al darlo de alta. |
| Cumpleaños `DD/MM` (opcional) | Solo día y mes; el año no hace falta. |
| Observaciones (opcional, ≤300) | Notas técnicas: fórmula de tinte, tipo de cabello, preferencias. |

Funciones disponibles:
- **Registrar.**
- **Consultar:** búsqueda por nombre (sin importar acentos) o por teléfono, con la opción "mostrar dados de baja".
- **Editar.**
- **Dar de baja / reactivar:** la baja es lógica, así que el historial no se pierde.
- **Historial de servicios:** citas del cliente, total gastado, última visita, próxima cita y servicio más frecuente, con un botón para agendar directamente.

La vista se integra con el resto del sistema:
- Al **agendar**, primero se escribe el teléfono. Si ya existe, se completa el nombre; si no, se crea el cliente al confirmar la cita.
- Cada cita guarda `clienteId`. Por eso las dos citas de "María Gómez" (A001 y A007) ahora son de la misma persona.
- En **Verificar** también se puede buscar por teléfono.

### Empleados (`views/empleados.html`)
Sirve para registrar y mantener la información básica del personal.

| Campo | Propósito |
|---|---|
| ID empleado (`E001`…) | Se asigna automáticamente. |
| Nombre completo | Saber quién trabaja en la estética. |
| Teléfono (10 dígitos, único) | Medio de contacto. |
| Fecha de ingreso (no futura) | Desde cuándo trabaja. La antigüedad se calcula automáticamente. |
| Estado | Activo o inactivo. |

Funciones disponibles:
- **Registrar.**
- **Consultar:** búsqueda y filtro por activos, inactivos o todos.
- **Editar.**
- **Dar de baja:** queda inactivo sin borrar sus datos, y se puede reactivar.

**Decisión de diseño:** no se guarda el **domicilio**. Ningún flujo lo usa y es un dato personal que no hace falta almacenar. Esta vista todavía no se conecta con las citas; el siguiente paso natural sería convertirla en "Estilistas" y asignar cada cita a un empleado.

## Persistencia

| Clave en localStorage | Contenido |
|---|---|
| `estetica-miss-name.v1` | Citas y cobros (versión interna 2: incluyen `clienteId`). |
| `estetica-miss-name.clientes` | Clientes. |
| `estetica-miss-name.empleados` | Empleados. |

Los datos guardados con la versión anterior se **migran solos**: cada cita sin `clienteId` se liga a un cliente existente (por teléfono o por nombre) o a uno nuevo.

Para reiniciar los datos de ejemplo, abre la consola del navegador y ejecuta `localStorage.clear()`.

## Aviso sobre datos personales

Teléfono, cumpleaños y observaciones son datos personales. En un sistema real en México, la LFPDPPP exige un aviso de privacidad. Además, si en Observaciones se anotan alergias, eso ya es un dato de salud.
