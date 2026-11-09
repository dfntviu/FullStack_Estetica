# Migración a Angular — Fase 1: análisis e inventario

**Origen:** `frontend/`, el MVC nativo ya conectado a la API.
**Destino:** Angular 22.2 (última estable en npm al 04/11/2026).
**Alcance:** solo el front. El backend NestJS y PostgreSQL no cambian: Angular consume los mismos endpoints.

---

## 1. Línea base medida

| Métrica | Valor |
|---|---|
| JavaScript (sin pruebas) | 25 archivos · 2,143 líneas |
| Composición | `app.js` (78 líneas): lee `<body data-page>` y crea Modelo → Vista → Controlador |
| HTML | 8 páginas · 489 líneas |
| CSS | 3 hojas · 754 líneas: `tema-estetica.css` (662, tokens), `estilo_dashboard.css` (92) y estilos de página. 4 `@media` |
| Pruebas | 39 unitarias (`node:test`) + 108 comprobaciones de navegador (Playwright, fuera del proyecto) |
| Tamaño | **Pequeño-mediano:** 8 vistas, 5 entidades y un solo operador |

### Uso del DOM y del estado

| Patrón | Usos reales | Dónde vive | Destino en Angular |
|---|---|---|---|
| `getElementById` / `querySelector` | 70 / 9 | solo vistas | desaparece: binding |
| `addEventListener` | 33 | vistas + `visibilitychange` en 5 controladores | event binding `(evento)` + un servicio para la visibilidad |
| `textContent` / `el()` (`createElement`) | 45 / 1 helper | vistas | interpolación `{{ }}` y control flow `@if` / `@for` |
| `innerHTML` | **0** (la única coincidencia es un comentario) | — | — |
| `localStorage` / `sessionStorage` | **0** (las 3 coincidencias son comentarios) | — | — |
| `window.*` | `window.confirm` (3 controladores, inyectado), `location` (en `app.js`), `ESTETICA_API_URL` (en `config.js`) | controladores / composición | servicio de confirmación · Router · `environment` |
| Variables globales | ninguna | — | — |
| Estado de la vista | variables en el cierre (closure) de cada controlador: `editandoId`, `historialId`, `catalogo`, `total`, `ultimoCriterio`, contadores de turno | controladores | `signal()` dentro del componente o de su servicio |

### Dependencias de terceros

| Dependencia | Uso real | Decisión |
|---|---|---|
| Bootstrap 5.3.3 CSS (CDN) | todas las vistas (grid, `card`, `form-control`, `btn`, `alert`, `table`) | **Conservar**, instalado por npm e importado en `styles.css` |
| Bootstrap 5.3.3 **JS** bundle (CDN) | **un solo uso:** el botón de menú en móvil (`navbar-toggler` con `data-bs-toggle="collapse"`, generado en `navegacion.view.js`) | **Reemplazar** por un `signal()` que alterna la clase `show`. No conviene que Bootstrap JS y Angular manipulen el mismo DOM, y retirarlo ahorra unos 80 KB |
| Font Awesome 6.5.2 (CDN) | iconos de la navegación, las tarjetas y los botones | **Conservar** vía `@fortawesome/fontawesome-free` (npm) |
| jQuery u otros plugins | no hay | — |

---

## 2. Diagnóstico del patrón

**Patrón detectado:** MVC, y se respeta de verdad, no solo de nombre:
- **Modelos** (`*ApiModel`, `ServiciosModel`): asíncronos, sin DOM, con la API inyectable en el constructor.
- **Vistas:** pintan con nodos seguros y exponen métodos semánticos (`ocupado()`, `mostrarErrores()`, `renderLista()`) y suscripciones (`alGuardar`, `alFiltrar`…). No deciden reglas.
- **Controladores:** coordinan estados de carga, errores y reintentos. Reciben modelo, vista, `parametros`, `navegar`, `reloj` y `confirmarAccion` por inyección. Por eso las 39 pruebas corren sin navegador.
- **Composición única** en `app.js`.

**Conclusión:** no hace falta recuperarlo antes de migrar. La migración puede trasladar el MVC tal cual, como pide el principio 1 de la skill.

### Violaciones y hallazgos

| ID | Severidad | Hallazgo | Evidencia | Tratamiento en la migración |
|---|---|---|---|---|
| H-1 | media | **Código muerto heredado de la fase `localStorage`.** De `reglasAgenda.js` solo se usan `fechaISO` y `parsearFecha`; de `validaciones.js`, solo `limpiarTelefono` y `esTelefonoValido`. Las otras 12 exportaciones no se importan en ningún lado | `ESTADOS`, `REGLAS`, `esCitaActiva`, `generarHorarios`, `horariosDisponibles`, `validarDisponibilidad`, `validarDatosCita`, `calcularCambio`, `normalizar`, `esNombreValido`, `esCumpleanosValido`, `siguienteId` | **No se migra.** Esas reglas ya viven en la API y en la base, y la versión original queda en `legado/` |
| H-2 | baja | Bootstrap JS se carga en las 8 páginas solo para el menú colapsable de móvil. *(Corregido en la fase 2: la primera versión decía "0 usos" porque la búsqueda solo revisó el HTML, y el atributo se escribe desde JS.)* | `navegacion.view.js:37` | Se reemplaza por un `signal` en el componente de navegación (F-01) |
| H-3 | baja | Texto desactualizado: el mensaje de "sin conexión" menciona `api/.env`, pero la carpeta hoy es `backend/.env` | `services/api.js` | Se corrige al moverlo al interceptor |
| H-4 | media | **Patrones asíncronos repetidos a mano:** guarda de secuencia (6 controladores), `visibilitychange` (5), botón ocupado (4), espera de 250 ms (2). Clientes y Empleados son casi espejo (`accionLista`, `modoRegistro`/`modoEdicion`, baja/reactivar) | `controllers/*.js` | Es donde Angular más ahorra: `switchMap` sustituye la guarda de secuencia y `debounceTime` la espera manual; un servicio de visibilidad compartido. Se migran con la misma estructura, sin abstraer de más |
| H-5 | baja | **Navegación con parámetros repartida:** Servicios navega desde el controlador (`navegar()`), pero Horarios, Agendar, Verificar y Clientes arman el `href` con query en la vista | `views/*.view.js` | Todo pasa a `routerLink` + `queryParams` en el template, que en Angular es su lugar natural. La inconsistencia desaparece |
| H-6 | baja | El cambio previo en efectivo se calcula en el controlador de Cobrar (`Math.round`) | `cobrarServicio.controller.js:102` | Pasa a un `computed()`. Es solo una vista previa: el cambio oficial lo calcula la API |

---

## 3. Inventario de funcionalidades

Estos IDs son la base de la matriz de trazabilidad (fase 5). Las 108 comprobaciones de Playwright verifican estas funcionalidades, así que se reutilizan como pruebas de aceptación: por eso los templates conservarán los mismos `id` de los elementos.

### Transversales
| ID | Funcionalidad |
|---|---|
| F-01 | Barra de navegación con 8 enlaces, marca de página activa (`aria-current`), marca → Inicio y menú colapsable en móvil |
| F-02 | Inicio (dashboard): 7 tarjetas de acceso a las vistas |
| F-03 | Cliente HTTP único: URL configurable, tiempo máximo de 8 s, error normalizado `{ status, mensaje, errores, restriccion }` y mensaje específico de sin conexión/CORS |
| F-04 | Errores del servidor pintados en su campo, con foco en el primero |
| F-05 | Formatos: moneda `$0.00 MXN` y teléfono `722 000 0001` |
| F-06 | Tema visual por tokens CSS (paleta → semánticos → por área) y diseño responsive |

### Servicios
| ID | Funcionalidad |
|---|---|
| F-07 | Catálogo desde `GET /servicios`: tarjetas con imagen, nombre y precio |
| F-08 | Clic en un servicio → Agendar con `?servicio=` |
| F-09 | Estado de carga; error con **Reintentar** |

### Horarios
| ID | Funcionalidad |
|---|---|
| F-10 | Fecha mínima = hoy; consulta automática al cambiar la fecha (y con el botón) |
| F-11 | Horarios libres, o el **motivo** cuando no hay: domingo, fecha pasada o día lleno. Un 400 se muestra como motivo, no como error |
| F-12 | Clic en un horario → Agendar con `?fecha=&hora=` |
| F-13 | Descarta respuestas viejas, recarga al volver a la pestaña y ofrece Reintentar |

### Agendar
| ID | Funcionalidad |
|---|---|
| F-14 | Catálogo en el select; precarga desde la URL (`servicio`, `fecha`, `hora`, `telefono`) |
| F-15 | Horas libres según la fecha, con mensaje del motivo cuando no hay |
| F-16 | **Reconocimiento por teléfono** (10 dígitos): cliente existente → autocompleta el nombre; si no existe → "cliente nuevo". Al cambiar el teléfono se libera el nombre |
| F-17 | Envío: botón ocupado, errores por campo y, si el turno se acaba de ocupar, recarga las horas |
| F-18 | Ficha de confirmación (indica si el cliente es nuevo) con enlace a Verificar `?q=folio` |
| F-19 | Recarga las horas al volver a la pestaña |

### Verificar (acción, no tabla)
| ID | Funcionalidad |
|---|---|
| F-20 | Búsqueda por folio, nombre o teléfono; aviso si va vacía, conteo de resultados; precarga `?q=` |
| F-21 | Confirmar cita (fila ocupada mientras responde) |
| F-22 | Cancelar cita con confirmación; ante un 409 o 404, nueva búsqueda silenciosa |
| F-23 | Botón **Cobrar** → Cobrar `?cita=` |
| F-24 | Repite la búsqueda en silencio al volver a la pestaña |

### Cobrar
| ID | Funcionalidad |
|---|---|
| F-25 | Cobro **con cita:** folio → carga la cita, valida que exista y que su estado se pueda cobrar, total con el precio congelado. Precarga `?cita=` |
| F-26 | Cobro **sin cita** (venta directa): el servicio del catálogo fija el total; cliente y teléfono |
| F-27 | Método de pago: efectivo (monto pagado + cambio previo) / terminal o transferencia (referencia; cambio 0) |
| F-28 | Registrar el cobro: botón ocupado, errores por campo y comprobante del cobro |

### Clientes
| ID | Funcionalidad |
|---|---|
| F-29 | Lista con filtro (espera de 250 ms) e "incluir inactivos"; descarta respuestas viejas |
| F-30 | Alta y edición en el mismo formulario: texto del botón según el modo y cancelar edición |
| F-31 | Baja lógica con confirmación y reactivar |
| F-32 | Historial del cliente en un panel; se refresca después de guardar |
| F-33 | Enlace **Agendar** desde el cliente → `?telefono=` |
| F-34 | Recarga la lista y el historial al volver a la pestaña |

### Empleados
| ID | Funcionalidad |
|---|---|
| F-35 | Lista con filtro de texto (250 ms) + estado (activos / inactivos / todos) |
| F-36 | Alta y edición; antigüedad calculada |
| F-37 | Baja y reactivar con confirmación |
| F-38 | Recarga al volver a la pestaña |

**Total: 38 funcionalidades.**

---

## 4. Riesgos y decisiones para la fase 2

| Riesgo o decisión | Detalle |
|---|---|
| **Versión de Node** | Angular 22 exige Node `^22.22.3`, `^24.15.0` o `>=26`. No hace falta instalar Angular de forma global: el CLI (`@angular/cli`) es una dependencia de desarrollo del proyecto, y `npm install` lo deja en `node_modules` junto con todo lo demás. `npm start`, `npm test` y `npm run build` usan esa copia local |
| **CORS** | `ng serve` corre en `http://localhost:4200`, así que hay que agregarlo a `CORS_ORIGIN` en `backend/.env`. Alternativa: el proxy de desarrollo del CLI (`proxy.conf.json`), que evita CORS en desarrollo |
| **Formularios** | Reactive Forms (estable) para Agendar, Cobrar, Clientes y Empleados. La validación definitiva sigue en la API, y sus errores se pintan con F-04 |
| **Proyecto Angular anterior** | `citas-estetica-ng` se descarta: no tiene API, Clientes, Empleados ni métodos de pago |
| **Pruebas** | Las 39 unitarias se reescriben contra los servicios de Angular. Las 108 de Playwright se reutilizan como aceptación, apuntando a `localhost:4200` y a las rutas nuevas |
| **Estructura del repositorio** | El proyecto Angular sería una carpeta nueva, hermana de `frontend/`, y `frontend/` se conserva como referencia. A decidir en la fase 2 |
