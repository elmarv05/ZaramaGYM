# 🚀 ROADMAP ADICIONAL: ACTUALIZACIONES REMOTAS (OTA), ENLACE mDNS Y PWA MÓVIL (ZARAMAGYM)

Este documento planifica de forma segura, modular y sin regresiones (*Zero-Breakage*) las 3 mejoras operativas previas al empaquetado de producción:
1. **Actualizador Automático Nativo Remoto (`tauri-plugin-updater`)** con protección transaccional de caja, respaldo preventivo automático y preservación total de BD/credenciales.
2. **Enlace Principal mDNS (`https://zaramagym.local:3443/scanner`)** para el Escáner Móvil LAN (con respaldo seleccionable por IP).
3. **Ícono de Acceso Directo Móvil (Logo ZaramaGYM) + Modo App Pantalla Completa (PWA)** para Android y iOS.

---

## 1. Garantías de Integridad (¿Qué pasa con BD, Correos y Drive al actualizar?)

| Componente | Dónde vive en Windows | ¿Se borra al actualizar? | ¿Requiere reconfigurar? |
| :--- | :--- | :--- | :--- |
| **Programa ejecutable** (`zarama-gym.exe`) | `%LOCALAPPDATA%\ZaramaGYM\` (NSIS) | Se reemplaza limpiamente por la nueva versión | No (1 clic en *"Actualizar"*) |
| **Base de Datos SQLite** (`zaramagym.db`) | `%APPDATA%\com.zaramagym.app\zaramagym.db` | **NO.** Carpeta completamente separada del ejecutable | **NO.** Al reiniciar, la nueva versión abre los mismos clientes, ventas, cajas y auditoría de inmediato |
| **Credenciales Gmail SMTP y Google Drive OAuth** | **Administrador de Credenciales de Windows** (`keyring`) + `configuracion_sistema` en SQLite | **NO.** El instalador nunca toca el llavero de Windows | **NO.** Los correos y respaldos automáticos siguen funcionando sin repetir ningún paso |
| **Dispositivos Móviles Vinculados y CA Raíz** | `dispositivos_moviles` y `configuracion_sistema` en `zaramagym.db` | **NO.** | **NO.** Los celulares vinculados siguen escaneando sin volver a emparejarse |

### Salvaguardas Obligatorias Antes de Instalar una Actualización
Para garantizar que ninguna actualización rompa la integridad contable ni dispare falsos positivos de *Crash Recovery*:
1. **Guardia de Caja Abierta:** Si existe un turno de caja `ABIERTO`, el sistema **bloquea el botón de instalar actualización** y solicita realizar primero el Arqueo y Cierre de Caja.
2. **Respaldo Preventivo Automático (`pre_update`):** Antes de aplicar la actualización, el backend ejecuta automáticamente `VACUUM INTO` + `PRAGMA integrity_check` guardando una copia local (`zaramagym_pre_update_v{actual}_a_v{nueva}.db`) en la carpeta de backups.
3. **Apagado Limpio Coordinado:** Antes de reiniciar la app para instalar, se invoca `mark_clean_shutdown` (`APP_RUNTIME_RUNNING = "0"`) y se cierra sesión ordenadamente, evitando alertas falsas de `CIERRE_FORZADO_DETECTADO` al arrancar la nueva versión.
4. **Migraciones Idempotentes:** Todas las migraciones SQLite futuras deben seguir siendo estrictamente aditivas (`CREATE TABLE IF NOT EXISTS` / `PRAGMA table_info` antes de `ALTER TABLE`) para actualizar esquemas sin tocar registros existentes.

---

## 2. Arquitectura y Flujo de Publicación Remota (Desde otra ciudad)

```text
[Tu PC de Desarrollo]                          [GitHub Releases]                          [PC del Gimnasio]
1. Editas código + subes versión               3. Aloja:                                  4. Al tener internet (o al pulsar
   en tauri.conf.json (ej. 0.1.0 -> 0.2.0)        - ZaramaGYM_0.2.0_x64-setup.exe            "Buscar Actualizaciones"):
2. Compilas firmado con tu clave privada          - ZaramaGYM_0.2.0_x64-setup.exe.sig        consulta latest.json
   Ed25519 (local o GitHub Actions)               - latest.json                           5. Verifica firma Ed25519 con clave
   y publicas el Release v0.2.0                                                              pública embebida
                                                                                          6. Valida caja cerrada + toma backup
                                                                                             preventivo + cierra limpio
                                                                                          7. Instala NSIS en modo pasivo y
                                                                                             reinicia listo para operar
```

> **Nota sobre privacidad del código fuente:**
> * Si tu repositorio `elmarv05/ZaramaGYM` es **público**, el endpoint apunta directo a `https://github.com/elmarv05/ZaramaGYM/releases/latest/download/latest.json`.
> * Si prefieres mantener el código fuente **privado**, se crea un repositorio público liviano exclusivo de entregas (ej. `elmarv05/ZaramaGYM-releases`) que aloja únicamente el `.exe`, el `.sig` y `latest.json` (sin código fuente), permitiendo que el cliente descargue actualizaciones sin requerir tokens de GitHub.

---

## 3. Plan de Ejecución por Vertical Slices (Orden Recomendado)

Se ordenan de menor a mayor riesgo de infraestructura para entregar valor incremental y mantener 100% en verde las pruebas existentes (`cargo test`, `vitest`, `tsc && vite build`) en cada paso.

### SLICE R1: Ícono de Acceso Directo Móvil (Logo ZaramaGYM) + Modo App PWA
* **Objetivo:** Que al pulsar *"Añadir a la pantalla de inicio"* desde Android (Chrome) o iPhone (Safari), el acceso directo use el **logo oficial de ZaramaGYM** y abra el escáner en pantalla completa sin barra del navegador.
* **Alcance Técnico (Sin romper rutas ni tests actuales):**
  1. **Backend (`src-tauri/src/services/lan_service.rs`):**
     - Embeber el PNG del logo oficial (`src-tauri/icons/icon.png` / `128x128@2x.png` o `public/zaramagym-logo.png`, idealmente ≥ 192x192px) usando `include_bytes!`.
     - Agregar rutas públicas en el router `Axum`:
       - `GET /assets/zaramagym-icon.png` (`Content-Type: image/png`, `Cache-Control: public, max-age=86400`).
       - `GET /manifest.webmanifest` (`Content-Type: application/manifest+json`) con `name: "ZaramaGYM Escáner"`, `short_name: "ZaramaGYM"`, `start_url: "/scanner"`, `display: "standalone"`, `background_color: "#0f172a"`, `theme_color: "#0f172a"` y el arreglo `icons` (`192x192`, `512x512`).
     - Añadir en `<head>` de `SCANNER_HTML`:
       - `<link rel="icon" type="image/png" href="/assets/zaramagym-icon.png">`
       - `<link rel="apple-touch-icon" sizes="180x180" href="/assets/zaramagym-icon.png">`
       - `<link rel="manifest" href="/manifest.webmanifest">`
       - `<meta name="theme-color" content="#0f172a">`
       - `<meta name="apple-mobile-web-app-capable" content="yes">`
       - `<meta name="apple-mobile-web-app-title" content="ZaramaGYM">`
  2. **Verificación Empírica:**
     - Tests en `src-tauri/tests/slice_6_tests.rs` validando HTTP `200`, `Content-Type` y cuerpo válido para `/assets/zaramagym-icon.png`, `/manifest.webmanifest` y las etiquetas `<head>` de `/scanner`.
     - Cero impacto en la lógica de escaneo QR ni en la persistencia de sesión.

---

### SLICE R2: Enlace Principal mDNS (`https://zaramagym.local:3443/scanner`) con Respaldo por IP
* **Objetivo:** Que la URL principal mostrada, copiada y codificada en el QR de vinculación use el dominio mDNS **`https://zaramagym.local:3443/scanner`** (manteniendo la IP local como opción de respaldo seleccionable en UI si algún Android antiguo en Hotspot no resolviera `.local`).
* **Alcance Técnico (Sin romper tests de Slice 6):**
  1. **Backend (`src-tauri/src/services/lan_service.rs`):**
     - Exponer en `LanServerStatusDto` la URL mDNS explícita (`https://{mdns_hostname}:{port}/scanner`) y asegurar que `create_mobile_device_pairing` genere `pairing_url` usando `zaramagym.local` cuando mDNS esté activo (o configurable vía parámetro opcional `target_host`, por defecto `zaramagym.local`).
     - Confirmar que el certificado TLS autofirmado ya incluye `zaramagym.local` en los *Subject Alternative Names (SAN)* (ya implementado en `ensure_lan_certificates`, solo reforzar test unitario).
     - Al reiniciar/alternar servidor LAN tras conectarse a un nuevo Mobile Hotspot, re-anunciar inmediatamente el paquete mDNS A-record con la IP vigente de la interfaz activa.
  2. **Frontend (`src/domain/lan.ts` y `src/features/lan/LanServerView.tsx`):**
     - Actualizar el selector de dirección de red en `LanServerView.tsx` para ofrecer como primera opción recomendada: **`zaramagym.local (mDNS Recomendado — Mantiene sesión en Hotspot)`**, seguido de las IPs locales detectadas (`192.168.x.x`) como respaldo inmediato en 1 clic.
     - Actualizar `formatScannerUrl` para priorizar `https://${status.mdnsHostname}:${status.port}/scanner` cuando `status.mdnsActive` esté activo (manteniendo compatibilidad total con los casos de prueba existentes o actualizándolos explícitamente).
  3. **Verificación Empírica:**
     - Tests en `slice_6_tests.rs` (verificando QR y `pairing_url` con `https://zaramagym.local:3443/scanner?pair=...`).
     - Tests en `LanSlice6.test.tsx` (verificando selector mDNS por defecto + cambio a IP de respaldo).

---

### SLICE R3: Actualizador Automático Nativo Remoto (`tauri-plugin-updater` + `tauri-plugin-process`)
* **Objetivo:** Permitir actualizar ZaramaGYM remotamente con **1 clic** desde la propia app, con firma criptográfica Ed25519, bloqueo si hay caja abierta, backup preventivo automático y reinicio inmediato con los mismos datos y credenciales.
* **Alcance Técnico:**
  1. **Dependencias y Capacidades Tauri v2:**
     - Añadir crates `tauri-plugin-updater` y `tauri-plugin-process` en `src-tauri/Cargo.toml` y `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` en `package.json`.
     - Registrar ambos plugins en `src-tauri/src/lib.rs` (`.plugin(tauri_plugin_updater::Builder::new().build())` y `.plugin(tauri_plugin_process::init())`).
     - Habilitar permisos en `src-tauri/capabilities/default.json`: `"updater:default"`, `"process:default"`, `"process:allow-restart"`.
  2. **Firma Criptográfica Ed25519 y Configuración (`src-tauri/tauri.conf.json`):**
     - Generar par de llaves con `npm run tauri signer generate -- -w ~/.tauri/zaramagym.key`.
     - Guardar la **clave privada** de forma segura (local y en GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY`; **NUNCA** subir la clave privada al repositorio Git).
     - Configurar en `tauri.conf.json`:
       - `bundle.createUpdaterArtifacts: true`
       - `plugins.updater.pubkey: "<CLAVE_PUBLICA_ED25519>"`
       - `plugins.updater.endpoints: ["https://github.com/<OWNER>/<REPO_RELEASES>/releases/latest/download/latest.json"]`
       - `plugins.updater.windows.installMode: "passive"`
  3. **Servicio de Pre-Actualización Segura en Rust (`src-tauri/src/services/lifecycle_service.rs` + comando IPC `prepare_safe_app_update`):**
     - Valida que NO exista turno de caja `ABIERTO` (si existe, retorna error `Validation` pidiendo arquear y cerrar primero).
     - Crea backup automático preventivo en local (`VACUUM INTO` + `PRAGMA integrity_check`) etiquetado `pre_update_v{actual}_to_v{nueva}.db` y registra `APP_UPDATE_INITIATED` en `auditoria_logs`.
     - Ejecuta `mark_clean_shutdown(&pool)` (`APP_RUNTIME_RUNNING = "0"`) para que el reinicio tras actualizar no dispare `CIERRE_FORZADO_DETECTADO`.
  4. **Interfaz UI de Actualizaciones (`src/features/updates/AppUpdateModal.tsx` + acceso en Sidebar/Header):**
     - Solo visible/ejecutable para **`ADMINISTRADOR`** (o configurable).
     - Botón discreto **"Buscar Actualizaciones"** (en Configuración/Footer o Sidebar) + chequeo silencioso no intrusivo al iniciar sesión (si no hay internet en el gimnasio, falla en silencio sin mostrar errores ni bloquear el trabajo offline).
     - Modal limpio con Design Tokens ZaramaGYM (sin emojis, sin `animate-spin`): muestra versión actual vs nueva versión, notas de la versión (`notes`), barra de progreso real de descarga (`chunkLength / contentLength`), estado de backup preventivo y botón **"Actualizar y Reiniciar Ahora"**.
  5. **Flujo de Publicación Remota (`GitHub Actions` o Script Local):**
     - Workflow `.github/workflows/release.yml` (usando `tauri-apps/tauri-action@v0` al publicar un tag `v0.2.0`) **y/o** guía paso a paso en `odd/guia-actualizaciones-remotas.md` para compilar localmente y subir `.exe` + `.sig` + `latest.json` al Release de GitHub.
  6. **Verificación Empírica:**
     - Tests Rust (`lifecycle_integrity_tests.rs`): `prepare_safe_app_update` bloquea con turno abierto, crea backup verificado con `PRAGMA integrity_check` y marca `APP_RUNTIME_RUNNING = "0"` cuando no hay caja abierta.
     - Tests Frontend (`AppUpdater.test.tsx`): estados sin internet (silencioso), actualizado al día, nueva versión disponible, bloqueo si hay caja abierta y progreso de descarga/instalación mockeado.
     - Prueba real controlada: compilar `v0.1.0` → instalar → publicar `v0.1.1` de prueba → clicar *"Actualizar"* y verificar que `zaramagym.db`, Gmail, Drive y celulares vinculados siguen intactos.

---

## 4. Checklist de Seguimiento ODD

- [x] **Slice R1:** Ícono ZaramaGYM + PWA Manifest para acceso directo móvil (`/assets/zaramagym-icon.png` + `/manifest.webmanifest` + `<head>` en `SCANNER_HTML` + tests Rust). -> Verificado ✅ (`slice_6_tests` 15/15 en verde).
- [x] **Slice R2 (Hotspot Fix — Anti-NXDOMAIN):** IP local directa por defecto (`https://<IP-LAN>:3443/scanner`) en QR/enlace para compatibilidad total con Hotspot móvil, refresco dinámico de SANs TLS al cambiar IP de Hotspot, reparación de responder mDNS (`UDP 5353` con `SO_REUSEADDR` via `socket2`, multicast multi-interfaz, parser multi-pregunta RFC 6762 y `mdns_active` real) y regla Firewall `TCP 3443 + UDP 5353` (`lan_service.rs`, `state.rs`, `lan.ts`, `LanServerView.tsx`, `allow-lan-firewall.ps1` + tests Rust/Vitest). -> Verificado ✅ (`slice_6_tests` 16/16 + lib 4/4, `vitest` 31/31, `tsc && vite build` limpio).
- [x] **Slice R3:** Actualizador Automático Nativo Remoto (`tauri-plugin-updater` + firma Ed25519 + comando `prepare_safe_app_update` + UI de actualización + workflow/guía de publicación + tests Rust/Vitest). -> Verificado ✅ (`lifecycle_integrity_tests` 7/7, `AppUpdater.test.tsx` 4/4, `tsc && vite build` limpio).
- [x] **Validación Integral Pre-Producción:** Suite `cargo test` (`lifecycle_integrity_tests` 7/7 + `slice_6_tests` 16/16 + lib 3/3) + `vitest` (`AppUpdater` 4/4 + `CashIntegrityLifecycle` 4/4 + LAN 35/35) + `tsc && vite build` en verde sin regresiones antes de pasar a la Fase 4.2 de [end_roadmap.md](file:///c:/Users/USER/Desktop/Objeto/ZaramaGYM/odd/end_roadmap.md).

---

## 5. Decisión Confirmada para Slice R3
- **Repositorio de Releases:** Se utilizará el repositorio actual **`https://github.com/elmarv05/ZaramaGYM`** (`https://github.com/elmarv05/ZaramaGYM/releases/latest/download/latest.json`).
