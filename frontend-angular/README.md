# Front-End — Angular 22

Interfaz completa del sistema: **10 vistas** (Inicio, Servicios, Horarios, Agendar, Verificar, Cobrar, Clientes, Empleados, Reportes y Consultas). Consume la API Node.js (`../backend`, puerto 3000) y se sirve en el **puerto 4200**.

Patrón: **MVC adaptado a Angular**, sin store global (cada vista carga lo suyo desde la API):
- **Modelo:** interfaces en `core/modelos/` + servicios de datos en `core/datos/`.
- **Vista:** el template de cada página.
- **Controlador:** la clase del componente, delgada, con signals. No decide reglas: el servidor valida y aquí se muestran sus errores por campo.

Arquitectura y decisiones: `../docs/05-ANGULAR-FASE2-ARQUITECTURA.md`.

## Requisitos

- Node `^22.22.3`, `^24.15.0` o `>=26` (`node -v`). El CLI de Angular viene en las dependencias del proyecto: no hace falta instalarlo de forma global.
- La API encendida en `http://localhost:3000` con `http://localhost:4200` en `CORS_ORIGIN` (ya viene así en `backend/.env.example`).

## Ejecutar

```powershell
npm install
npm start            # ng serve → http://localhost:4200
npm test             # Vitest: 101 pruebas
npm run build        # producción → dist/frontend-angular/browser
```

La dirección de la API está en `src/environments/environment.ts` (`apiUrl`). Si la cambias, agrega el origen del front a `CORS_ORIGIN` en `backend/.env`.

## Estructura

```
src/
├── environments/environment.ts     URL de la API y tiempo máximo de espera
├── estilos/                        tema-estetica.css (tokens: paleta → semánticos → por área) y base.css
├── styles.css                      Bootstrap + Font Awesome (npm) + estilos/
└── app/
    ├── app.ts · app.html           navegación + <router-outlet> + pie; pone <body data-page> según la ruta
    ├── app.config.ts               Router (input binding) + HttpClient (fetch + interceptor)
    ├── app.routes.ts               10 rutas con carga diferida (loadComponent)
    ├── core/
    │   ├── config/                 API_URL y API_TIMEOUT_MS (InjectionToken, leen environment)
    │   ├── interceptors/           apiInterceptor (URL, tiempo máximo) y ErrorApi (forma única de error)
    │   ├── datos/                  servicios de datos: servicios, citas, cobros, clientes, empleados, reportes, consultas
    │   ├── modelos/                interfaces de la API y de las páginas
    │   ├── servicios/              Confirmacion, VisibilidadPagina (volver a la pestaña), RELOJ ("ahora" inyectable)
    │   └── util/                   fechas, teléfono, antigüedad, tiempos
    ├── layout/navegacion/          barra con 10 enlaces y menú móvil (signal, sin Bootstrap JS)
    ├── compartido/                 aviso con Reintentar, ErroresServidor, pipes moneda y teléfono, descarga CSV
    └── paginas/
        ├── inicio/  servicios/  horarios/  agendar/  verificar/
        ├── cobrar/                 cobro con cita (precio congelado) o venta directa; método de pago y cambio
        ├── clientes/               alta, edición, baja/reactivación, búsqueda + historial-cliente/ (componente hijo)
        ├── empleados/              alta, edición, baja/reactivación, filtro por estado, antigüedad
        ├── reportes/               ingresos, auditoría y cierres de caja + grafica-ingresos/ (SVG)
        └── consultas/              diagnóstico (consulta maestra) + 6 consultas + tarjeta-consulta/
public/assets/img, templates        imágenes del catálogo
```

No hay carpeta `guards/`: el sistema es de un solo operador, sin autenticación que proteger.

## Vistas

| Ruta | Vista | Técnicas clave |
|---|---|---|
| `/` | Inicio | 9 tarjetas de acceso |
| `/servicios` | Catálogo | `httpResource`, Reintentar |
| `/horarios` | Disponibilidad | recurso con parámetro, `linkedSignal`, recarga al volver a la pestaña |
| `/agendar` | Agendar cita | Reactive Forms, reconocimiento por teléfono (`debounceTime` + `switchMap`), precarga por URL |
| `/verificar` | Verificar cita | búsquedas como órdenes (`Subject` + `switchMap`), confirmar/cancelar, 409 → estado real |
| `/cobrar` | Cobrar | cita por folio (`?cita=`), campos bloqueados con cita, pago exacto con tarjeta/transferencia, comprobante |
| `/clientes` | Clientes | lista con `httpResource` + filtro de 250 ms, formulario de alta/edición, historial |
| `/empleados` | Empleados | igual que Clientes + filtro por estado y antigüedad calculada |
| `/reportes` | Reportes | carga perezosa por pestaña, gráfica SVG propia, cierre de caja |
| `/consultas` | Consultas | maestra siempre visible, casillas + Aplicar, CSV y "Ver SQL" |

## Presupuesto del bundle

El presupuesto inicial es de 700 kB "en bruto". Casi todo son estilos (Bootstrap y Font Awesome suman 349 kB); transferido y comprimido son ~115 kB. Cada vista se descarga solo al abrirla.
