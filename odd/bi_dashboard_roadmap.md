# Roadmap ODD: Dashboard Analítico BI del Módulo Inicio y RBAC Configurable (`ZaramaGYM`)

## 1. Contexto & Decisiones Cerradas (Etapa 1)
- **Plataforma / Stack:** Desktop Local-First Tauri v2 (Rust + `sqlx` + SQLite WAL + `rust_decimal`) + React 19 + TypeScript + Tailwind CSS 3 + Primitivas SVG nativas (sin dependencias externas pesadas).
- **Arquitectura de Inicio:** 6 sub-pestañas especializadas:
  1. `Operativo (Hoy)`
  2. `Finanzas y Rentabilidad` (complementario al módulo `Finanzas`)
  3. `Socios y Retención`
  4. `Asistencia y Demanda`
  5. `Productos e Inventario`
  6. `Control, Riesgo y Reportes` (incluye Centro de Reportes y Reporte Ejecutivo PDF consolidado en RAM)
- **Enriquecimiento Demográfico (`Migración 010`, `PRAGMA user_version = 10`):**
  - `personas.genero`: `'MASCULINO' | 'FEMENINO' | 'OTRO' | 'PREFIERO_NO_DECIR' | NULL`
  - `clientes.canal_captacion`: `'REDES_SOCIALES' | 'RECOMENDACION' | 'CAMINANTE_FACHADA' | 'PUBLICIDAD_LOCAL' | 'PROMOCION' | 'OTRO' | NULL`
- **RBAC Configurable (`HOME_RBAC_*`, 12 interruptores, Secure-by-Default = `'0'`):**
  - Gestionado por `ADMINISTRADOR` en la nueva sub-pestaña **`Permisos de Recepción`** dentro del módulo **`Usuarios`** (con acceso directo opcional desde la cabecera de `Inicio`).
  - Incluye control del **Dashboard Financiero y PDF** dentro del módulo **`Finanzas`** (`HOME_RBAC_REC_FINANCE_MODULE_DASHBOARD`).
  - Aplicado con defensa en profundidad en el backend Rust (`require_home_permission`) y reflejado reactivamente en Frontend.
- **Estándares Innegociables ZaramaGYM:** Cero emojis en `.tsx`, cero `animate-spin` (solo `Skeleton`), temas *Kinetic Ledger* (Claro) y *Kinetic Obsidian* (Oscuro), `preventEnterKeySubmit` en formularios, `DECIMAL(10,2)` / `rust_decimal` en montos, y Zero-Delete.

---

## 2. Backlog de Vertical Slices (Etapa 2)

- [x] **BI-Slice 1: Migración 010 (Demografía Opcional + 12 Permisos RBAC), Directorio y Sub-Pestaña `Permisos de Recepción` en `Usuarios`** -> Verificado ✅ (`cargo test` 107/107, `vitest` 32 archivos / 363/363, `tsc && vite build` limpio, 0 emojis, 0 `animate-spin`)
  - [x] Migración idempotente `010` (`PRAGMA user_version = 10`): columnas `personas.genero`, `clientes.canal_captacion`, 4 índices BI, y seed de 12 claves `HOME_RBAC_*` en `configuracion_sistema`.
  - [x] Backend Rust: soporte de `genero` y `canal_captacion` en modelos/servicios de `entity_service`; servicio `permissions_service` con `get_receptionist_permissions`, `get_my_effective_permissions`, `update_receptionist_permissions` (auditado `HOME_PERMISSIONS_UPDATED`) y guardia `require_permission`; aplicación estricta en `dashboard_service`, `finance_service` y `printing_backup_service`.
  - [x] Frontend React/TS: campos opcionales `Género` y `Canal de Captación` en formularios de Directorio (`Persons`, `Clients`, `EntityProfile`); nueva sub-pestaña **`Permisos de Recepción`** en `UserManagementTable` (módulo `Usuarios`) con 12 switches agrupados; adaptación de `FinanceView` y `HomeDashboardView` para respetar los permisos en vivo.
  - [x] Verificación TDD: `cargo test` + `vitest` + `tsc && vite build`.

- [x] **BI-Slice 2: Suite de Gráficos SVG Nativos, Shell de 6 Sub-Pestañas, `Operativo (Hoy)` y `Finanzas y Rentabilidad` BI** -> Verificado ✅ (`cargo test` 111/111, `vitest` 34 archivos / 379/379, `tsc && vite build` limpio, 0 emojis, 0 `animate-spin`)
  - [x] Primitivas SVG accesibles en `src/components/primitives/charts/` (`MetricKpiCard`, `MultiSeriesLineChart`, `BarChart`, `DonutChart`, `HeatmapGrid`) + `BiFilterBar` (presets fecha, rango personalizado, granularidad `DIA|SEMANA|MES`, comparativa `Δ%`).
  - [x] Backend Rust: comando `get_bi_finance_analytics` (ingresos vs egresos temporales con zero-filling, flujo neto, margen %, ticket promedio, descuentos, mix por línea ponderado, mix por método, gastos por categoría, comparativa vs periodo anterior) + `export_bi_finance_analytics` (`CSV`/`XLSX`).
  - [x] Frontend React/TS: refactorización de `HomeDashboardView` al Shell de 6 sub-pestañas gobernado por RBAC + Sub-pestaña 1 (`Operativo (Hoy)` refinada) + Sub-pestaña 2 (`Finanzas y Rentabilidad`) + acceso rápido Admin a `Usuarios → Permisos de Recepción`.
  - [x] Verificación TDD: `cargo test` + `vitest` + `tsc && vite build`.

- [x] **BI-Slice 3: `Socios y Retención` + `Asistencia y Demanda` (Heatmap 7×18)** -> Verificado ✅ (`cargo test` 114/114, `vitest` 35 archivos / 383/383, `tsc && vite build` limpio, 0 emojis, 0 `animate-spin`)
  - [x] Backend Rust: comandos `get_bi_members_analytics` (demografía edad/género/captación, altas vs renovaciones vs vencimientos, tasa renovación/churn, ARPU, prórrogas, rendimiento por plan, tabla de socios activos en riesgo de abandono, resumen peso) y `get_bi_attendance_analytics` (heatmap Día×Hora `05:00`–`22:00`, tendencia, frecuencia semanal, semáforo, canales, conversión pases rojos, top constantes) + exportaciones contextuales `CSV`/`XLSX`.
  - [x] Frontend React/TS: Sub-pestaña 3 (`Socios y Retención`) y Sub-pestaña 4 (`Asistencia y Demanda`) con filtros cruzados, acciones rápidas (WhatsApp/Directorio) y exportación contextual.
  - [x] Verificación TDD: `cargo test` + `vitest` + `tsc && vite build`.

- [x] **BI-Slice 4: `Productos e Inventario` + `Control, Riesgo y Reportes`** -> Verificado ✅ (`cargo test` 117/117, `vitest` 36 archivos / 387/387, `tsc && vite build` limpio, 0 emojis, 0 `animate-spin`)
  - [x] Backend Rust: comandos `get_bi_inventory_analytics` (top productos por unidades/ingresos/margen estimado con ocultación RBAC de costos/márgenes, ventas por categoría, stock muerto configurable, valorización y mermas/consumo) y `get_bi_control_analytics` (aging cartera morosa `0–7d`/`8–30d`/`31–60d`/`>60d`, recuperación de créditos, arqueos y descuadres por operador, tasa de tachados/anulaciones por vendedor, eventos críticos auditoría) + exportaciones contextuales `CSV`/`XLSX`.
  - [x] Frontend React/TS: Sub-pestaña 5 (`Productos e Inventario`) y Sub-pestaña 6 (`Control, Riesgo y Reportes` con Centro Oficial de Reportes RBAC y filtros de fecha/canal).
  - [x] Verificación TDD: `cargo test` + `vitest` + `tsc && vite build`.

- [x] **BI-Slice 5: Reporte Ejecutivo PDF Consolidado, Normalización de `fecha_vencimiento` y QA/Seguridad Integral** -> Verificado ✅ (`cargo test` 120/120, `vitest` 37 archivos / 390/390, `tsc && vite build` limpio, 0 emojis, 0 `animate-spin`)
  - [x] Backend Rust: motor `generate_executive_bi_report_pdf` multipágina en RAM (encabezado corporativo + 4 bloques consolidados del periodo con `Δ%`) protegido por `HOME_RBAC_REC_EXPORT_EXEC_PDF` + escudo de costos/márgenes; normalización definitiva de `membresias_clientes.fecha_vencimiento` a `YYYY-MM-DD 23:59:59` al crear desde POS + backfill idempotente en `db/mod.rs`.
  - [x] Frontend React/TS: botón y descarga de **Reporte Ejecutivo PDF Consolidado** en Sub-pestaña 6 (y fallback en `Operativo` si aplica) + pulido responsivo, Claro/Oscuro, verificación cero emojis / cero `animate-spin`.
  - [x] Auditoría final `@qa-auditor` y `@sec-auditor` + parche de cierre (`M-01` cota de rangos/restas seguras, `B-01` escudo de costos en PDF Ejecutivo, `B-02` CSV Formula Injection, tokens CSS/Tailwind y endurecimiento `NaN` en `BarChart`) + suite completa en verde (`cargo test` 120/120, `vitest` 390/390, `tsc && vite build`).

---

## 3. Estado de Sesión
- **Estado:** **Todos los Slices BI (BI-Slice 1 al BI-Slice 5) completados, auditados y verificados al 100% ✅.**
- **Evidencia final:** `cargo test` **120/120**, `vitest` **37 archivos / 390/390**, `npm run build` (`tsc && vite build`) **exit code 0**, **0 emojis**, **0 `animate-spin`**.
