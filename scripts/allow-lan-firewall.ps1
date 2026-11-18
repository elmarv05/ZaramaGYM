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

if ($Remove) {
    if ($null -ne $existingRule) {
        Remove-NetFirewallRule -DisplayName $RuleName
        Write-Host "[OK] La regla '$RuleName' fue eliminada de Windows Firewall." -ForegroundColor Green
    } else {
        Write-Host "[INFO] No existia ninguna regla activa con el nombre '$RuleName'." -ForegroundColor Gray
    }
    exit 0
}

# 3. Si ya existe, eliminarla previamente para recrearla limpia e idempotente
if ($null -ne $existingRule) {
    Write-Host "[1/3] Actualizando regla previa encontrada en Windows Firewall..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $RuleName
} else {
    Write-Host "[1/3] Creando nueva regla de entrada en Windows Defender Firewall..." -ForegroundColor Cyan
}

# 4. Crear regla Inbound TCP en puerto 3443 para subred local (Private, Domain y Public en subred local)
# Nota: Muchos routers Wi-Fi en Windows 10/11 quedan categorizados como red "Public" por defecto;
# restringir RemoteAddress a LocalSubnet mantiene seguridad estricta (solo dispositivos del mismo Wi-Fi/LAN).
New-NetFirewallRule `
    -DisplayName $RuleName `
    -Group $RuleGroup `
    -Description "Permite a los smartphones de recepcion de ZaramaGYM conectarse por Wi-Fi local al Escáner QR en el puerto TCP $Port." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress LocalSubnet `
    -Profile Private,Domain,Public `
    -Enabled True | Out-Null

Write-Host "[2/3] Regla '$RuleName' registrada y habilitada exitosamente." -ForegroundColor Green

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
