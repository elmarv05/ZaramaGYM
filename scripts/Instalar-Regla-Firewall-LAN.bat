@echo off
chcp 65001 >nul
title ZaramaGYM - Autorizar Puerto LAN 3443 en Windows Firewall
echo ============================================================================
echo   ZARAMAGYM - CONFIGURACION AUTOMATICA DE WINDOWS DEFENDER FIREWALL (:3443)
echo ============================================================================
echo.
echo Iniciando asistente de autorizacion de red local para Escaner Movil QR...
echo Si Windows solicita confirmacion de Control de Cuentas de Usuario (UAC),
echo haz clic en "Si" para aplicar la regla en el Firewall.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0allow-lan-firewall.ps1" -Port 3443

echo.
pause
