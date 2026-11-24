# Manual de Usuario — Conexiones Externas de ZaramaGYM

**Versión:** 1.0  
**Audiencia:** Administrador de ZaramaGYM (PC de recepción con Windows 10/11)  
**Alcance:** Guía paso a paso completa para configurar, verificar y mantener las **3 conexiones externas** que admite ZaramaGYM:
1. **Google Drive** — Respaldos automáticos en la nube cada **2 horas** (copia local + nube).
2. **Gmail (SMTP)** — Envío de comprobantes PDF (Notas de Venta, Boletas, Facturas) y reportes financieros por correo.
3. **Celulares (Wi-Fi LAN `:3443`)** — Escáner móvil QR en tiempo real para control de asistencias (Android y iPhone, sin Internet).

---

## Tabla Resumen de las 3 Conexiones

| Conexión | Módulo en ZaramaGYM | Rol Requerido | ¿Requiere Internet? | Claves / Credenciales | Almacenamiento Seguro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Google Drive** | `Administración y Red` → `Impresión, PDFs y Backups` → `Respaldos SQLite & Drive` | `ADMINISTRADOR` | Sí (para subir; el respaldo local funciona sin Internet) | `Folder ID`, `Client ID`, `Client Secret (GOCSPX-...)`, `Refresh Token (1//...)` | **Windows Keyring** (`GDRIVE_CLIENT_SECRET`, `GDRIVE_ACCESS_TOKEN`) |
| **2. Gmail SMTP** | `Administración y Red` → `Impresión, PDFs y Backups` → `Impresora Térmica & SMTP` | `ADMINISTRADOR` | Sí | Correo Gmail, `smtp.gmail.com:587`, **Contraseña de Aplicación (16 letras)** | **Windows Keyring** (`SMTP_PASSWORD`) |
| **3. Celulares LAN** | `Administración y Red` → `Wi-Fi & Escáner Móvil` | `ADMINISTRADOR` (para vincular/revocar) | **No** (solo mismo Wi-Fi/LAN) | Certificado CA local (`zaramagym-root-ca.crt`) + Código de enlace de 6 caracteres | Base de datos local (`LAN_CA_KEY_PEM` + token único por dispositivo) |

---

## 0. Seguridad y Protección de Claves Privadas (`Windows Keyring`)

Antes de comenzar, es fundamental entender cómo ZaramaGYM protege tus llaves privadas:

- **Qué se guarda en la base de datos SQLite (`configuracion_sistema`):**  
  Únicamente parámetros de configuración **no secretos**, como el nombre del gimnasio, tu dirección de correo remitente (`smtp_user`), el servidor SMTP (`smtp.gmail.com`), el puerto (`587`), el ID de carpeta de Drive (`backup_gdrive_folder_id`) y el `Client ID` público de Google Cloud.
- **Dónde se guardan tus claves secretas:**  
  ZaramaGYM **nunca** guarda contraseñas ni tokens en archivos de texto ni dentro del archivo `.db`. Los almacena cifrados en el **Administrador de Credenciales nativo de Windows (`keyring`)**, bajo el servicio **`ZaramaGYM`**:
  - `GDRIVE_CLIENT_SECRET` (Clave privada de tu app en Google Cloud)
  - `GDRIVE_ACCESS_TOKEN` (Tu Refresh Token permanente `1//...` de Google Drive)
  - `SMTP_PASSWORD` (Tu Contraseña de Aplicación de 16 letras de Gmail)
- **Ventaja clave:** Si alguna vez compartes o respaldas tu archivo de base de datos `.db`, **nadie** podrá leer tus contraseñas de Gmail ni tus tokens de Google Drive.
- **Reglas de oro de seguridad:**
  1. Nunca compartas por WhatsApp, correo ni capturas de pantalla tu **Client Secret (`GOCSPX-...`)**, tu **Refresh Token (`1//...`)** ni tu **Contraseña de Aplicación de Gmail**.
  2. Si cambias de computadora o reinstalas Windows, deberás volver a ingresar las claves en el nuevo equipo (ya que el llavero está vinculado a tu usuario de Windows).
  3. Usa preferiblemente una cuenta Gmail dedicada al gimnasio (por ejemplo, `administracion.zaramagym@gmail.com`) para que los respaldos y correos no se mezclen con correos personales.

---

# MANUAL 1: Conexión con Google Drive (Respaldos cada 2 Horas — Local + Nube)

## 1.1 ¿Cómo funciona el respaldo automático cada 2 horas?

ZaramaGYM incluye un programador automático en segundo plano configurado por defecto cada **2 horas**:
1. Genera una copia en caliente compactada y consistente de toda la base de datos mediante **`VACUUM INTO`** (sin bloquear ventas ni asistencias) y la guarda en el disco duro local (carpeta `backups/` junto a tu base de datos).
2. Inmediatamente después, si Google Drive está habilitado y configurado, **sube esa misma copia a tu carpeta de Google Drive** y la marca como **`SINCRONIZADO_CLOUD`**.
3. **Protección ante cortes de Internet o errores en la nube:** Si no hay Internet o Google rechaza temporalmente la subida, **tu respaldo local permanece 100% guardado, íntegro y restaurable** en estado `COMPLETADO`, y en el historial queda el detalle exacto del motivo pendiente para que puedas subirlo después con un clic en **`Subir a Drive`**.
4. **Respaldo manual inmediato:** Cuando pulsas **`Crear Respaldo Ahora (VACUUM INTO)`** con Google Drive activo, ZaramaGYM también guarda la copia local y la sube inmediatamente a la nube.

---

## 1.2 Diccionario de Claves de Google (¡Evita el error más común!)

Durante la configuración en Google verás varios códigos parecidos. Esta tabla te indica **cuál va en cada casilla** y **cuáles NO debes pegar**:

| Dato | Cómo empieza / se ve | ¿Para qué sirve? | ¿Dónde va en ZaramaGYM? |
| :--- | :--- | :--- | :--- |
| **ID de Carpeta Drive** | `1A2B3C4D5E6F...` (o la URL completa `https://drive.google.com/drive/folders/...`) | Indica en qué carpeta de Drive se guardan los `.db` | Casilla **`ID de Carpeta Google Drive`** |
| **Client ID** | `1234567890-xxxx.apps.googleusercontent.com` | Identificador público de tu app en Google Cloud | Casilla **`Client ID OAuth (Google Cloud)`** |
| **Client Secret** | **`GOCSPX-...`** | **Clave privada** de tu app en Google Cloud | Casilla **`Client Secret OAuth (Keyring)`** |
| **Refresh Token** | **`1//...`** | **Llave permanente** que permite a ZaramaGYM pedir nuevos pases cada 2 horas automáticamente | Casilla **`Refresh Token OAuth2 de Google Drive (1//...)`** ✅ |
| *Authorization Code* | `4/0A...` | Código temporal de 1 solo uso (sirve solo para canjearlo en Playground) | ❌ **NO pegar en ZaramaGYM** |
| *Access Token* | `ya29...` | Pase temporal que **vence en 1 hora** (causa error `401 Unauthorized`) | ❌ **NO usar para respaldos automáticos cada 2 horas** |

> **¿Por qué suele ocurrir el error `401 Unauthorized (Invalid Credentials)`?**  
> Porque se pegó un **Access Token (`ya29...`)** que Google caduca exactamente a los 60 minutos, en lugar del **Refresh Token (`1//...`)** que ZaramaGYM renueva automáticamente cada 2 horas sin expirar.

---

## 1.3 Paso a Paso Completo (10 a 15 minutos, se hace una sola vez)

### Paso 1: Crear la carpeta de respaldos en Google Drive
1. Inicia sesión en [drive.google.com](https://drive.google.com) con la cuenta Gmail del gimnasio.
2. Haz clic en **`+ Nuevo` → `Carpeta nueva`** y nómbrala, por ejemplo: **`Respaldos_ZaramaGYM`**.
3. Haz doble clic para entrar dentro de esa carpeta.
4. Copia la dirección (URL) de la barra superior del navegador. Se verá así:
   ```text
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
   ```
   - El **Folder ID** es todo lo que va después de `/folders/` (en el ejemplo: `1AbCdEfGhIjKlMnOpQrStUvWxYz`).
   - *Nota:* ZaramaGYM acepta tanto el **ID limpio** como la **URL completa** (extrae el ID automáticamente al guardar).

---

### Paso 2: Crear tu proyecto gratuito en Google Cloud y activar Google Drive API
1. Entra a [console.cloud.google.com](https://console.cloud.google.com/) con **la misma cuenta Gmail** donde creaste la carpeta de Drive.
2. Si es la primera vez, acepta los términos de servicio (no necesitas tarjeta de crédito; usar Google Drive API para tus propios respaldos es **100% gratuito**).
3. En la parte superior izquierda, haz clic en el selector de proyectos → **`Proyecto nuevo` (New Project)**:
   - **Nombre del proyecto:** `ZaramaGYM Backups`
   - Haz clic en **`Crear`** y asegúrate de seleccionar **`ZaramaGYM Backups`** en el selector superior.
4. En el menú lateral (`☰`) ve a **`APIs y servicios` → `Biblioteca`** (Library).
5. En el buscador escribe **`Google Drive API`**, haz clic en el resultado y pulsa el botón azul **`Habilitar`** (Enable).

---

### Paso 3: Configurar la Pantalla de Consentimiento y Publicar en Producción (PASO CRÍTICO)

> **Nota sobre la interfaz de Google Cloud:** Google muestra esta sección como **`APIs y servicios → Pantalla de consentimiento de OAuth`** o como **`Google Auth Platform`** (con submenús *Descripción general / Desarrollo de marca (Branding) / Público (Audience)*). Los pasos son equivalentes en ambas vistas.

1. En el menú lateral ve a **`APIs y servicios` → `Pantalla de consentimiento de OAuth`** (o **`Google Auth Platform`** → **`Comenzar`**).
2. Completa la información básica (**Desarrollo de marca / Información de la app**):
   - **Nombre de la aplicación:** `ZaramaGYM`
   - **Correo electrónico de asistencia al usuario:** selecciona tu correo `@gmail.com`.
   - **Público / Tipo de usuario:** selecciona **`Externo` (External)**.
   - **Correo de contacto del desarrollador:** escribe tu mismo correo `@gmail.com`.
   - Acepta las políticas y haz clic en **`Guardar y continuar`** (o **`Crear`**).
3. **Permisos / Scopes (si aparece esta pestaña):**
   - Haz clic en **`Agregar o quitar permisos`**, busca y selecciona únicamente:
     ```text
     https://www.googleapis.com/auth/drive.file
     ```
   - *¿Por qué este permiso?* Por máxima privacidad: autoriza a ZaramaGYM a subir y gestionar **únicamente** los respaldos que él mismo crea, sin poder leer, modificar ni eliminar tus demás archivos personales de Drive.
4. **PASO CRÍTICO — Pasar de "En pruebas" a "En producción":**
   - Entra a la pestaña **`Público` (Audience)** (o dentro de *Pantalla de consentimiento de OAuth* en el bloque **Estado de publicación**).
   - Verás que por defecto aparece en **`En pruebas` (Testing)**.
   - **IMPORTANTE:** Si lo dejas *En pruebas*, Google **revoca el Refresh Token automáticamente cada 7 días** y los respaldos dejarán de subir con error `invalid_grant`.
   - Haz clic en el botón **`Publicar aplicación` (Publish app)** → **`Confirmar`**.
   - El estado cambiará a **`En producción` (In production)**.  
     *(Nota: Google puede mostrarte un aviso sugiriendo "Enviar para verificación". **NO** necesitas verificar tu app ante Google porque solo la usarás tú con tu propia cuenta; simplemente continúa al Paso 4).*

---

### Paso 4: Generar tu `Client ID` y tu `Client Secret` (Clave Privada)
1. En el menú lateral ve a **`APIs y servicios` → `Credenciales`** (o **`Google Auth Platform` → `Clientes`**).
2. Haz clic en **`+ Crear credenciales` → `ID de cliente de OAuth`** (o **`+ Crear cliente`**).
3. Completa los campos exactamente así:
   - **Tipo de aplicación:** **`Aplicación web`** (Web application).
   - **Nombre:** `ZaramaGYM Desktop`.
   - En la sección **`URI de redireccionamiento autorizados` (Authorized redirect URIs)** haz clic en **`+ Agregar URI`** y pega **exactamente** esta dirección (sin barra `/` al final y sin espacios):
     ```text
     https://developers.google.com/oauthplayground
     ```
4. Haz clic en **`Crear`**.
5. Google te mostrará una ventana con tus dos llaves:
   - **ID de cliente (`Client ID`):** termina en `.apps.googleusercontent.com`
   - **Secreto del cliente (`Client Secret`):** empieza con **`GOCSPX-...`**
6. Copia ambos valores en un bloc de notas temporal (que borrarás al terminar) o mantén esta pestaña abierta.  
   *(Advertencia de Google Cloud: Google solo muestra el `Client Secret` completo al momento de crearlo o descargando el JSON inmediatamente; guárdalo con cuidado antes de cerrar la ventana).*

---

### Paso 5: Obtener tu `Refresh Token` Permanente (`1//...`) en OAuth 2.0 Playground

1. Abre en otra pestaña: [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. **SUBPASO 5.1 (OBLIGATORIO — HACERLO ANTES DEL STEP 1):**
   - Haz clic en el ícono de **engranaje** (esquina superior derecha, *OAuth 2.0 Configuration*).
   - Verifica que:
     - **OAuth flow:** `Server-side`
     - **Access type:** `Offline` (esto es lo que obliga a Google a entregar el `Refresh token`)
     - **Force prompt:** `Consent Screen`
   - Marca la casilla **`Use your own OAuth credentials`**.
   - Pega tu **`OAuth Client ID`** y tu **`OAuth Client Secret` (`GOCSPX-...`)** del Paso 4.
   - Haz clic en **`Close`**.
   > **Atención:** Si olvidas marcar *Use your own OAuth credentials*, el token caducará en 24 horas y ZaramaGYM no podrá renovarlo.
3. **SUBPASO 5.2 (Step 1 — Select & authorize APIs):**
   - En la columna izquierda, busca **`Drive API v3`** y haz clic en la flecha para desplegarlo.
   - Marca únicamente **`https://www.googleapis.com/auth/drive.file`** (o pégalo en el campo *Input your own scopes*).
   - Haz clic en el botón azul **`Authorize APIs`**.
4. **SUBPASO 5.3 (Autorizar tu cuenta Gmail):**
   - Selecciona la cuenta Gmail del gimnasio donde creaste la carpeta de respaldos.
   - Aparecerá la pantalla de advertencia: ***"Google no ha verificado esta aplicación"*** (es completamente normal porque la app es tuya y privada).
   - Haz clic en **`Configuración avanzada`** (abajo a la izquierda) → **`Ir a ZaramaGYM (no seguro)`**.
   - Marca la casilla de permiso de Google Drive y pulsa **`Continuar`**.
5. **SUBPASO 5.4 (Step 2 — Exchange authorization code for tokens):**
   - Volverás automáticamente a OAuth Playground en el **Step 2**, con un campo llamado *Authorization code* que empieza por `4/...`. **NO copies ese código.**
   - Haz clic en el botón azul **`Exchange authorization code for tokens`**.
6. **SUBPASO 5.5 (Copiar el Refresh Token):**
   - En el panel de la izquierda (y en el JSON de la derecha) aparecerán dos tokens:
     - **`Refresh token`:** empieza por **`1//...`** → **COPIA ESTE COMPLETO.**
     - *Access token:* empieza por `ya29...` → **IGNÓRALO** (dura solo 1 hora).

---

### Paso 6: Guardar todo en ZaramaGYM (Activar Respaldo cada 2 Horas)
1. Abre **ZaramaGYM** e inicia sesión como **`ADMINISTRADOR`**.
2. En el menú lateral izquierdo, ve a **`Administración y Red` → `Impresión, PDFs y Backups`**.
3. Haz clic en la pestaña **`Respaldos SQLite & Drive`**.
4. En la tarjeta derecha **`Sincronización Cloud (Google Drive)`**:
   - Marca la casilla **`Habilitar subida automática de respaldos a Google Drive API v3`**.
   - **`ID de Carpeta Google Drive`:** pega el Folder ID (o la URL completa de la carpeta del Paso 1).
   - **`Intervalo Auto-Respaldo (Horas)`:** asegúrate de que diga **`2`**.
   - **`Client ID OAuth (Google Cloud)`:** pega el Client ID (`...apps.googleusercontent.com`) del Paso 4.
   - **`Client Secret OAuth (Keyring)`:** pega el Client Secret (`GOCSPX-...`) del Paso 4.
   - **`Refresh Token OAuth2 de Google Drive (1//...)`:** pega el Refresh Token (`1//...`) del Paso 5.
5. Pulsa **`Guardar Parámetros Cloud`**.
6. Verifica que en la cabecera de la tarjeta aparezcan los **3 sellos verdes**:
   - **`Secret en Keyring`**
   - **`Token en Keyring`**
   - **`Cloud Activo`**
   - Y el recuadro informativo: **`Programación activa cada 2 hora(s): guarda una copia local en caliente (VACUUM INTO) y sube esa misma copia automáticamente a Google Drive.`**
7. Borra cualquier bloc de notas temporal donde hayas copiado las claves.

---

### Paso 7: Prueba de Verificación (Confirmar que Local + Nube funcionan)
1. En la tarjeta izquierda **`Acciones de Base de Datos`**, pulsa **`Crear Respaldo Ahora (VACUUM INTO)`**.
2. Espera unos segundos:
   - Debe aparecer un aviso verde: **`Respaldo local generado y subido a Google Drive exitosamente: zaramagym_backup_... (Drive ID: ...)`**.
   - En la tabla **`Historial de Respaldos`**, el registro debe mostrar el estado **`SINCRONIZADO_CLOUD`** (o verde con su ID de Drive).
3. Abre tu carpeta **`Respaldos_ZaramaGYM`** en [drive.google.com](https://drive.google.com) y confirma que ya aparece el archivo `zaramagym_backup_YYYYMMDD_HHMMSS.db`.
4. *(Opcional)* Haz clic en **`Verificar`** en esa fila para confirmar que el archivo pasa **`PRAGMA integrity_check: ok`**.

¡Listo! A partir de ese momento, mientras ZaramaGYM esté abierto, cada **2 horas** creará automáticamente un respaldo local y lo subirá a Google Drive.

---

## 1.4 Solución de Problemas — Google Drive

| Error o Síntoma | Causa Probable | Solución Exacta |
| :--- | :--- | :--- |
| **`401 Unauthorized (Invalid Credentials)`** | Se pegó un **Access Token (`ya29...`)** que venció a la hora, o se revocó el permiso desde la cuenta Google. | Repite el **Paso 5** en OAuth Playground y pega el **`Refresh token` (`1//...`)** en ZaramaGYM. |
| **`invalid_grant` / *"Token has been expired or revoked"*** | Tu app en Google Cloud se quedó en modo **`En pruebas (Testing)`** (caduca a los 7 días), o cambiaste la contraseña de Google / revocaste el acceso. | En Google Cloud → *Público (Audience)*, pulsa **`Publicar aplicación`** (Producción), vuelve a generar un Refresh Token (`1//...`) en el Paso 5 y guárdalo en ZaramaGYM. |
| **`unauthorized_client` o `invalid_client`** | En OAuth Playground olvidaste marcar **`Use your own OAuth credentials`**, o el `Client ID` / `Client Secret` pegado en ZaramaGYM no coincide con el usado en Playground. | Verifica que el `Client ID` y `Client Secret` de ZaramaGYM sean idénticos a los puestos en el engranaje de Playground y vuelve a emitir el `1//...`. |
| **Aviso: *"Pegaste un Client Secret (GOCSPX-...) en el campo Token"*** | Se intercambiaron las casillas de `Client Secret` y `Refresh Token`. | Coloca `GOCSPX-...` en **`Client Secret OAuth (Keyring)`** y el código `1//...` en **`Refresh Token OAuth2`**. |
| **Aviso: *"Pegaste un Authorization Code (4/...)"*** | Se copió el código temporal antes de pulsar *Exchange authorization code for tokens*. | En Playground Step 2 pulsa **`Exchange authorization code for tokens`** y copia el **`Refresh token` (`1//...`)**. |
| **`403 Forbidden`** | La `Google Drive API` no está habilitada en el proyecto o no se marcó el scope `drive.file`. | Verifica el **Paso 2** (API habilitada) y repite el **Paso 5** seleccionando `https://www.googleapis.com/auth/drive.file`. |
| **`404 Not Found`** | El `ID de Carpeta Google Drive` no existe, fue eliminado o pertenece a otra cuenta Gmail sin permisos de escritura. | Abre la carpeta con la misma cuenta Gmail que autorizaste, copia de nuevo su URL o ID y guárdalo. |
| **Se cortó el Internet cuando tocaba el respaldo de las 2 horas** | Sin conexión a la red en el instante del ciclo automático. | **No pierdes ningún dato:** la copia local se guarda igualmente en estado `COMPLETADO`. Cuando vuelva el Internet, puedes subir esa copia manualmente con el botón **`Subir a Drive`** o esperar al próximo ciclo automático de 2 horas. |

---

# MANUAL 2: Conexión con Gmail (Correo Electrónico SMTP para Comprobantes y Reportes)

## 2.1 ¿Para qué sirve y por qué requiere una Contraseña de Aplicación?

La conexión SMTP permite que ZaramaGYM envíe directamente por correo electrónico:
- **Comprobantes de venta en PDF** (Notas de Venta, Boletas y Facturas) desde el detalle de cada venta en **Caja y POS**.
- **Reportes financieros** hacia el correo de gerencia o contabilidad.

**¿Por qué NO puedes usar tu contraseña normal de Gmail?**  
Por política de seguridad de Google, Gmail rechaza inicios de sesión directos con tu contraseña habitual desde aplicaciones de escritorio. En su lugar, debes crear una **Contraseña de Aplicación (App Password)** de **16 letras**: una llave exclusiva para ZaramaGYM que se cifra en **Windows Keyring** y puedes revocar en cualquier momento sin cambiar tu contraseña principal.

---

## 2.2 Paso a Paso Completo (5 minutos)

### Paso 1: Activar la Verificación en 2 Pasos (2FA) en tu cuenta Gmail
*(Google exige tener 2FA activo para permitir crear Contraseñas de Aplicación).*
1. Inicia sesión en [myaccount.google.com/security](https://myaccount.google.com/security) con la cuenta Gmail del gimnasio.
2. En el bloque **Cómo inicias sesión en Google**, haz clic en **`Verificación en 2 pasos`**.
3. Sigue las instrucciones de Google (usando tu celular o app autenticadora) hasta ver el estado **`Activada`**.

---

### Paso 2: Generar la Contraseña de Aplicación de 16 caracteres
1. Entra directamente a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (si te pide confirmar tu contraseña de Gmail, ingrésala).
   - *Si el enlace no abre directo:* ve a `myaccount.google.com`, usa la barra de búsqueda superior y escribe **`Contraseñas de aplicaciones`**.
   - *Nota para cuentas empresariales Google Workspace (`@tudominio.com`):* si no aparece esta opción, el administrador de tu dominio debe habilitar *"Permitir a los usuarios activar la verificación en 2 pasos"* en `admin.google.com`.
2. En el campo **Nombre de la aplicación**, escribe:
   ```text
   ZaramaGYM Desktop
   ```
3. Haz clic en **`Crear`**.
4. Google mostrará un recuadro amarillo con una clave de **16 letras** agrupadas de 4 en 4 (ejemplo: `abcd efgh ijkl mnop`).
5. **Cópiala ahora mismo** (Google no te la volverá a mostrar después de cerrar esa ventana).  
   *Recomendación:* al pegarla en ZaramaGYM, puedes quitar los espacios para dejar las 16 letras seguidas (ej. `abcdefghijklmnop`).

---

### Paso 3: Configurar Gmail SMTP dentro de ZaramaGYM
1. Abre **ZaramaGYM** como **`ADMINISTRADOR`**.
2. En el menú lateral ve a **`Administración y Red` → `Impresión, PDFs y Backups`**.
3. Permanece en la primera pestaña: **`Impresora Térmica & SMTP`**.
4. Baja hasta la tarjeta **`Despacho de Comprobantes por Correo (SMTP)`**.
5. Haz clic en el botón **`Autocompletar Gmail`**. Esto configurará automáticamente:
   - Casilla **`Habilitar envío automático de comprobantes y reportes vía correo electrónico`**: **Marcada**.
   - **`Servidor SMTP Host`:** `smtp.gmail.com`
   - **`Puerto`:** `587` (cifrado seguro STARTTLS)
6. Completa los 3 campos de tu cuenta:
   - **`Usuario SMTP`:** tu dirección completa de Gmail (ej. `administracion.zaramagym@gmail.com`).
   - **`Correo Remitente (From)`:** coloca **el mismo correo de Gmail** (ej. `administracion.zaramagym@gmail.com`).
   - **`Contraseña de Aplicación SMTP`:** pega las **16 letras** generadas en el Paso 2 (sin espacios).
7. Haz clic en **`Guardar Cambios`** (barra superior) o **`Guardar Configuración de Impresión`** (al final del formulario).
8. Confirma que en la cabecera del bloque SMTP aparezcan los dos sellos verdes:
   - **`Contraseña en Keyring`**
   - **`SMTP Activo`**

---

### Paso 4: Prueba Real de Envío
1. Ve a **`Operación` → `Caja y POS` → `Ventas del Turno`** (o busca cualquier venta emitida).
2. Abre el detalle de una venta y utiliza la opción de **enviar comprobante por correo**, colocando un correo tuyo de prueba como destinatario.
3. Revisa tu bandeja de entrada (y la carpeta *Spam/Correo no deseado* en la primera prueba) y verifica que llegue el PDF adjunto correctamente.

---

### Nota: Uso con otros proveedores de correo (opcional)
Si en lugar de Gmail utilizas otro correo corporativo:
- **Outlook / Microsoft 365:** Host `smtp.office365.com`, Puerto `587`.
- **Zoho Mail:** Host `smtp.zoho.com`, Puerto `587`.
- **Correo en hosting propio (cPanel):** Consulta el servidor saliente SMTP y puerto `587` (STARTTLS) con tu proveedor.

---

## 2.3 Solución de Problemas — Gmail SMTP

| Error o Síntoma | Causa Probable | Solución Exacta |
| :--- | :--- | :--- |
| **`535-5.7.8 Username and Password not accepted`** | Se ingresó la contraseña normal de Gmail en vez de la Contraseña de Aplicación, o hubo un espacio/error al copiarla. | Genera una nueva Contraseña de Aplicación de 16 letras en `myaccount.google.com/apppasswords` y pégala sin espacios. |
| **Dejó de enviar correos de repente después de funcionar bien** | Si cambiaste la contraseña principal de tu cuenta Google, Google revoca automáticamente las Contraseñas de Aplicación anteriores por seguridad. | Genera una nueva Contraseña de Aplicación y actualízala en ZaramaGYM. |
| **Timeout / No conecta con `smtp.gmail.com:587`** | El antivirus local (Avast, Kaspersky, ESET) o un firewall corporativo está bloqueando salidas SMTP por puerto `587`, o no hay Internet. | Verifica conexión a Internet y permite a `ZaramaGYM` salir por TCP `587` en el escudo de correo de tu antivirus. |
| **El cliente dice que el correo llegó a Spam** | `Correo Remitente (From)` distinto al `Usuario SMTP` o primer envío desde una cuenta nueva. | Asegúrate de que `Usuario SMTP` y `Correo Remitente (From)` sean exactamente el mismo correo Gmail y pide al cliente marcarlo como "No es spam". |
| **Límite diario excedido** | Gmail gratuito permite hasta ~500 correos por día (Google Workspace hasta 2,000/día). | Espera 24 horas o migra a una cuenta Google Workspace si envías volúmenes masivos. |

---

# MANUAL 3: Conexión con Celulares (Escáner Móvil QR vía Wi-Fi Local `:3443`)

## 3.1 ¿Cómo funciona la conexión con smartphones?

ZaramaGYM incorpora un **servidor web local (HTTPS/HTTP en el puerto TCP `3443`)** y un anunciador de nombre de red **mDNS (`zaramagym.local`)**.  
Esto permite usar cualquier celular **Android** o **iPhone** como lector QR de asistencias en recepción:
- **100% en red local (Wi-Fi / LAN):** Funciona incluso si se corta el Internet del gimnasio.
- **Sin instalar apps desde Play Store / App Store:** Se abre desde el navegador (Chrome en Android, Safari en iPhone) y puede fijarse como **ícono de aplicación (PWA)** en la pantalla de inicio.
- **Control de seguridad estricto:** Cada celular necesita autorización previa del Administrador mediante un **Código QR / Código de 6 caracteres** y puede ser **revocado** al instante.

---

## 3.2 Requisitos Previos

1. **Misma red Wi-Fi / LAN:** La PC de recepción (ya sea por cable Ethernet o Wi-Fi) y los smartphones deben estar conectados al **mismo router** del gimnasio.
   - *Importante:* No conectes los celulares a una red Wi-Fi de *"Invitados"* (*Guest Network*), porque los routers bloquean la comunicación entre dispositivos invitados y la PC.
2. **Puerto TCP `3443` habilitado en el Firewall de Windows** (se configura una sola vez en el Paso 1).
3. **Navegadores recomendados:** Google Chrome en Android; Safari en iPhone/iPad.

---

## 3.3 Paso a Paso Completo

### Paso 1: Abrir el puerto `3443` en Windows Defender Firewall (se hace una sola vez)

Windows bloquea por defecto las conexiones entrantes hacia la PC. Tienes **2 opciones** igualmente seguras (ambas restringen el acceso exclusivamente a tu red local `LocalSubnet`, nunca a Internet):

#### Opción A — Automática en 1 clic (Recomendada)
1. Abre la carpeta de instalación/proyecto de ZaramaGYM y entra a la carpeta **`scripts/`**.
2. Haz doble clic en **`Instalar-Regla-Firewall-LAN.bat`**.
3. Cuando Windows muestre el aviso de Control de Cuentas de Usuario (UAC), haz clic en **`Sí`**.
4. El script creará automáticamente la regla **`ZaramaGYM - Servidor Escaner Movil LAN (TCP 3443)`** y te mostrará en pantalla las direcciones IP locales detectadas.

#### Opción B — Desde ZaramaGYM con PowerShell (Administrador)
1. En ZaramaGYM ve a **`Administración y Red` → `Wi-Fi & Escáner Móvil`**.
2. Haz clic en el botón **`Guía Firewall Windows`** (parte superior derecha) y luego en **`Copiar Comando PowerShell`**.
3. Abre el menú Inicio de Windows, busca **PowerShell**, haz clic derecho → **`Ejecutar como administrador`**.
4. Pega el siguiente comando y presiona **Enter**:
   ```powershell
   New-NetFirewallRule -DisplayName "ZaramaGYM - Servidor Escaner Movil LAN (TCP 3443)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -RemoteAddress LocalSubnet -Profile Private,Domain,Public -Enabled True
   ```
*(Si en algún momento deseas eliminar esta regla, ejecuta `scripts\allow-lan-firewall.ps1 -Remove` como Administrador).*

---

### Paso 2: Iniciar y verificar el Servidor LAN en ZaramaGYM
1. En ZaramaGYM inicia sesión como **`ADMINISTRADOR`** y ve a **`Administración y Red` → `Wi-Fi & Escáner Móvil`**.
2. Verifica que el indicador superior muestre el sello verde **`EN LÍNEA`**. Si muestra **`DETENIDO`**, pulsa **`Iniciar Servidor`**.
3. Revisa los dos controles clave del panel superior:
   - **Adaptador / Host destino:**
     - **`zaramagym.local (mDNS Recomendado)`:** Es la mejor opción porque aunque el router cambie la IP de tu PC mañana (o uses un Hotspot), la dirección `zaramagym.local` sigue funcionando sin perder la sesión del celular.
     - **IP numérica de respaldo (ej. `192.168.1.25`):** Úsala únicamente si un celular Android antiguo o router corporativo no logra abrir `zaramagym.local`.
   - **Protocolo:**
     - **`HTTPS (Cámara)` (Recomendado / Obligatorio para cámara):** Tanto Android Chrome como iPhone Safari **bloquean el acceso a la cámara** en sitios `http://` que no sean `localhost`. Mantén siempre **`HTTPS (Cámara)`** activo.
     - **`HTTP`:** Solo útil para pruebas de red o ingreso manual por DNI sin cámara.

---

### Paso 3: Confianza en el Certificado Local HTTPS (`zaramagym-root-ca.crt`)

Como tu PC es un servidor privado dentro del gimnasio (no un dominio público de Internet), ZaramaGYM genera automáticamente su propia **Autoridad Certificadora Raíz local (`ZaramaGYM Local Root CA`)** con vigencia de 10 años para cifrar la conexión HTTPS y habilitar la cámara del celular.

Tienes **2 maneras** de pasar la advertencia de certificado local en el celular:

#### Modo A — Rápido (Aceptar advertencia una vez, sin instalar archivo)
Cuando escanees el QR en el Paso 4 y el navegador muestre *"La conexión no es privada"* (Chrome) o *"Esta conexión no es privada"* (Safari):
- **En Android (Chrome):** Toca **`Configuración avanzada`** → **`Continuar a zaramagym.local (no seguro)`**.
- **En iPhone (Safari):** Toca **`Mostrar detalles`** → **`visitar este sitio web`** → **`Visitar sitio web`**.
> *Limitación del Modo A:* Es inmediato, pero algunos celulares vuelven a mostrar el aviso al reiniciar el navegador o impiden instalar el acceso directo PWA limpio. Para recepción fija, se recomienda el **Modo B**.

#### Modo B — Definitivo y Profesional (Instalar `zaramagym-root-ca.crt` una sola vez)
Así el celular reconocerá a tu PC como **sitio 100% seguro (con candado)** permanentemente:

1. **Descargar el certificado en el celular (elige una forma):**
   - **Forma directa desde el celular (más fácil):** Con el celular en el mismo Wi-Fi, abre el navegador y entra a:
     ```text
     http://zaramagym.local:3443/api/lan/ca.pem
     ```
     *(Si no carga `.local`, reemplázalo por la IP de la PC, ej.: `http://192.168.1.25:3443/api/lan/ca.pem`).*  
     Se descargará el archivo **`zaramagym-root-ca.crt`**.
   - **Forma desde la PC:** En la pantalla **Wi-Fi & Escáner Móvil** de ZaramaGYM, haz clic en **`Descargar Certificado zaramagym-root-ca.crt`** y envía ese archivo al celular por cable USB, WhatsApp o correo.

2. **Instalarlo según tu celular:**

   **En Android (Samsung, Xiaomi, Motorola, Pixel, etc.):**
   1. Abre **`Ajustes` (Configuración)** en el celular.
   2. Busca **`Certificado de CA`** en el buscador de Ajustes *(o navega a: `Seguridad y privacidad` → `Más ajustes de seguridad` → `Cifrado y credenciales` → `Instalar un certificado` → `Certificado de CA`)*.
   3. Cuando Android muestre una advertencia sobre instalar un CA, toca **`Instalar de todos modos`** y confirma con tu PIN/huella.
   4. Selecciona el archivo **`zaramagym-root-ca.crt`** en tu carpeta *Descargas*.
   5. Cierra completamente Chrome y vuelve a abrirlo.

   **En iPhone / iPad (iOS):**
   1. Abre el enlace de descarga en **Safari** (no en Chrome). Cuando aparezca *"Este sitio web está intentando descargar un perfil de configuración"*, toca **`Permitir`** → **`Cerrar`**.
   2. Ve a **`Ajustes`** → toca **`Perfil descargado`** arriba de todo *(o `General` → `VPN y gestión de dispositivos` → `ZaramaGYM Local Root CA`)*.
   3. Toca **`Instalar`** (arriba a la derecha), ingresa tu código de desbloqueo y vuelve a confirmar **`Instalar`**.
   4. **PASO OBLIGATORIO EN iOS (si lo omites, Safari seguirá marcando aviso):**
      - Ve a **`Ajustes` → `General` → `Información`**.
      - Baja hasta el final y toca **`Configuración de certificados`**.
      - Activa el interruptor verde junto a **`ZaramaGYM Local Root CA`** y toca **`Continuar`**.

---

### Paso 4: Vincular el Celular con Código QR (Emparejamiento)
1. En ZaramaGYM (**`Administración y Red` → `Wi-Fi & Escáner Móvil`**), ve al bloque **`Vincular Nuevo Dispositivo Móvil`**.
2. Escribe un nombre claro para identificar ese teléfono (mínimo 3 caracteres), por ejemplo: **`Celular Recepción Puerta 1`**.
3. Haz clic en **`Generar Código de Enlace`**.
4. Aparecerá una tarjeta destacada con:
   - Un **Código QR** listo para escanear.
   - Un **Código Manual de 6 caracteres** (válido por **60 minutos**).
5. Con la cámara del smartphone (conectado al mismo Wi-Fi del gimnasio):
   - **Escanea el Código QR** y abre el enlace en el navegador (Chrome en Android / Safari en iPhone).
   - *(Alternativa manual)*: Abre `https://zaramagym.local:3443/scanner` en el navegador del celular e ingresa el **Código Manual de 6 caracteres**.
6. Cuando el navegador pida permiso para usar la cámara, toca **`Permitir`**.
7. Verifica en ZaramaGYM (tabla **`Dispositivos Móviles Registrados`**) que el celular ahora aparezca con estado **`VINCULADO`**.
8. Haz un escaneo de prueba con el QR de cualquier socio: verás el semáforo en el celular y el registro instantáneo en **`Asistencias y Semáforo`** de la PC.

---

### Paso 5: Instalar el Escáner como App en la Pantalla de Inicio (PWA)
Para que los recepcionistas abran el escáner con 1 toque (en pantalla completa y con el logo de ZaramaGYM):
- **En Android (Chrome):** Con el escáner ya vinculado abierto, toca el menú **`⋮`** (arriba a la derecha) → **`Agregar a la pantalla principal`** (o **`Instalar aplicación`**) → **`Instalar`**.
- **En iPhone (Safari):** Con el escáner ya vinculado abierto, toca el botón **`Compartir`** (cuadrado con flecha hacia arriba en la barra inferior) → **`Agregar a inicio`** → **`Agregar`**.

---

### Paso 6: Administración Diaria de Celulares Vinculados
En la tabla **`Dispositivos Móviles Registrados`** (solo visible/editable por el `ADMINISTRADOR`):
- **`Re-vincular`:** Si alguien borró las cookies/historial del celular o el navegador perdió la sesión, haz clic en **`Re-vincular`** en esa fila; ZaramaGYM revoca automáticamente el token anterior y genera un nuevo QR con el mismo nombre en 1 clic.
- **`Revocar`:** Si un celular se pierde, se daña o un colaborador deja de trabajar en el gimnasio, haz clic en **`Revocar` → `¿Confirmar?`**. El teléfono queda bloqueado al instante y ya no podrá registrar asistencias.
- **`Simular Vista Móvil`:** Permite probar el flujo de emparejamiento y escaneo directamente desde la PC sin necesitar un teléfono físico.

---

## 3.4 Solución de Problemas — Celulares LAN (`:3443`)

| Error o Síntoma | Causa Probable | Solución Exacta |
| :--- | :--- | :--- |
| **El celular se queda cargando y da *"Tiempo de espera agotado"*** | El Firewall de Windows (o un antivirus tercero como ESET/Kaspersky/Avast) está bloqueando el puerto `3443`, o el celular está con datos móviles / red Wi-Fi distinta. | 1. Confirma que el celular tenga los datos móviles apagados o esté en el **mismo Wi-Fi** que la PC.<br>2. Ejecuta `scripts/Instalar-Regla-Firewall-LAN.bat`.<br>3. Prueba abrir `http://<IP-PC>:3443/api/lan/ping` en el celular: si responde `{"status":"ok","gym":"ZaramaGYM"...}`, la red ya funciona.<br>4. Si usas antivirus externo, permite conexiones entrantes locales TCP `3443` para ZaramaGYM. |
| **No abre `zaramagym.local`, pero sí abre por IP** | El router bloquea tráfico multicast mDNS (UDP `5353`) o el celular Android no resuelve dominios `.local`. | En ZaramaGYM → **Wi-Fi & Escáner Móvil**, cambia el selector **`Seleccionar adaptador de red LAN`** de `zaramagym.local` a tu **`IP Principal (ej. 192.168.1.X)`** y vuelve a escanear el QR actualizado. *(Recomendación: fija una IP estática / reserva DHCP a la PC en tu router).* |
| **La página abre, pero la cámara no inicia o dice *"Permiso denegado"*** | Se abrió con **`http://`** en vez de **`https://`**, o se denegó el permiso de cámara la primera vez. | 1. Verifica que el selector en ZaramaGYM esté en **`HTTPS (Cámara)`** y la URL empiece por `https://`.<br>2. En el candado/ícono junto a la URL del navegador móvil, entra a *Permisos* y activa **Cámara = Permitir**. |
| **En iPhone sigue saliendo advertencia de certificado aunque ya lo instalé** | Faltó el paso final de activar la confianza raíz en iOS. | Ve a **`Ajustes` → `General` → `Información` → `Configuración de certificados`** y activa el interruptor de **`ZaramaGYM Local Root CA`**. |
| **Error *"Dispositivo no autorizado o revocado"* al escanear** | El dispositivo fue revocado o el código de enlace expiró antes de vincularse. | En ZaramaGYM pulsa **`Re-vincular`** (o genera un nuevo código de enlace) y escanea el nuevo QR desde el celular. |
| **La PC y el celular están en el mismo Wi-Fi pero no se ven** | El router tiene activado **AP Isolation / Aislamiento de clientes** o red de **Invitados**. | Conecta ambos a la red Wi-Fi principal del gimnasio y desactiva *AP Isolation* en el router si está activo. |

---

# Checklist Final de Puesta en Marcha (2 Minutos)

Usa esta lista para confirmar que las 3 conexiones de tu gimnasio quedaron 100% operativas:

- [ ] **Google Drive (cada 2 horas):**
  - App de Google Cloud en estado **`En producción`**.
  - Sellos verdes **`Secret en Keyring`**, **`Token en Keyring`** (`1//...`) y **`Cloud Activo`** en `Respaldos SQLite & Drive`.
  - Intervalo configurado en **`2`** horas.
  - Prueba con **`Crear Respaldo Ahora (VACUUM INTO)`** confirmada en Drive y en historial como `SINCRONIZADO_CLOUD`.
- [ ] **Gmail SMTP:**
  - Verificación en 2 pasos activada + Contraseña de Aplicación de 16 letras creada.
  - Sellos verdes **`Contraseña en Keyring`** y **`SMTP Activo`** en `Impresora Térmica & SMTP`.
  - Correo de prueba con comprobante PDF recibido correctamente.
- [ ] **Celulares Escáner QR (`:3443`):**
  - Regla de Windows Firewall (`TCP 3443`) aplicada con `scripts/Instalar-Regla-Firewall-LAN.bat`.
  - Servidor en estado **`EN LÍNEA`** con modo **`HTTPS (Cámara)`**.
  - Certificado `zaramagym-root-ca.crt` confiado en el celular (o advertencia aceptada).
  - Celular en estado **`VINCULADO`**, ícono PWA fijado en inicio y escaneo QR de prueba reflejado en **Asistencias y Semáforo**.
