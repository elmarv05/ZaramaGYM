# ==============================================================================
# ZARAMAGYM - CONFIGURACIÓN AUTOMATIZADA DE WINDOWS DEFENDER FIREWALL (LAN :3443)
# Ubicación: scripts/allow-lan-firewall.ps1
# Descripción: Autoriza el puerto TCP 3443 de entrada en la red local (Wi-Fi / Ethernet)
#              para permitir la conexión transparente de los smartphones de recepción
#              al Servidor Escáner Móvil QR sin bloqueos del firewall de Windows.
# ==============================================================================

param (
    [int]$Port = 3443,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RuleName = "ZaramaGYM - Servidor Escaner Movil LAN (TCP $Port)"
$MdnsRuleName = "ZaramaGYM - Descubrimiento mDNS Local (UDP 5353)"
$RuleGroup = "ZaramaGYM Local Network"

# 1. Verificar privilegios de Administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "==================================================================" -ForegroundColor Yellow
    Write-Host " [AVISO] Se requieren permisos de Administrador para configurar" -ForegroundColor Yellow
    Write-Host "         Windows Defender Firewall. Solicitando elevacion UAC..." -ForegroundColor Yellow
    Write-Host "==================================================================" -ForegroundColor Yellow

    $scriptArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
    if ($Remove) {
        $scriptArgs += " -Remove"
    }

    Start-Process powershell.exe -Verb RunAs -ArgumentList $scriptArgs
    exit 0
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   ZARAMAGYM - CONFIGURADOR DE RED Y FIREWALL LAN (PUERTO $Port)  " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# 2. Modo de desinstalación opcional (-Remove)
$existingRule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
$existingMdnsRule = Get-NetFirewallRule -DisplayName $MdnsRuleName -ErrorAction SilentlyContinue

if ($Remove) {
    if ($null -ne $existingRule) {
        Remove-NetFirewallRule -DisplayName $RuleName
        Write-Host "[OK] La regla '$RuleName' fue eliminada de Windows Firewall." -ForegroundColor Green
    } else {
        Write-Host "[INFO] No existia ninguna regla activa con el nombre '$RuleName'." -ForegroundColor Gray
    }
    if ($null -ne $existingMdnsRule) {
        Remove-NetFirewallRule -DisplayName $MdnsRuleName
        Write-Host "[OK] La regla '$MdnsRuleName' fue eliminada de Windows Firewall." -ForegroundColor Green
    }
    exit 0
}

# 3. Si ya existe, eliminarla previamente para recrearla limpia e idempotente
if ($null -ne $existingRule) {
    Write-Host "[1/3] Actualizando reglas previas encontradas en Windows Firewall..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $RuleName
} else {
    Write-Host "[1/3] Creando nuevas reglas de entrada en Windows Defender Firewall..." -ForegroundColor Cyan
}
if ($null -ne $existingMdnsRule) {
    Remove-NetFirewallRule -DisplayName $MdnsRuleName
}

# 4. Crear reglas Inbound TCP 3443 y UDP 5353 para subred local (Private, Domain y Public en subred local)
# Nota: Los Hotspots móviles y muchos routers Wi-Fi en Windows 10/11 quedan categorizados como red "Public" por defecto;
# restringir RemoteAddress a LocalSubnet mantiene seguridad estricta (solo dispositivos del mismo Hotspot/Wi-Fi/LAN).
New-NetFirewallRule `
    -DisplayName $RuleName `
    -Group $RuleGroup `
    -Description "Permite a los smartphones de recepcion de ZaramaGYM conectarse por Wi-Fi/Hotspot local al Escaner QR en el puerto TCP $Port." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress LocalSubnet `
    -Profile Private,Domain,Public `
    -Enabled True | Out-Null

New-NetFirewallRule `
    -DisplayName $MdnsRuleName `
    -Group $RuleGroup `
    -Description "Permite resolucion mDNS local (zaramagym.local) en UDP 5353 dentro de la subred local de ZaramaGYM." `
    -Direction Inbound `
    -Action Allow `
    -Protocol UDP `
    -LocalPort 5353 `
    -RemoteAddress LocalSubnet `
    -Profile Private,Domain,Public `
    -Enabled True | Out-Null

Write-Host "[2/3] Reglas '$RuleName' y '$MdnsRuleName' registradas exitosamente." -ForegroundColor Green

# 5. Mostrar direcciones IP locales detectadas para facilitar la prueba con el smartphone
Write-Host "[3/3] Direcciones IP locales detectadas en esta PC:" -ForegroundColor Cyan
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object IPAddress, InterfaceAlias

if ($ips) {
    foreach ($ip in $ips) {
        Write-Host ("      -> https://{0}:{1}/scanner   ({2})" -f $ip.IPAddress, $Port, $ip.InterfaceAlias) -ForegroundColor White
    }
} else {
    Write-Host "      -> (Verifica que la PC este conectada a la red Wi-Fi o cable Ethernet del gimnasio)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " [COMPLETADO] Los smartphones en el mismo Wi-Fi ya pueden acceder " -ForegroundColor Green
Write-Host "              al puerto :$Port sin bloqueos de Windows Firewall.  " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
