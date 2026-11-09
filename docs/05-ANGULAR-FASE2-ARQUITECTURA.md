# Migración a Angular — Fase 2: arquitectura

**Base:** Fase 1 aprobada (`04-ANGULAR-FASE1-ANALISIS.md`).
**Versión:** Angular **22.2**. Se comprobó generando un proyecto vacío con el CLI 22.2:
- zoneless por defecto, sin `zone.js`;
- componentes standalone;
- archivos sin sufijo (`app.ts`);
- recursos estáticos en `public/`;
- Vitest como runner (`ng test`).

**Requisito:** Node `^22.22.3`, `^24.15.0` o `>=26`.

---

## 1. Decisión de arquitectura

Revisión con `architecture-socratic-guard`, **solo del front**:
- **¿Qué cambió?** La tecnología de la vista, no el dominio. Las reglas siguen en la API y en PostgreSQL.
- **¿Qué amenaza?** Rehacer de más: introducir un store o capas que el proyecto no necesita, o perder el comportamiento que ya validan las 108 pruebas.
- **¿Qué quiero conseguir?** "Muevo el front a Angular para ganar Router, inyección de dependencias, binding y formularios tipados, y acepto el costo de reescribir templates y pruebas unitarias."

**Se conserva MVC.** No se sube a SSV: no hay estado compartido entre vistas. Cada vista carga lo suyo desde la API, así que un store solo reenviaría llamadas, que es justo la señal de sobreingeniería. Hexagonal tampoco aplica: hay un solo adaptador de datos (HTTP).

## 2. Equivalencias MVC → Angular

| Origen (nativo) | Destino (Angular 22) | Nota |
|---|---|---|
| **Modelo** `*ApiModel.js`, `ServiciosModel.js` | `core/modelos/*.ts` (interfaces) + `core/datos/*-api.ts` (`@Injectable`, `providedIn: 'root'`) | Lecturas con `httpResource`; escrituras con `HttpClient` |
| **Vista** `*.view.js` + `views/*.html` | template `.html` del componente de página | `getElementById` / `textContent` / `el()` → binding, `@if`, `@for` |
| **Controlador** `*.controller.js` | clase del componente de página: delgada, con `signal()` / `computed()` | Coordina, no decide reglas, igual que hoy |
| `app.js` (composición con `data-page`) | `app.config.ts` (providers) + `app.routes.ts` | La inyección de dependencias reemplaza el `new` manual |
| `services/api.js` (`solicitar`, `ErrorApi`) | `core/api/api.interceptor.ts` (interceptor funcional) + `core/api/error-api.ts` | Tiempo máximo de 8 s y normalización del error, **en un solo lugar** |
| `config.js` (`API_URL`, `window.ESTETICA_API_URL`) | `core/api/api-config.ts`: `InjectionToken<string>` `API_URL` | Se cambia en `app.config.ts`; en las pruebas, con un provider |
| `navegacion.view.js` | `compartido/navegacion/navegacion.ts` | `routerLink` + `routerLinkActive` + `ariaCurrentWhenActive="page"`; menú móvil con `signal` (sin Bootstrap JS) |
| `dom.js` · `moneda`, `formatoTelefono` | `compartido/pipes/moneda.pipe.ts`, `telefono.pipe.ts` | Pipes puros |
| `dom.js` · `pintarErrores` | `compartido/formularios/errores-servidor.ts` | Clase `ErroresServidor`: guarda `ErrorApi.errores` en un signal y pone el foco en el primer campo con error. **Ajustado en F3.4:** no se guardan en los `FormControl`, porque `disable()` o `setValue()` recalculan la validez y los borrarían; además, así se conservan hasta el siguiente envío, como en la versión nativa |
| `dom.js` · `mostrarAviso` + botón Reintentar | `compartido/aviso/aviso.ts` | `input()` tipo/texto, `output()` `reintentar` |
| `dom.js` · `llenarSelect` | `@for` en el template | Desaparece |
| `reglasAgenda.js` (solo `fechaISO`, `parsearFecha`) | `core/util/fechas.ts` | Las 8 funciones muertas no se migran (H-1) |
| `validaciones.js` (solo teléfono) | `core/util/telefono.ts` + validador `telefonoValido` | Las 4 funciones muertas no se migran (H-1) |
| `confirmarAccion = window.confirm` | `core/plataforma/confirmacion.ts` (`@Injectable`) | Se sigue pudiendo sustituir en las pruebas |
| `visibilitychange` (5 controladores) | `core/plataforma/visibilidad-pagina.ts` → `alVolver$` | Un solo listener (`fromEvent` sobre `DOCUMENT`) |

## 3. Patrones asíncronos (H-4): de escritos a mano a Angular

| Hoy, en cada controlador | En Angular | Dónde |
|---|---|---|
| Guarda de secuencia (`++turno`, `if (miTurno === turno)`) | `httpResource` con parámetros en signals: cancela solo la petición anterior | Lecturas: lista, disponibilidad, búsqueda, historial |
| Espera de 250 ms con `setTimeout` | `toSignal(control.valueChanges.pipe(debounceTime(250)))` → parámetro del recurso | Filtros de Clientes y Empleados |
| `cargando(true/false)` | `recurso.isLoading()` | Templates |
| Botón **Reintentar** | `recurso.reload()` | `<app-aviso (reintentar)>` |
| Recarga al volver a la pestaña | `alVolver$` → `recurso.reload()` con `takeUntilDestroyed()` | Las 5 vistas que lo tienen hoy |
| Botón ocupado | `ocupado = signal(false)` + `[disabled]` | Envíos (POST / PUT / PATCH) |
| Errores por campo | `errores.mostrar(e.errores, host)` (`ErroresServidor`) | Formularios |
| Navegación con query desde vista o controlador (H-5) | `routerLink` + `[queryParams]` en el template; `Router.navigate` solo si va después de una acción | Todo |
| Lectura de `URLSearchParams` | `withComponentInputBinding()` → `servicio = input<string>()` | Agendar, Verificar, Cobrar |

**Estado:** signals por defecto; RxJS solo donde ya es flujo (HTTP, `valueChanges`, `visibilitychange`). Sin NgRx.

## 4. Rutas

| Ruta | Componente | Query params (inputs) | Origen | `data.pagina` (tema por área) |
|---|---|---|---|---|
| `''` | `Inicio` | — | `Layouts/dashboard.html` | `dashboard` |
| `servicios` | `Servicios` | — | `views/servicios.html` | `servicios` |
| `horarios` | `Horarios` | — | `views/horarios.html` | `horarios` |
| `agendar` | `Agendar` | `servicio`, `fecha`, `hora`, `telefono` | `views/iniciar_cita.html` | `iniciar-cita` |
| `verificar` | `Verificar` | `q` | `views/cotejar_cita.html` | `cotejar-cita` |
| `cobrar` | `Cobrar` | `cita` | `views/cobrar_servicio.html` | `cobrar-servicio` |
| `clientes` | `Clientes` | — | `views/clientes.html` | `clientes` |
| `empleados` | `Empleados` | — | `views/empleados.html` | `empleados` |
| `**` | redirige a `''` | — | (no existía) | — |

Cada página se carga con `loadComponent` (lazy). El costo es una línea por ruta, e Inicio no descarga los formularios reactivos de Agendar, Cobrar, Clientes y Empleados.

## 5. Estructura de directorios

```
estetica_FullStack_complete/
├── backend/                       (sin cambios, salvo CORS_ORIGIN += http://localhost:4200)
├── frontend/                      nativo: se conserva hasta cerrar la fase 5
└── frontend-angular/
    ├── public/img/                ← assets/img + assets/templates
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.css             @import bootstrap.css, fontawesome, estilos/*
        ├── estilos/
        │   ├── tema-estetica.css  tokens, base, navegación, tema por área (global)
        │   └── base.css           ← estilo_dashboard.css
        └── app/
            ├── app.ts / app.html  <app-navegacion> + <router-outlet> + pie; pone <body data-page> desde la ruta
            ├── app.config.ts      provideRouter(withComponentInputBinding()), provideHttpClient(withFetch(), withInterceptors([api])), API_URL
            ├── app.routes.ts
            ├── core/
            │   ├── api/           api-config.ts · error-api.ts · api.interceptor.ts
            │   ├── modelos/       servicio.ts · cliente.ts · cita.ts · cobro.ts · empleado.ts
            │   ├── datos/         servicios-api.ts · clientes-api.ts · citas-api.ts · cobros-api.ts · empleados-api.ts
            │   ├── plataforma/    confirmacion.ts · visibilidad-pagina.ts
            │   └── util/          fechas.ts · telefono.ts
            ├── compartido/
            │   ├── navegacion/    navegacion.ts/.html
            │   ├── aviso/         aviso.ts
            │   ├── pipes/         moneda.pipe.ts · telefono.pipe.ts
            │   └── formularios/   errores-servidor.ts
            └── paginas/
                ├── inicio/  servicios/  horarios/  agendar/  verificar/  cobrar/  empleados/
                └── clientes/      clientes.ts/.html + historial-cliente/ (hijo: input() cliente e historial, output() cerrar)
```

**Se divide en componentes solo donde la vista original ya tenía un bloque independiente:** el panel de historial de Clientes. Lo demás queda en un componente por página: con 130–170 líneas por vista, dividir más agregaría comunicación por `input()` / `output()` sin beneficio.

## 6. CSS: lo que el encapsulado afectaría y cómo se resuelve

| Caso | Riesgo | Decisión |
|---|---|---|
| Tokens, base, navegación, Bootstrap ajustado | se usan en todas las páginas | **Global**, en `styles.css` |
| Tema por área: `[data-page="horarios"] { --color-area … }` | hoy se aplica en el `<body>` | Se mantiene el selector. `App` pone `<body data-page>` desde `data.pagina` de la ruta, en el mismo lugar que la versión nativa. **Sin cambios en el CSS** |
| `main > section > h1` | Angular inserta el elemento del componente, y eso rompería el selector si quedara entre `main` y `section` | **Resuelto sin cambiar el CSS (F3.1):** cada página tiene su propio `<main>`, y su elemento raíz lleva `display: contents`, así que el elemento queda *fuera* del `main`. Verificado en el navegador |
| Bloques por vista (`#lista-servicios .card`, `#historialCliente …`, `#sugerencias …`, `#clienteEncontrado …`) | dependen de un `id` dentro de una sola vista | Pasan al `.css` de su componente (encapsulados), conservando el `id` |
| Breakpoints (4 `@media`) | — | Se conservan donde estén: global o en el componente |

## 7. Pruebas

- **Unitarias (Vitest, `ng test`):**
  - servicios de datos con `provideHttpClientTesting`;
  - el interceptor (tiempo agotado, sin conexión, 400 con `errores`, 409 con `restriccion`);
  - pipes y utilidades;
  - componentes con lógica: Agendar (reconocer teléfono), Cobrar (total y cambio previo), Clientes (alta / edición / baja).

  Equivalen a las 39 actuales.
- **Aceptación:** las 108 comprobaciones de Playwright apuntando a `localhost:4200` con las rutas nuevas. **Los templates conservan los `id` actuales** para reutilizarlas casi sin cambios.

## 8. Desviaciones que requieren tu aprobación

| ID | Desviación | Motivo |
|---|---|---|
| D-1 | **Las URL cambian:** `views/iniciar_cita.html?servicio=…` → `/agendar?servicio=…` (tabla de rutas) | El Router no usa archivos `.html`. Los nombres siguen las etiquetas del menú |
| D-2 | ~~`main > section > h1` → `main section > h1:first-child`~~ **Ya no hace falta** | En F3.1 se resolvió con `display: contents` en el elemento de cada página, sin tocar el CSS |
| D-3 | El menú móvil pasa de Bootstrap JS a un `signal` | No conviene que Bootstrap JS y Angular manipulen el mismo DOM (H-2) |
| D-4 | Carpeta nueva `frontend-angular/`; `frontend/` se conserva hasta la fase 5 | Permite comparar lado a lado y correr ambas suites. Al cerrar, `frontend/` pasa a `legado/frontend-nativo/` y `frontend-angular/` toma el nombre `frontend/` |
| D-5 | `CORS_ORIGIN` += `http://localhost:4200` en `backend/.env` y `.env.example` | `ng serve` usa el puerto 4200 |

## 9. Orden de la fase 3 (un módulo por entrega)

1. **Esqueleto:** `ng new`, estilos, `public/`, `App` + Navegación + Inicio, rutas vacías, `core/api` (interceptor) y pruebas de interceptor y pipes. *Objetivo: navegar entre 8 rutas con el tema por área.*
2. Servicios → 3. Horarios → 4. Agendar → 5. Verificar → 6. Cobrar → 7. Clientes → 8. Empleados. Es el mismo orden en que se migraron a la API; cada uno se entrega con sus pruebas y su suite de Playwright en verde.

## 10. Cambios registrados después de la fase 2

| Cambio | Motivo |
|---|---|
| Vista nueva **Reportes** (`/reportes`, `data-page="reportes"`, enlace 9 del menú y tarjeta 8 de Inicio) | Interfaz de `db/auditoria-reportes.sql`: ingresos, auditoría y cierres de caja. No tiene equivalente nativo |
| `moneda` separa miles: `$126,745.00 MXN` (antes `$126745.00 MXN`) | Los totales de los reportes llegan a seis cifras. Afecta a todas las vistas, pero solo a montos ≥ $1,000 |
| Menú compacto entre 992 y 1199 px (`tema-estetica.css`) | Con 9 secciones, el menú desbordaba la página 14 px a 992 px. Verificado también con 10 (Consultas) |
| Vista nueva **Consultas** (`/consultas`, `data-page="consultas"`, enlace 10 y tarjeta 9) | Interfaz de `db/consultas.sql`. Componente de tarjeta genérico (`tarjeta-consulta`) + catálogo en lenguaje de negocio (`catalogo.ts`) |
| `ultimosDias()` pasa de `reportes.ts` a `core/util/fechas.ts` | Lo usan Reportes y Consultas; importarlo desde `reportes.ts` metía todo ese componente en el chunk de Consultas |
| Colores de la gráfica de ingresos: barras `#a8405f` (marca) y línea `#2a78d6` | Par validado con el validador de paletas (separación para daltonismo y contraste). El dorado y el azul del tema no pasaban |
| **Cobrar, Clientes y Empleados migradas** (versión final) | Las 10 vistas quedan en Angular; se retira la página provisional `en-migracion` y el front nativo sale del proyecto. Clientes conserva el componente hijo `historial-cliente` previsto en la sección 5 |
| `core/` reorganizado: `config/`, `interceptors/`, `datos/`, `modelos/`, `servicios/`, `util/`; `layout/` para la navegación; `src/environments/` para la URL de la API | Estructura acordada para la versión final. Sin `guards/`: no hay autenticación |
| Backend organizado por capa (`controllers/`, `services/`, `repositories/`, `dto/`, `modules/`, `middleware/`, `config/`, `common/`); en `src/` solo quedan `main.ts` y `app.module.ts` | Misma lógica y mismas 55 pruebas; solo cambia la ubicación de los archivos |
| La base pasa a `database/` en la raíz, con `instalar.sql` y `validar-esquema.sql` (psql) | Probada en PostgreSQL 18.6; el validador en JavaScript se sustituye por uno en SQL |
