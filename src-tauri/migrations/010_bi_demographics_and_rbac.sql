-- ============================================================================
-- MIGRACIÓN 010: DEMOGRAFÍA BI, ÍNDICES ANALÍTICOS Y RBAC CONFIGURABLE HOME
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Idempotente)
-- ============================================================================
-- Nota: Las columnas opcionales demográficas se agregan de forma idempotente en
-- `src-tauri/src/db/mod.rs` verificando `PRAGMA table_info` antes de ejecutar:
--   ALTER TABLE personas ADD COLUMN genero TEXT CHECK (genero IS NULL OR genero IN ('MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERO_NO_DECIR'));
--   ALTER TABLE clientes ADD COLUMN canal_captacion TEXT CHECK (canal_captacion IS NULL OR canal_captacion IN ('REDES_SOCIALES', 'RECOMENDACION', 'CAMINANTE_FACHADA', 'PUBLICIDAD_LOCAL', 'PROMOCION', 'OTRO'));
-- ============================================================================

-- 1. ÍNDICES BI PARA CONSULTAS ANALÍTICAS
CREATE INDEX IF NOT EXISTS idx_venta_detalles_tipo_venta
    ON venta_detalles(tipo_item, venta_id);

CREATE INDEX IF NOT EXISTS idx_membresias_cliente_inicio
    ON membresias_clientes(cliente_id, fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_asistencias_cliente_fecha
    ON asistencias(cliente_id, fecha_hora_ingreso DESC);

CREATE INDEX IF NOT EXISTS idx_turnos_caja_fecha_estado
    ON turnos_caja(estado, fecha_apertura DESC);

-- 2. SEED IDEMPOTENTE RBAC CONFIGURABLE PARA RECEPCIONISTA (SECURE-BY-DEFAULT = '0')
INSERT OR IGNORE INTO configuracion_sistema (clave, valor, descripcion, updated_at)
VALUES
    ('HOME_RBAC_REC_MONTHLY_REVENUE', '0', 'Permite a recepcionista ver ingresos operativos del mes en Home Dashboard (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_TAB_FINANCE', '0', 'Permite a recepcionista ver la pestaña Finanzas en Home BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_FINANCE_MODULE_DASHBOARD', '0', 'Permite a recepcionista acceder al dashboard financiero y su reporte PDF (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_TAB_MEMBERS', '0', 'Permite a recepcionista ver la pestaña Socios en Home BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_TAB_ATTENDANCE', '0', 'Permite a recepcionista ver la pestaña Asistencia en Home BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_TAB_INVENTORY', '0', 'Permite a recepcionista ver la pestaña Inventario en Home BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_TAB_CONTROL', '0', 'Permite a recepcionista ver la pestaña Control en Home BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_EXPORT_CLIENTS', '0', 'Permite a recepcionista exportar padrón general de clientes (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_EXPORT_DEBTORS', '0', 'Permite a recepcionista exportar cartera de deudores (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_EXPORT_SALES', '0', 'Permite a recepcionista exportar reporte detallado de ventas y caja (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_EXPORT_CONTEXTUAL', '0', 'Permite a recepcionista exportar vistas contextuales de BI (0/1)', datetime('now', 'localtime')),
    ('HOME_RBAC_REC_EXPORT_EXEC_PDF', '0', 'Permite a recepcionista exportar reporte ejecutivo BI en PDF (0/1)', datetime('now', 'localtime'));
