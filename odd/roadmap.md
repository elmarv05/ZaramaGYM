# 🗺️ ROADMAP DEL PROYECTO: ZARAMAGYM (ODD)

## 1. Contexto & Stack
- **Plataforma:** Desktop Local-First (Windows) + Cliente Web Móvil LAN para Escáner QR (`:3443`).
- **Tecnologías Core Backend (Tauri v2):** Rust + `sqlx` (SQLite 3 en modo WAL, columnas `DECIMAL(10,2)` mapeadas con `rust_decimal`) + `axum` (servidor LAN HTTPS `:3443`) + `argon2` (`Argon2id`) + `rcgen` / `rustls` (CA/TLS autogenerado sin dependencias externas) + `keyring` (credenciales seguras del OS) + `tauri-specta` (contratos IPC tipados).
- **Tecnologías Core Frontend:** React 19 + TypeScript + Tailwind CSS + Vite + Vitest.
- **Meta de Rendimiento:** Consumo en reposo/operación < 60 MB RAM, latencia de lectura QR LAN < 1s, cero borrado físico (`estado_activo` + auditoría inmutable).

---

## 2. Decisiones Clave (Mini-ADR) y Reglas de Negocio Cerradas
1. **Estrategia Frontend "Functional-First" en 3 Capas:**
   - **Capa 1:** Lógica de dominio, hooks de estado y contratos IPC tipados (`tauri-specta`).
   - **Capa 2:** Primitivas de interfaz limpias (*Wireframe Pro* funcional, accesible y con los 4 estados: Loading, Empty, Error, Success).
   - **Capa 3:** Design Tokens e identidad visual final concentrada exclusivamente en el **Slice 9** (los Slices 1 al 8 priorizan funcionalidad 100% verificada sin retrabajo estético).
2. **Persistencia SQLite 3 (WAL) y Arquitectura Relacional Segmentada:**
   - Conexión con `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;`.
   - Segregación de acceso (`Reader Pool` concurrente + `Single Writer` con `BEGIN IMMEDIATE`).
   - Montos declarados en DDL como `DECIMAL(10,2)` y operados en Rust con `rust_decimal::Decimal` (compatible con DBeaver/SQLite Browser y futura migración a PostgreSQL).
   - **Modelo Relacional Especializado (Sin tablas `entidades` ni `entidad_roles` genéricas):**
     - `001_core_auth_audit.sql`: `personas` (maestra de personas naturales con apellidos obligatorios), `usuarios_sistema` (hija 1:1 de personas con `rol_principal` de 3 niveles y `foto_perfil_data_url`), `auditoria_logs` (bitácora inmutable).
     - `002_entities_directory.sql`: `empresas` (maestra de personas jurídicas RUC 20), `clientes` (hija 1:1 de personas con `codigo_qr_token` y `peso_actual_kg`), `cliente_pesos_historial` (récord cronológico de pesos con variación automática $\Delta \text{ kg}$), `proveedores` (polimorfismo limpio: hereda de `personas` O de `empresas` asegurado con `CHECK` mutuamente excluyente).
   - Política **Zero-Delete & Auditoría Sin Ruido**: Prohibido `DELETE` físico; bajas lógicas mediante `estado_activo = 0`. En `auditoria_logs` se registran **únicamente mutaciones clave y eventos de seguridad/negocio** (logins, altas/ediciones/bajas lógicas, cambios de precios/planes, registros de peso, mermas, apertura/cierre de caja, tachados, autorizaciones en rojo) con `detalles_json < 200 bytes`. **Prohibido auditar lecturas (`SELECT`/búsquedas) o asistencias QR rutinarias en verde** para no inflar el almacenamiento ni los respaldos a Google Drive.
3. **Algoritmo de Calendario con Desbordamiento de Fin de Mes (*Day Overflow*):**
   - Los planes por meses suman meses calendario exactos y aplican desbordamiento de días cuando el mes destino tiene menos días que el día de inicio:
     - Ej. `31 ene` (año bisiesto, feb = 29 días) + `1 mes` $\rightarrow$ $31 - 29 = +2$ días $\rightarrow$ **2 de marzo**.
     - Ej. `31 ene` (año común, feb = 28 días) + `1 mes` $\rightarrow$ $31 - 28 = +3$ días $\rightarrow$ **3 de marzo**.
     - Ej. `31 ene` + `2 meses` (marzo = 31 días) $\rightarrow$ **31 de marzo**.
     - Ej. `31 ene` + `3 meses` (abril = 30 días) $\rightarrow$ $31 - 30 = +1$ día $\rightarrow$ **1 de mayo**.
   - El **Pase Diario** vence el mismo día de emisión a las `23:59:59`.
4. **Arquitectura de Caja Triple y Flujo de "Tachado" en 2 Pasos:**
   - **Caja Física (`EFECTIVO`):** Apertura con monto inicial y cierre con arqueo físico de billetes/monedas para cálculo de cuadre/descuadre.
   - **Caja Digital (Panel Paralelo):** Flujo simultáneo para `YAPE`, `PLIN`, `TRANSFERENCIA` y `TARJETA` sin contaminar el conteo de efectivo físico.
   - **Dashboards y Reportes Financieros:** Selector reactivo de 3 vistas (`Física`, `Digital`, `Mixta/Consolidada`).
   - **Tachado en 2 Pasos (Solo en Turno de Caja Abierto):**
     - *Paso 1:* Recepcionista o Admin tacha una venta del turno abierto $\rightarrow$ revierte stock y descuenta del saldo del turno de inmediato.
     - *Paso 2:* Bandeja exclusiva de Administrador para confirmar la anulación lógica definitiva o revertir el tachado.
5. **Motor de Créditos Unificado (`creditos_clientes`):**
   - Centraliza: (a) Pases diarios autorizados en semáforo rojo, (b) Productos vendidos al crédito y (c) Membresías a medio pagar (pago parcial), alimentando el reporte y alertas de deudores.
6. **Semáforo QR Inteligente de 3 Estados:**
   - 🟢 **VERDE:** Membresía activa ($> 5$ días restantes) y sin créditos/deudas pendientes.
   - 🟡 **AMARILLO:** Membresía activa con $\le 5$ días por vencer **O** membresía activa pero con crédito/deuda pendiente en `creditos_clientes` (permite ingreso registrando asistencia y dispara alerta visual/sonora en pantalla).
   - 🔴 **ROJO:** Membresía vencida o inexistente $\rightarrow$ bloquea el ingreso y presenta 2 acciones: `[Rechazar (Ir a Caja)]` o `[Autorizar Pase Diario a Crédito]`.
7. **Jerarquía Estricta de 3 Roles, Visibilidad Operativa ("Caso Juan Pérez") y Flujo de Entidades en 2 Fases:**
   - **Regla de Oro de Jerarquía en Tablas Maestras (`Personas` y `Usuarios`):** Ningún usuario puede ver ni alterar en los módulos de `Personas` o `Usuarios` a operadores de jerarquía igual o superior a la suya (`RECEPCIONISTA` < `SUPERVISOR` < `ADMINISTRADOR`).
   - **Módulo de Personas (Nacen desde cero):**
     - `ADMINISTRADOR`: Ve a todas las personas y posee CRUD completo. Es quien inscribe a un `SUPERVISOR` o `RECEPCIONISTA` como `Cliente` o `Proveedor` tomándolo desde la base de `Personas`.
     - `SUPERVISOR`: Ve únicamente personas sin usuario (`u.id IS NULL`) y personas con rol `RECEPCIONISTA` (puede inscribir a un recepcionista como cliente/proveedor). Supervisores y administradores le son invisibles.
     - `RECEPCIONISTA`: Ve en `Personas` únicamente a quienes no tienen rol de usuario (`u.id IS NULL`).
   - **Módulo de Empresas RUC 20 (Nacen desde cero):**
     - Tabla maestra independiente para personas jurídicas (`RUC 20`), con su propia vista en el Directorio separada de `Proveedores`.
   - **Visibilidad Operativa en `Clientes` y `Proveedores` (Caso "Juan Pérez"):**
     - Una misma `Persona` (ej. *Juan Pérez*) puede ser simultáneamente `Usuario del Sistema` (ej. Recepcionista), `Cliente` y `Proveedor`.
     - Una vez que el Administrador/Supervisor inscribe a *Juan Pérez* como `Cliente` (o `Proveedor`), **cualquier `RECEPCIONISTA` de turno (ej. *Marcos Lozano*) SÍ puede ver a Juan Pérez en la tabla de `Clientes` (y `Proveedores`)**, cobrarle en el POS, venderle membresías/productos y registrar su asistencia QR.
     - Sin embargo, si un `RECEPCIONISTA` abre la ficha de un Cliente/Proveedor que además es usuario del sistema, **no podrá alterar sus datos maestros de `Persona`** (bloqueado por jerarquía RBAC), solo operar sus funciones de cliente.
   - **Arquitectura de Formularios en 2 Fases (Creación) y Edición Dual:**
     - **Creación (Usuarios, Clientes y Proveedores):**
       - *Fase 1 (Entidad Base):* Dos opciones explícitas: **`[🔍 Elegir Persona/Empresa Existente]`** (buscador sobre el padrón maestro) o **`[➕ Crear Nueva Persona/Empresa]`** (ingreso de datos base en el acto).
       - *Fase 2 (Datos Únicos):* Ingreso de los campos exclusivos del rol (`Usuario`: username, contraseña, rol, foto; `Cliente`: contacto y número de emergencia, notas médicas, peso inicial; `Proveedor`: rubro y contacto de referencia) + confirmación.
     - **Edición Dual Protegida:**
       - Al editar un `Cliente`, `Proveedor` o `Usuario`, aparecen habilitados por defecto únicamente sus **campos propios**.
       - Existe una segunda pestaña/sección **"Datos de la Persona / Empresa"** en modo lectura con un botón explícito **"Modificar datos personales"** para desbloquear su edición (si el rol del operador tiene jerarquía suficiente), y un **único botón de Confirmar** que guarda transaccionalmente los cambios en una o ambas tablas.
   - **Bitácora de Auditoría:** Solo lectura para `ADMINISTRADOR` y `SUPERVISOR`. Bloqueado para `RECEPCIONISTA` (`Forbidden`).

---

## 3. Backlog de Vertical Slices

- [x] **Slice 1: Base Nativa Tauri v2, SQLite 3 (WAL), Migración 001, Autenticación (`Argon2id`), 3 Roles, Foto de Perfil y Auditoría Universal** -> Verificado ✅
  - [x] Contrato IPC y Esquema DDL (`001_core_auth_audit.sql`: `personas`, `usuarios_sistema`, `auditoria_logs` + Seed `admin`) -> `odd/slice-1-contract.md`
  - [x] Backend Rust (Pool SQLite WAL, hashing `Argon2id`, gestión de sesión/bloqueo por turno, jerarquía RBAC de 3 niveles, foto de perfil `foto_perfil_data_url`, comandos IPC y auditoría inmutable + Tests TDD en verde)
  - [x] Frontend React + TS (Capa 1 Hooks/IPC + Capa 2 Wireframe Pro: Pantalla Login, Header de Sesión con Avatar/Bloqueo/Turno, Modal Desbloqueo, Gestión de Usuarios con roles jerárquicos y Visor de Auditoría + Tests en verde + Build limpio)
- [x] **Slice 2: Directorio Segmentado (Personas, Empresas, Clientes con Historial de Peso, Proveedores Polimórficos) y Credencial QR** -> Verificado ✅
  - [x] Esquema / Consultas de directorio segmentado (`empresas`, `clientes`, `cliente_pesos_historial`, `proveedores`) -> `odd/slice-2-contract.md`
  - [x] Backend IPC (CRUD sin borrado físico, aislamiento de visibilidad por rol, validación Sunat RUC 20 vs DNI, generación/regeneración de `codigo_qr_token` único, registro y cálculo automático de variación de peso `\Delta \text{ kg}`, Auditoría Sin Ruido + Tests TDD en verde)
  - [x] Frontend UI (Vistas segmentadas de Personas, Clientes y Proveedores, modal de récord de peso, tarjeta QR descargable PNG y enlace 1-clic a WhatsApp Web `wa.me` + Tests nuevos en verde + Build limpio)
- [x] **Slice 3: Catálogo de Planes (Algoritmo *Day Overflow*), Inventario de Productos y Mermas** -> Verificado ✅
  - [x] Migración DDL de Planes, Productos y Movimientos de Inventario/Mermas (`003_catalog_plans_inventory.sql`) -> `odd/slice-3-contract.md`
  - [x] Backend IPC (`calcular_fecha_vencimiento` con *Day Overflow* y Pase Diario `23:59:59`, CRUD de planes/productos con `DECIMAL(10,2)` / `rust_decimal`, registro auditado de mermas/consumo propio con justificación + Tests exhaustivos de fechas bisiestas/fines de mes)
  - [x] Frontend UI (Gestión de Planes + Simulador de Vencimiento *Day Overflow*, Catálogo de Productos con alertas de stock mínimo y formulario/historial de Mermas + Tests)
- [x] **Slice 4: Turnos de Caja (Física y Digital), Punto de Venta (POS), Motor de Créditos y "Tachado" en 2 Pasos** -> Verificado ✅
  - [x] Migración DDL (`turnos_caja`, `ventas`, `venta_detalles`, `pagos`, `creditos_clientes` + `membresias_clientes` vinculada al POS) -> `odd/slice-4-contract.md`
  - [x] Backend IPC (Apertura/Cierre y arqueo físico vs panel digital, carrito POS multidominio, creación/amortización de créditos, Tachado Paso 1 y Paso 2 solo en caja abierta + Tests)
  - [x] Frontend UI (Pantallas de Turno de Caja Física/Digital, POS híbrido Productos/Planes/Deudas, flujo de Tachado y bandeja de deudores + Tests)
- [x] **Slice 5: Control de Asistencias Local, Semáforo Inteligente y Recuperación de Días** -> Verificado ✅
  - [x] Contrato Técnico, Algoritmo del Semáforo y Migración DDL (`005_attendance_extensions.sql`) -> `odd/slice-5-contract.md`
  - [x] Backend Rust (Evaluador Semáforo VERDE/AMARILLO/ROJO cruzando vencimiento $\le 5$ días y `creditos_clientes`, filtro anti-rebote 3 min, autorización de Pase Diario a Crédito desde ROJO, recuperación manual de días + Tests)
  - [x] Frontend React + TS (Monitor en vivo de asistencias con semáforo, feedback sonoro Web Audio, acciones en ROJO, ingreso manual por olvido de QR, extensión de días y config + Tests)
- [x] **Slice 6: Servidor Wi-Fi Local (`Axum` dual HTTPS/HTTP `:3443` + mDNS) y Escáner Móvil (iOS / Android)** -> Verificado ✅
  - [x] Contrato Técnico, Esquema de Dispositivos Vinculados y API LAN (`006_lan_mobile_devices.sql` + `odd/slice-6-contract.md`)
  - [x] Backend Rust (`Axum` embebido con listener dual TLS HTTPS + HTTP `:3443`, CA Raíz persistente con `rcgen`/`rustls`, QR SVG ISO-18004 real, selector multi-NIC, bundle offline `/assets/jsqr.js` en `SCANNER_HTML`, normalización HID/QR en `attendance_service` + Tests `CP-LAN-01..14`)
  - [x] Frontend Móvil & Desktop (`LanServerView` con selector de IP/HTTPS-HTTP + QR dinámico, `MobileScannerSimulatorModal` M1/M2 y `AttendanceView` con cámara web `jsQR` y lectura por imagen QR + Tests)
- [x] **Slice 7: Compras a Proveedores, Gastos Operativos y Finanzas (Física / Digital / Mixta)** -> Verificado ✅
  - [x] Migración DDL (`compras_proveedores`, `compra_detalles`, `gastos_operativos`) -> `odd/slice-7-contract.md` + `src-tauri/migrations/007_purchases_expenses_finance.sql`
  - [x] Backend IPC (Compras con incremento de stock, gastos exclusivos Admin, bandeja de confirmación definitiva de tachados Paso 2, agregaciones financieras por vista Física/Digital/Mixta + Tests `CP-FIN-01..12` en verde)
  - [x] Frontend UI (Módulo de Compras, Gastos Admin, Bandeja de Tachados y Dashboard Financiero con selector triple + Tests)
- [x] **Slice 8: Impresión Térmica (58/80mm), PDFs en RAM y Respaldos en Google Drive** -> Verificado ✅
  - [x] Contrato Técnico y Migración DDL (`008_printing_series_backups.sql`: `comprobantes_series`, `comprobantes_emitidos`, `historial_respaldos`) -> `odd/slice-8-contract.md`
  - [x] Backend Rust (Comandos crudos `ESC/POS` 58/80mm + Vista Previa Virtual/TCP/RAW, generación de PDFs en memoria RAM `%PDF-1.4` + envío SMTP, series `NOTA_VENTA`/`BOLETA`/`FACTURA`, `VACUUM INTO` + verificación `PRAGMA integrity_check` + sync Google Drive API v3 + secretos en `keyring` + Tests `CP-PRN-01..12` en verde)
  - [x] Frontend UI (Vista Previa de Ticket 58/80mm, descarga/envío de PDFs en POS y Finanzas, Configuración de Impresora/Series/SMTP y Panel de Backups Locales/Cloud + Tests)
- [x] **Slice 9: Estilización Visual Final, Identidad ZaramaGYM, Flujo Maestro en 2 Fases y Pulido UI/UX (Capa 3)** -> Verificado ✅
  - [x] **Refactorización de Flujo de Entidades y Modales en 2 Fases (Directorio & Usuarios):** -> Verificado ✅
    - [x] **4ta Sub-pestaña Independiente `Empresas (RUC 20)` en Directorio:** Separar la gestión de `Empresas` (que nacen desde cero) de la vista de `Proveedores`, dejando las 4 vistas claras: `Clientes`, `Proveedores`, `Personas` y `Empresas`.
    - [x] **Modales de Creación en 2 Fases (`Usuarios`, `Clientes` y `Proveedores`):**
      - *Fase 1 (Selección de Entidad Base):* Botón **`[🔍 Elegir Persona/Empresa Existente]`** (con buscador en tiempo real sobre el padrón maestro) y botón **`[➕ Crear Nueva Persona/Empresa]`** (formulario para registrar los datos base en el acto).
      - *Fase 2 (Datos Únicos del Rol):* Campos exclusivos de la entidad derivada (`Usuario`: username, contraseña, rol, foto; `Cliente`: nombre/teléfono de emergencia, notas médicas, peso inicial; `Proveedor`: rubro y contacto de referencia) + botón de Confirmar.
    - [x] **Modales de Edición con Guardado Dual y Protección de Datos Personales:**
      - *Sección/Pestaña 1 (Activa por defecto):* Edición directa de los campos propios de `Cliente`, `Proveedor` o `Usuario`.
      - *Sección/Pestaña 2 (`Datos de la Persona / Empresa`):* En modo lectura por defecto con botón explícito **`[Modificar datos personales]`** (habilitado según jerarquía RBAC) y un **único botón de Confirmar** que guarda transaccionalmente los cambios en una o ambas tablas.
    - [x] **Regla de Visibilidad Operativa "Caso Juan Pérez" (`clientes` y `proveedores`):** Permitir que cuando un `ADMINISTRADOR` (o `SUPERVISOR` para un recepcionista) inscriba a un trabajador como `Cliente` o `Proveedor`, cualquier `RECEPCIONISTA` de turno (ej. *Marcos Lozano*) pueda verlo y atenderlo en las vistas/módulos de `Clientes`, `Proveedores`, `POS` y `Asistencias QR`, manteniendo ocultos y protegidos sus datos administrativos en `Personas` y `Usuarios`.
  - [x] **Sistema de Design Tokens e Identidad Visual (Capa 3):** `styles/theme.css` (**Kinetic Ledger** Claro & **Kinetic Obsidian** Oscuro), icono nativo de escritorio, Login Split-Screen con marca de agua, App Shell de 4 componentes (`Header` con buscador global `Ctrl+K`, `Sidebar` colapsable con switch de tema, `Main` con pantalla *Inicio — Próximamente* y `Footer` compacto), soporte de media pantalla (`minWidth: 560`), esqueletos parpadeantes (`Skeleton.tsx`), iconos SVG (`Icon.tsx`), diálogos de confirmación semafóricos G/Y/R (`ConfirmDialog.tsx`) y fluidez de inputs monetarios (`onBlur` `.toFixed(2)`). -> Verificado ✅
  - [x] **Barrido global de emojis → iconos SVG:** Reemplazo completo de pictogramas y emojis en toda la UI (`pos`, `finance`, `printing_backup`, `catalog`, `attendance`, `lan`, `reception`, `entities`, `auth`, `audit`, `home`, `domain/catalog.ts`) por `<Icon />` y puntos semafóricos G/Y/R, eliminando además cualquier `animate-spin` restante. -> Verificado ✅

---

## 4. Estado de Sesión (Punto de Reanudación)
- **Activo:** **Todos los Slices (1 al 9) completados y verificados al 100% ✅** (`cargo test` 79/79 en verde, `npx.cmd vitest run` 26 archivos / 295/295 en verde, `npm run build` limpio, `0` spinners `animate-spin` y `0` emojis en componentes `.tsx`).
- **Siguiente acción:** El MVP base está 100% verificado. La fase de consolidación, mejoras post-MVP aprobadas (Home Dashboard analítico, exportaciones, recuperación de BD) y despliegue final se gestionan en [odd/end_roadmap.md](file:///c:/Users/USER/Desktop/Objeto/ZaramaGYM/odd/end_roadmap.md).
