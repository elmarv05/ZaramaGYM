# 🏁 END-ROADMAP: CONSOLIDACIÓN Y PUESTA EN MARCHA (ZARAMAGYM)

Este documento centraliza las tareas finales, acuerdos técnicos y mejoras post-MVP aprobadas para la transición del sistema desde el entorno de desarrollo hacia el despliegue final en producción.

---

## 1. Contexto y Estado Base
- **Estado Actual del MVP:** Slices 1 al 9 completados y verificados al 100% (79 tests de Rust y 296 tests de Vitest en verde, compilación TypeScript/Vite limpia).
- **Metodología:** ODD (Organic Driven Development). Proporcionalidad estricta entre complejidad y verificación empírica.
- **Ruta de este documento:** `odd/end_roadmap.md` (ubicación absoluta: `c:\Users\USER\Desktop\Objeto\ZaramaGYM\odd\end_roadmap.md`).

---

## 2. Decisiones de Negocio y Arquitectura Cerradas
1. **Escáner QR exclusivo mediante Smartphone:**
   - **Hardware descartado:** No se utilizará lector óptico de mano (pistola USB/código de barras).
   - **Impacto Frontend:** Eliminar o no incluir botones, estados o referencias a "Lector de código óptico / USB HID" en la interfaz de usuario para mantener las pantallas limpias y enfocadas únicamente en el escáner móvil y la cámara web.
   - **Preservación Backend:** El backend conservará la normalización y detección de buffers por si a futuro el negocio decidiera incorporar hardware adicional, sin afectar la experiencia actual.
2. **Impresora Térmica (58mm / 80mm):**
   - Se mantiene la compatibilidad ESC/POS en backend y frontend para pruebas de campo posteriores cuando el hardware físico sea adquirido.
3. **Restauración de Base de Datos (Disaster Recovery):**
   - Flujo asistido e interactivo para que el Administrador pueda reinstalar el sistema en cualquier PC y restaurar de forma inmediata el archivo `.db` respaldado localmente o descargado de Google Drive.
4. **Tablero Analítico y Reportes Ejecutivos Aprobados:**
   - Evolución de la pantalla de Inicio ("Home Dashboard") para mostrar métricas dinámicas reales.
   - Capacidad de exportar a Excel / CSV y emitir reportes en PDF descargables (padrón de socios, lista de deudores, balances de caja y ventas).
5. **Acompañamiento Didáctico (Paso a Paso):**
   - La configuración de credenciales (Google Drive / SMTP) y las reglas de red/firewall de Windows se abordarán en fases dedicadas con explicaciones claras y sin sobrecarga técnica.
6. **Empaquetado Nativo de Despliegue:**
   - La compilación del instalador Windows (`npm run tauri build`) se reserva como el paso final previo a la entrega al cliente.

---

## 3. Estrategia de Iteraciones de Frontend (¿Cuándo aplicarlas?)
Para evitar retrabajos y mantener la interfaz consistente, las iteraciones de modificación de frontend se distribuyen en tres momentos clave:

1. **Momento 1 — Limpieza Inmediata (Antes de nuevas funciones):**
   - Retirar elementos innecesarios de las pantallas actuales (ej. referencias a lectores ópticos).
   - Ajustar detalles finos de márgenes, scroll y distribución en las vistas ya existentes (Login, Directorio, POS, Asistencias).
2. **Momento 2 — Frontend Integrado en Nuevas Funcionalidades (Durante el desarrollo):**
   - Las nuevas funciones (modal de Restauración de BD, widgets del Home Dashboard, botones de exportación a Excel/PDF) se construyen de una sola vez con su diseño final (Tokens Kinetic Ledger/Obsidian, semáforo G/Y/R, modales fluidos y skeletons parpadeantes).
3. **Momento 3 — Pulido Global Pre-Despliegue (Justo antes del empaquetado):**
   - Una revisión estética y ergonómica de extremo a extremo para asegurar armonía tipográfica, contraste accesible y fluidez de animaciones antes de generar el instalador de producción.

---

## 4. Backlog de Fases y Tareas

### FASE 1: Limpieza de UI y Restauración de Base de Datos (Disaster Recovery)
- [x] **1.1. Depuración de UI de Escaneo:**
  - Retirar del frontend (Home, Asistencias, Header/Footer) cualquier texto, botón o badge que aluda a lector óptico físico o USB-HID, dejando la UI orientada exclusivamente al escáner móvil Wi-Fi / cámara.
- [x] **1.2. Motor de Restauración de Base de Datos en Backend:**
  - Crear comando IPC seguro para recibir la ruta o buffer de un archivo `.db` de copia de seguridad.
  - Validación de integridad con `PRAGMA integrity_check` antes de proceder.
  - Cierre ordenado de conexiones activas del pool de SQLite, reemplazo atómico del archivo de base de datos principal y reinicio del pool.
  - Registro de auditoría inmutable previo y posterior a la restauración.
- [x] **1.3. Interfaz de Restauración Asistida para el Administrador:**
  - Agregar en el módulo de *Impresión, PDFs y Backups* un botón destacado "Restaurar Base de Datos".
  - Pantalla modal de confirmación crítica (Semáforo Rojo) con advertencia de impacto y selector de archivo `.db`.
  - Notificación de éxito y recarga controlada del estado del sistema.

### FASE 2: Tablero Analítico y Reportes Ejecutivos (Post-MVP)
- [x] **2.1. Backend de Agregaciones y Métricas Analíticas:**
  - Consultas SQL optimizadas para el Home Dashboard: afluencia de asistencias por franja horaria del día, ingresos monetarios acumulados del mes (físico vs digital), clientes activos y clientes con membresía próxima a vencer (≤ 3 días).
  - Contrato IPC tipado para servir el payload del dashboard en milisegundos.
- [x] **2.2. Construcción del Home Dashboard Interactivo:**
  - Reemplazar el contenedor "Coming Soon" de `HomeDashboardView.tsx` por widgets dinámicos y métricas en vivo.
  - Gráfica visual de flujo de asistencias del día y accesos directos operacionales rápidos.
- [x] **2.3. Motor de Exportación Contable y Listados (Excel / CSV y PDFs):**
  - Exportación en formato universal (`.csv` / `.xlsx`) para:
    - Padrón general de clientes y estado de membresía.
    - Cartera de créditos y deudores pendientes (`creditos_clientes`).
    - Reporte detallado de ventas y movimientos de caja por rango de fechas.
  - Generación de reportes PDF ejecutivos listos para imprimir o entregar a contabilidad.

### FASE 3: Asesoría Técnica y Configuración de Infraestructura
- [x] **3.1. Sesión Guiada de Credenciales en la Nube:**
  - Explicación didáctica paso a paso de qué son y cómo operan las credenciales de Google Drive OAuth y el servidor de correo SMTP (`odd/guia-infraestructura-fase3.md` + modales interactivos en UI).
  - Acompañamiento en la generación del `client_id` y `client_secret` de Google Cloud y la contraseña de aplicación de correo.
  - Almacenamiento seguro en el llavero nativo del sistema operativo (`keyring` con feature `windows-native` en Windows Credential Manager).
- [x] **3.2. Configuración de Red y Regla de Windows Firewall:**
  - Guía sencilla y script automatizado (PowerShell `scripts/allow-lan-firewall.ps1` / Batch `scripts/Instalar-Regla-Firewall-LAN.bat` + asistente en `LanServerView.tsx`) para autorizar el puerto LAN `:3443` en Windows Defender Firewall, garantizando conexión transparente de los smartphones de recepción sin advertencias intrusivas.

### FASE 4: Pulido Global de Frontend y Empaquetado Final de Despliegue (Go-Live)
- [x] **4.1. Pulido Estético Final (Momento 3 de Frontend):**
  - Chequeo visual integral en modo Claro (Kinetic Ledger) y Oscuro (Kinetic Obsidian).
  - Verificación de ausencia de emojis en `.tsx`, suavidad de modales (portales sobre `document.body`, `my-auto` y `max-h-[calc(100dvh-...)]`), corrección de *Containing Block* en `.zg-view-enter`, límites horizontales de `<main>` (`max-w-[1440px] min-w-0`) y ausencia de parpadeos de carga (skeletons activos).
- [x] **4.1.b. Protección de Cierre de Ventana (X) y Crash Recovery de Caja:**
  - Interceptar `WindowEvent::CloseRequested` en Tauri (`lib.rs`) para cancelar cierre (`prevent_close()`) si existe turno de caja `ABIERTO` y notificar al Frontend (`app://close-blocked-open-shift`), o cerrar limpiamente (logout + apagar bandera runtime) si no hay caja abierta.
  - Patrón Crash Recovery con bandera persistente `APP_RUNTIME_RUNNING` + heartbeat periódico en `configuracion_sistema`: al reiniciar tras cierre forzado/apagado brusco con caja abierta, auditar `CIERRE_FORZADO_DETECTADO` con última actividad y hora de reinicio, y mostrar modal de recuperación en UI para retomar o arquear/cerrar el turno. -> Verificado ✅ (`cargo test` 23/23, `vitest` 4/4, `tsc && vite build` limpio).
- [x] **4.1.c. Consolidación RBAC a 2 Roles (`ADMINISTRADOR` y `RECEPCIONISTA`) y Matriz Definitiva de Permisos:** -> Verificado ✅ (`cargo test` 96/96, `vitest` 30 archivos / 334/334, `tsc && vite build` limpio)
  - Eliminación total del rol `SUPERVISOR` en Base de Datos (migración automática `SUPERVISOR -> RECEPCIONISTA`), Backend Rust (`UserRole`) y Frontend React/TypeScript.
  - Permisos de `RECEPCIONISTA`:
    - **Clientes:** listar, ver perfil/QR/WhatsApp/pesaje, crear cliente (`create_client`), modificar cliente (`update_client` con protección jerárquica "Caso Juan Pérez"), regenerar QR y registrar peso. **Bloqueado desactivar/eliminar cliente (`toggle_client_active` exclusivo Admin)**.
    - **Proveedores y Empresas RUC 20:** **visualizar (`list_suppliers`, `get_supplier`, `list_companies`, `get_company`) y crear (`create_supplier`, `create_company`)**, pero **bloqueado modificar (`update_supplier`, `update_company`) y desactivar/eliminar (`toggle_supplier_active`, `toggle_company_active`)** (edición y baja exclusivas de `ADMINISTRADOR`). La pestaña y gestión directa del padrón de `Personas` (`create_person`, `update_person`, `toggle_person_active`) es exclusiva de `ADMINISTRADOR`.
    - **Catálogo de Planes (Tarifas):** ver planes, usar Simulador Day Overflow y **crear planes/tarifas nuevas (`create_plan`)**. **Bloqueado modificar planes existentes (`update_plan`) y desactivar/eliminar planes (`toggle_plan_active`)** (exclusivos de `ADMINISTRADOR`).
    - **Catálogo de Productos y Kardex:** ver, **registrar (`create_product`) y modificar (`update_product`) productos**. **Bloqueado desactivar productos (`toggle_product_active`) y registrar mermas/ajustes (`record_inventory_movement`)** (exclusivos de `ADMINISTRADOR`).
    - **Caja y POS:** abrir/cerrar turno, vender productos y membresías, cobrar créditos, emitir comprobantes (Nota de Venta, Boleta, Factura), imprimir tickets, descargar PDF, enviar por correo SMTP predeterminado y WhatsApp. Puede ejecutar **Tachado Paso 1 (`strike_sale`) únicamente en su turno abierto**; la **Resolución Paso 2 (`resolve_struck_sale`)** e historial de turnos cerrados (`list_cash_shifts`) son exclusivos de `ADMINISTRADOR`.
    - **Asistencias y Prórrogas:** escáner QR, ingreso manual, historial, pase diario a crédito en semáforo rojo y **otorgar días gratis / prórrogas (`extend_membership_days`)**. **Configurar parámetros del semáforo (`update_system_config`) es exclusivo de `ADMINISTRADOR`**.
    - **Finanzas, Compras y Bandeja de Tachados:**
      - **Dashboard Financiero (`get_financial_dashboard_summary`, `generate_financial_report_pdf`):** **acceso de lectura y exportación PDF/CSV/Excel habilitado para `RECEPCIONISTA` y `ADMINISTRADOR`**.
      - **Compras a Proveedores:** **ver (`list_supplier_purchases`, `get_supplier_purchase_detail`) y registrar nuevas compras (`create_supplier_purchase`)** habilitado para `RECEPCIONISTA`; **anular compras (`cancel_supplier_purchase`) es exclusivo de `ADMINISTRADOR`**.
      - **Bandeja Global de Tachados (`list_struck_sales_tray`):** **acceso de visualización (solo lectura) habilitado para `RECEPCIONISTA`**; **resolver/confirmar anulación Paso 2 (`resolve_struck_sale`) es exclusivo de `ADMINISTRADOR`**.
      - **Gastos Operativos (Luz, Agua, Servicios):** **100% exclusivo de `ADMINISTRADOR`** (oculto y bloqueado para `RECEPCIONISTA`).
    - **Exportaciones (CSV / Excel `.xlsx` / PDF de Clientes, Deudores, Ventas/Caja y Reporte Financiero PDF):** **habilitadas para todos los roles (`RECEPCIONISTA` y `ADMINISTRADOR`)**.
    - **Exclusivos 100% de `ADMINISTRADOR`:** Gestión de Usuarios, Bitácora de Auditoría, Gastos Operativos (Luz/Agua), Configuración de Impresión/Empresa/Series/SMTP/Backups/Restore y Panel de Servidor Wi-Fi & Escáner Móvil LAN en PC.
- [x] **4.1.d. Actualizaciones Remotas (OTA), Enlace mDNS (`zaramagym.local:3443`) e Ícono PWA Móvil:** -> Verificado ✅
  - Todos los Vertical Slices (`R1`, `R2`, `R3`) completados y verificados en [odd/remote_updates_mobile_roadmap.md](file:///c:/Users/USER/Desktop/Objeto/ZaramaGYM/odd/remote_updates_mobile_roadmap.md) + guía de publicación en [odd/guia-actualizaciones-remotas.md](file:///c:/Users/USER/Desktop/Objeto/ZaramaGYM/odd/guia-actualizaciones-remotas.md).
- [ ] **4.2. Compilación de Release y Creación del Instalador:**
  - Ejecutar `npm run tauri build` para empaquetar el binario optimizado para Windows (`.msi` / `.exe`).
  - Validación de empaquetado de assets embebidos (servidor Axum LAN, `jsQR`, migraciones SQLite y certificados).
- [ ] **4.3. Validación de Instalación Limpia:**
  - Probar la instalación del paquete en una máquina Windows estándar (sin Node ni Rust) para asegurar que el sistema inicie y opere de forma 100% autónoma.
- [ ] **4.4. Pruebas de Campo con Hardware Físico:**
  - Validación con smartphone real en la red Wi-Fi del gimnasio.
  - Prueba de impresión térmica cuando el hardware esté disponible físicamente.

---

## 5. Historial de Cambios y Sesiones
- **Fecha de creación:** 2026-11-17
- **Autor:** `@odd-orchestrator` en acuerdo con el Product Owner / Usuario.
- **Estado actual:** **Fases 1, 2 y 3 completadas y verificadas al 100%** (llavero nativo de Windows `keyring` activo, soporte OAuth `Client ID`/`Client Secret`/`Token`, asistentes guiados integrados en UI, scripts automatizados de Firewall LAN `:3443` y guía `odd/guia-infraestructura-fase3.md`). Suite verificada: `cargo test` 88/88, `vitest` 27 archivos / 309/309, `tsc && vite build` limpio. Lista para iniciar **Fase 4 (Pulido Global y Empaquetado Final de Despliegue)** o configurar las credenciales en vivo.
