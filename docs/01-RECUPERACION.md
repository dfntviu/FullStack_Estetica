# Recuperación — Citas Estética Miss Name (stack nativo)

> Actualización 2-nov: se añadieron las vistas Clientes y Empleados. Consulta `README.md` y `REPORTE_CAMBIOS.txt`.

Estado: **LISTO PARA REAUDITORÍA** (no "aprobado": falta la reevaluación independiente con `legacy-project-auditor`).

## Cómo ejecutar

No hace falta instalar nada: el proyecto solo necesita servirse por HTTP, porque los ES Modules no funcionan con `file://`. Elige cualquiera de estas opciones:

- **XAMPP (recomendado si el proyecto ya está en `htdocs`)**: arranca Apache y abre
  `http://localhost/JS/citas_estetica_recuperado/Layouts/dashboard.html`
  (ajusta la ruta a la ubicación de la carpeta dentro de `htdocs`; si Apache usa otro puerto, agrégalo, p. ej. `localhost:8081/...`).
- **VS Code**: extensión Live Server → clic derecho en `Layouts/dashboard.html` → *Open with Live Server*.
- **Node, sin instalar dependencias**: `npm start` (usa `npx http-server` en el puerto 5500).

```bash
npm test         # 8 pruebas del modelo y las reglas (node:test incluido en Node, sin dependencias)
```

## Arquitectura elegida: MVC + adaptador de persistencia

```
app.js  (punto de composición: lee <body data-page>, crea Model → View → Controller)
├─ Layouts/data/servicios.js     catálogo único (antes había 3 con precios distintos)
├─ Layouts/data/citas.js         semilla de citas
├─ source/model/reglasAgenda.js  reglas puras: horario, traslape, cupo, cambio, validaciones
├─ source/model/CitasModel.js    estado único de citas y cobros + casos de uso (sin DOM)
├─ source/services/almacen.js    localStorage con respaldo en memoria (sustituye a los ajax_*.php vacíos)
├─ source/views/*.view.js        pintan con textContent/createElement y avisan eventos
└─ source/controllers/*.js       coordinan vista ↔ modelo; no leen selectores
```

¿Por qué no SSV ni Hexagonal? El estado compartido lo resuelve un solo modelo y hay un único adaptador de persistencia. Un store aparte solo reenviaría llamadas, y los puertos/adaptadores serían carpetas sin reglas.

## Alcance recuperado (15 de 40 entradas del archivo = 37.5 %)

| ID | Funcionalidad | Archivos originales recuperados |
|---|---|---|
| F-01 | Catálogo de servicios | `Layouts/data/servicios.js`, `source/mostrar_Servicios.js`, `views/servicios.html` |
| F-02 | Disponibilidad por día | `source/mostrar_Horarios.js`, `views/horarios.html` |
| F-03 | Agendar cita y emitir ficha | `source/iniciar_Cita.js`, `views/iniciar_cita.html` |
| F-04 | Verificar cita (buscar, confirmar, cancelar) | `Layouts/data/citas.js`, `source/cotejar_Cita.js`, `views/cotejar_cita.html` |
| F-05 | Cobrar servicio y calcular cambio | `source/cobrar_Servicio.js`, `views/cobrar_servicio.html` |
| — | Composición, navegación y estilos | `app.js`, `Layouts/dashboard.html`, `assets/css/estilo_dashboard.css` |

**Fuera de alcance y sin tocar:** `views/lista_cobro_servicio.html` + `source/ListadeCobrosServicio.js` (F-06; el modelo ya guarda los cobros que necesita), los 6 `.php` vacíos (F-07 backend), `views/cotejar_cita.php` (borrador duplicado), `Layouts/footer.html`, `utils/bar_navegacion.html` (su intención la absorbió `navegacion.view.js`) y `assets/css/barrra_nav.css`.

Ojo con la métrica: el 37.5 % cuenta entradas del archivo. El resto son sobre todo imágenes y PHP vacíos, así que **medido en código fuente con contenido lo recuperado es mucho mayor (~84 % de los bytes)**.

## Hallazgos verificados en el original (todos reproducidos leyendo el archivo)

| Sev. | Archivo | Hallazgo |
|---|---|---|
| Bloqueante | `app.js` | Imports a `../source/...` (fuera del proyecto), `inciar_Cita.js` no existe, `listadoDeCobroDeServicio` importado de `cobrar_Servicio.js`, funciones no exportadas. Ninguna vista cargaba `app.js`. |
| Bloqueante | `Layouts/data/citas.js` | Faltan comas entre objetos; sin `export`. |
| Bloqueante | `Layouts/data/servicios.js` | `const capturarServicios() =`, `import` dentro de función, `nombre = ...` en lugar de `nombre: ...`, `export` anidado. |
| Bloqueante | `source/cotejar_Cita.js` | `toLoweCase`; dos condiciones sin `||`; nada exportado. |
| Bloqueante | `source/mostrar_Horarios.js` | `}` sobrante, `return` sin cerrar, comas faltantes en el arreglo de horarios, `totalDateString`, `lenght`, `cotejarCita` inexistente, `e` en vez de `ev`. |
| Alta | 3 archivos | Tres catálogos con precios distintos (p. ej. Barba Hipster $270 / $380 / $490). |
| Alta | 3 archivos | Tres arreglos de citas aislados: agendar no afectaba la disponibilidad ni el cotejo. |
| Alta | `mostrar_Horarios.js` | El sábado se rechazaba completo; "Domingo" vs "domingo" nunca coincidía; el traslape devolvía siempre `true` (un arreglo vacío es truthy). |
| Alta | `cobrar_Servicio.js` | `submit` registrado dentro de `change` (se duplicaba); validación invertida `if (cliente || ...)`; id `"cambio "` con espacio; no se impedía un pago insuficiente. |
| Media | `iniciar_Cita.js` | Folio con `Math.random()` (colisiones) y sin guardar nada. |
| Media | `mostrar_Servicios.js` | `DOMContentLoaded` registrado dentro de un click (nunca dispara); `innerHTML` con datos. |
| Media | HTML | Bootstrap `5.3.0-alpha1`; kit de Font Awesome de ejemplo; `<a>` sin cerrar; `type="text/script"`; `integrity="sha512-..."` falso. |
| Baja | `estilo_dashboard.css` | Footer `position: fixed` tapaba contenido; `barrra_nav.css` con nombre distinto al enlazado y CSS roto. |

## Decisiones de negocio que tomé (revísalas)

- **Precios canónicos:** los del `<select>` y el `switch`, que coincidían entre sí. `servicios.html` tenía otros.
- **Horario:** lunes a viernes, turnos 09:00–18:30; sábado, último turno 14:00; domingo cerrado. Un turno = una cita.
- **`maxCitasPorDia = 27`:** lo conservé, pero con un turno por cita el máximo real es 20, así que **la regla nunca se alcanza**. O hay varias estilistas por turno, o el número está mal.
- **Estados:** pendiente → confirmada → terminada (al cobrar); pendiente/confirmada → cancelada. Se puede cobrar una cita pendiente o confirmada: atenderla ya implica que el cliente llegó.
- **Varias pestañas:** el modelo lee `localStorage` en cada operación y las vistas se refrescan con el evento `storage`. (Corrección del 2-nov: antes una pestaña abierta con anterioridad ofrecía horarios ya tomados y sobrescribía citas.)
- **Semilla:** las citas que se traslapaban entre sí se movieron de hora para no violar la propia regla.
- **Imagen `Img.vect-08.jpg`:** la referenciaba el original pero no existe; se reasignaron las imágenes.
- `Img.vect-05.jpg` es una caja de tinte de una marca comercial y `03`/`04` son logotipos de terceros. Conviene sustituirlas si el proyecto se publica.

## Pruebas ejecutadas (resultado real)

| Caso | Cómo | Resultado |
|---|---|---|
| Reglas y modelo (21 casos, incluye dos pestañas simultáneas, clientes y empleados: horarios, traslape, cambio, registro, transiciones, cobro, persistencia, inmutabilidad) | `npm test` | ✅ 21/21 |
| Flujo completo en navegador: catálogo → agendar → disponibilidad → verificar → confirmar → cobrar → persistencia entre páginas → cancelar | Playwright (Chromium) sobre servidor local | ✅ 17/17 |
| Errores: envío vacío, domingo, monto insuficiente | Playwright | ✅ |
| XSS: nombre `<img src=x onerror=...>` se pinta como texto | Playwright | ✅ |
| Consola sin errores JS | Playwright | ✅ |

Las pruebas usan fechas de noviembre de 2026. Las de `npm test` fijan el reloj y no caducan; el script de navegador usa el reloj real.

## Riesgos pendientes

- La persistencia es local a cada navegador (`localStorage`): no hay datos compartidos entre equipos hasta que exista un backend.
- La lista de cobros (F-06) y el backend PHP (F-07) no están implementados.
- No hay autenticación: cualquiera con acceso a la página puede cancelar o cobrar.
