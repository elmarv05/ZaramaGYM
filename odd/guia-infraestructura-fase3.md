# 🛡️ GUÍA DIDÁCTICA DE INFRAESTRUCTURA Y CREDENCIALES (FASE 3 - ZARAMAGYM)

Esta guía paso a paso explica en lenguaje claro qué son, para qué sirven y cómo configurar las credenciales en la nube (**Google Drive** y **Correo SMTP**) y la regla de red local (**Windows Firewall `:3443`**) en **ZaramaGYM**.

---

## 1. ¿Cómo Protege ZaramaGYM tus Contraseñas y Tokens? (`Windows Keyring`)

A diferencia de los sistemas tradicionales que guardan contraseñas en archivos de configuración o tablas de base de datos, **ZaramaGYM utiliza el Administrador de Credenciales Nativo de Windows (`keyring`)**:

- **¿Qué se guarda en la base de datos SQLite (`configuracion_sistema`)?**
  Únicamente datos públicos o de enrutamiento: el nombre de la empresa, el correo remitente (`smtp_user`), el ID de carpeta de Google Drive (`backup_gdrive_folder_id`) y el `client_id` público.
- **¿Dónde se guardan las llaves secretas (`SMTP_PASSWORD`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_ACCESS_TOKEN`)?**
  Se cifran directamente en el **Administrador de Credenciales de Windows** bajo el servicio `ZaramaGYM`. Si alguien copia el archivo `.db`, **jamás tendrá acceso a tus contraseñas ni tokens**.

---

## 2. Configuración Paso a Paso: Correo Electrónico SMTP (Gmail)

El servidor SMTP permite que ZaramaGYM envíe comprobantes en PDF (Notas de Venta, Boletas, Facturas) y reportes financieros directamente al correo del cliente o del contador.

### ¿Por qué no se usa la contraseña normal de Gmail?
Por seguridad, Google bloquea el inicio de sesión de programas externos con tu contraseña habitual. En su lugar, Google ofrece **Contraseñas de Aplicación** (un código especial de 16 letras que solo sirve para enviar correos desde ZaramaGYM y que puedes revocar cuando quieras).

### Pasos para obtener tu Contraseña de Aplicación (3 minutos):
1. Entra a tu cuenta de Google en [myaccount.google.com/security](https://myaccount.google.com/security).
2. Asegúrate de tener activada la **Verificación en 2 pasos**.
3. En el buscador superior de tu cuenta de Google escribe **"Contraseñas de aplicaciones"** (o entra directo a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Escribe como nombre de la app: `ZaramaGYM Desktop` y haz clic en **Crear**.
5. Google te mostrará un recuadro con **16 letras** (ejemplo: `abcd efgh ijkl mnop`). Cópialas.
6. En **ZaramaGYM**, ve a **Impresión, PDFs y Backups → Pestaña Configuración Impresora y SMTP**:
   - Activa la casilla **Habilitar envío automático de comprobantes vía correo electrónico**.
   - **Servidor SMTP Host:** `smtp.gmail.com`
   - **Puerto:** `587`
   - **Usuario SMTP:** `tucorreo@gmail.com`
   - **Correo Remitente (From):** `tucorreo@gmail.com`
   - **Contraseña de Aplicación SMTP:** Pega las 16 letras y haz clic en **Guardar**.
   - Verás aparecer el sello verde **`Contraseña en Keyring`**.

---

## 3. Configuración Paso a Paso: Respaldos en Google Drive Cloud

ZaramaGYM genera copias de seguridad compactadas en caliente (`VACUUM INTO`) y puede subirlas a una carpeta específica de tu Google Drive.

### A. ¿Cómo obtener el ID de Carpeta (`Folder ID`) de Google Drive?
1. Abre [drive.google.com](https://drive.google.com) y crea una carpeta llamada, por ejemplo, `Respaldos_ZaramaGYM`.
2. Entra dentro de esa carpeta y mira la barra de direcciones (URL) de tu navegador:
   ```text
   https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J_ejemplo
   ```
3. Todo el código que aparece después de `/folders/` (en el ejemplo: `1A2B3C4D5E6F7G8H9I0J_ejemplo`) es tu **ID de Carpeta Google Drive**.

### B. ¿Qué son el `Client ID`, `Client Secret` y `Token OAuth` de Google Cloud?
Google Drive requiere que te identifiques mediante un proyecto gratuito propio en Google Cloud:
- **`Client ID` (ID de Cliente):** Es el identificador público de tu conector con Google Drive.
- **`Client Secret` (Secreto de Cliente):** Es la llave privada que autentica a tu aplicación (se guarda cifrada en Windows Keyring).
- **`Token de Acceso / Refresh Token`:** Es el permiso autorizado por tu cuenta de Google para subir archivos `.db` a tu Drive.

### Pasos para generarlos gratuitamente en Google Cloud Console:
1. Ingresa a [console.cloud.google.com](https://console.cloud.google.com/) con tu cuenta de Google y crea un proyecto llamado **`ZaramaGYM Backups`**.
2. En el menú lateral ve a **APIs y Servicios → Biblioteca**, busca **`Google Drive API`** y haz clic en **Habilitar**.
3. Ve a **APIs y Servicios → Pantalla de consentimiento de OAuth**:
   - Elige **Externo**, coloca como nombre `ZaramaGYM` y tu correo de soporte.
   - En la sección **Usuarios de prueba (Test users)**, agrega tu propio correo `@gmail.com`.
4. Ve a **APIs y Servicios → Credenciales → + Crear Credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web** (para usar con OAuth Playground) o **App de Escritorio**.
   - Si eliges *Aplicación web*, en **URI de redireccionamiento autorizados** agrega: `https://developers.google.com/oauthplayground`.
   - Google te mostrará tu **`Client ID`** y tu **`Client Secret`**.
5. Para generar tu **Token OAuth**:
   - Abre [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
   - Haz clic en el engranaje ⚙️ (arriba a la derecha), marca **"Use your own OAuth credentials"** y pega tu `Client ID` y `Client Secret`.
   - En la lista de la izquierda (Step 1), busca **Drive API v3**, selecciona `https://www.googleapis.com/auth/drive.file` y pulsa **Authorize APIs**.
   - En el Step 2, pulsa **Exchange authorization code for tokens** y copia el **`Refresh token`** o **`Access token`**.
6. En **ZaramaGYM**, ve a **Impresión, PDFs y Backups → Pestaña Respaldos SQLite y Cloud**:
   - Activa la casilla **Habilitar subida automática de respaldos a Google Drive API v3**.
   - Pega el **ID de Carpeta Google Drive**, tu **Client ID**, tu **Client Secret** y tu **Token OAuth**, y pulsa **Guardar Configuración Cloud**.

---

## 4. Configuración de Red Local y Regla de Windows Defender Firewall (`:3443`)

Para que los smartphones de recepción puedan abrir el **Escáner Móvil QR (`https://<IP-DE-LA-PC>:3443/scanner`)** a través del Wi-Fi del gimnasio, Windows Defender Firewall debe permitir las conexiones entrantes al puerto TCP `3443` dentro de la red local.

### Opción A: Instalación Automática en 1 Clic (Recomendada)
En la carpeta del proyecto encontrarás el directorio `scripts/`:
1. Haz doble clic sobre [`scripts/Instalar-Regla-Firewall-LAN.bat`](file:///c:/Users/USER/Desktop/Objeto/ZaramaGYM/scripts/Instalar-Regla-Firewall-LAN.bat).
2. Cuando Windows pregunte *"¿Quieres permitir que esta aplicación realice cambios en tu dispositivo?"*, haz clic en **Sí**.
3. El script creará automáticamente la regla **`ZaramaGYM - Servidor Escaner Movil LAN (TCP 3443)`** restringida de forma segura a tu subred local (`LocalSubnet`) y te mostrará en pantalla la dirección exacta para abrir en el celular.

### Opción B: Comando Rápido desde PowerShell (Administrador)
Si prefieres ejecutarlo directamente en una consola PowerShell como Administrador:
```powershell
New-NetFirewallRule -DisplayName "ZaramaGYM - Servidor Escaner Movil LAN (TCP 3443)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -RemoteAddress LocalSubnet -Profile Private,Domain,Public -Enabled True
```

### Lista de Verificación para Conexión del Smartphone:
1. **Misma Red Wi-Fi:** Asegúrate de que la PC de recepción y el smartphone estén conectados al mismo router Wi-Fi del gimnasio.
2. **Vincular Dispositivo:** En ZaramaGYM abre el módulo **Escáner Móvil LAN (`:3443`)**, escribe el nombre del celular (ej. `Celular Recepción 1`) y pulsa **Generar Código QR de Vinculación**.
3. **Escanear y Aceptar TLS:** Escanea el QR desde el celular. Si usas modo `HTTPS` (necesario para que iOS/Android habiliten la cámara en red local), en el primer ingreso toca **"Opciones avanzadas → Continuar a la IP (sitio seguro local)"** o instala el Certificado Raíz CA descargable desde la misma pantalla.
