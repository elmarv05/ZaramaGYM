# 🔄 GUÍA DE ACTUALIZACIONES REMOTAS (OTA) — ZARAMAGYM

Esta guía explica paso a paso cómo publicar una nueva versión de **ZaramaGYM** desde cualquier ciudad para que la PC del gimnasio la descargue e instale en **1 clic** sin perder base de datos, correos Gmail, respaldos de Google Drive ni celulares vinculados.

---

## 1. Configuración Inicial Única en GitHub (Solo se hace 1 vez)

Tu llave privada de firma digital Ed25519 ya fue generada en tu PC de desarrollo fuera del repositorio Git:
* **Llave privada (¡NUNCA subir a Git!):** `C:\Users\USER\.tauri\zaramagym.key`
* **Llave pública (ya configurada en `src-tauri/tauri.conf.json`):** `C:\Users\USER\.tauri\zaramagym.key.pub`

> **IMPORTANTE:** Guarda una copia de seguridad segura de `C:\Users\USER\.tauri\zaramagym.key` (por ejemplo en tu gestor de contraseñas o USB privado). Si se perdiera esa llave privada, las instalaciones ya entregadas no aceptarían nuevas actualizaciones firmadas.

Para habilitar la publicación automática con GitHub Actions:
1. Abre tu repositorio en GitHub: `https://github.com/elmarv05/ZaramaGYM`
2. Ve a **Settings → Secrets and variables → Actions → New repository secret**.
3. Crea el secret llamado **`TAURI_SIGNING_PRIVATE_KEY`** y pega adentro el contenido exacto del archivo `C:\Users\USER\.tauri\zaramagym.key`.
4. *(Opcional)* Si tu llave tuviera contraseña, agrega también `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (actualmente se generó sin contraseña, así que no es obligatorio).
5. Asegúrate de que el repositorio `elmarv05/ZaramaGYM` sea **Público** (para que la PC del gimnasio pueda descargar `latest.json` sin pedir login de GitHub).

---

## 2. Cómo Publicar una Nueva Versión (Ej. de `0.1.0` a `0.2.0`)

### Opción A — Automática en la Nube con GitHub Actions *(Recomendada)*
1. Realiza tus mejoras y verifica que pasen los tests (`cargo test` y `npm test`).
2. Actualiza el número de versión en estos 4 lugares (ej. `0.1.0` → `0.2.0`):
   * `src-tauri/tauri.conf.json` (`"version": "0.2.0"`)
   * `src-tauri/Cargo.toml` (`version = "0.2.0"`)
   * `package.json` (`"version": "0.2.0"`)
   * `src/services/updater/appUpdater.ts` (`CURRENT_APP_VERSION = '0.2.0'`)
3. Haz commit y sube un tag de versión:
   ```bash
   git add .
   git commit -m "release: v0.2.0"
   git push origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. GitHub Actions ejecutará automáticamente `.github/workflows/release.yml`, compilará el instalador Windows NSIS, lo firmará con tu llave Ed25519 y publicará el Release `v0.2.0` junto con `latest.json`.

### Opción B — Compilación Local Manual (Si prefieres compilar en tu PC)
1. En PowerShell, carga la variable de entorno con tu llave privada y compila:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\zaramagym.key" -Raw
   npm run tauri build
   ```
2. En `src-tauri\target\release\bundle\nsis\` se generarán:
   * `ZaramaGYM_0.2.0_x64-setup.exe`
   * `ZaramaGYM_0.2.0_x64-setup.exe.sig`
3. Sube ambos archivos + `latest.json` al nuevo Release `v0.2.0` en GitHub Releases (`https://github.com/elmarv05/ZaramaGYM/releases`).

---

## 3. ¿Qué hace el Cliente en la PC del Gimnasio?
1. Cuando la PC tenga conexión a Internet (ej. conectada al Hotspot), el Administrador verá en el pie de pantalla **`Actualizar a v0.2.0`** (o puede pulsar **`v0.1.0 • Actualizaciones`** en cualquier momento).
2. Al hacer clic en **"Respaldar BD y Actualizar a v0.2.0"**, ZaramaGYM automáticamente:
   * Verifica que **no haya un turno de caja abierto** (si lo hay, pide cerrarlo primero).
   * Crea un **respaldo preventivo verificado** (`VACUUM INTO` + `PRAGMA integrity_check`) en la carpeta de backups.
   * Apaga limpiamente la bandera de runtime (`APP_RUNTIME_RUNNING = "0"`) para no disparar falsa alerta de cierre forzado.
   * Descarga, valida la firma criptográfica Ed25519, instala la nueva versión y reinicia automáticamente.
3. Al volver a abrir, **todos los socios, ventas, cajas, configuración de Gmail, Google Drive y celulares vinculados siguen intactos y listos para operar**.
