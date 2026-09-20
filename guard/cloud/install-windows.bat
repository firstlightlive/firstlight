@echo off
title FIRST LIGHT - Windows Snitch Installer
echo.
echo ==============================================
echo    FIRST LIGHT - WINDOWS SNITCH INSTALLER
echo ==============================================
echo.
echo This will: ask 2 values, install the snitch,
echo and register it to run every minute forever.
echo.
set /p HOMESSID="1. Your HOME WiFi name (exact, case-sensitive): "
set /p TOPIC="2. The witness topic (firstlight-...): "
echo.

mkdir C:\firstlight 2>nul
copy "%~dp0windows-snitch.ps1" C:\firstlight\windows-snitch.ps1 >nul

powershell -NoProfile -Command "(Get-Content 'C:\firstlight\windows-snitch.ps1') -replace 'REPLACE-WITH-HOME-SSID','%HOMESSID%' -replace 'firstlight-cloud-REPLACE-WITH-RANDOM','%TOPIC%' | Set-Content 'C:\firstlight\windows-snitch.ps1'"

schtasks /create /tn "FirstLightSnitch" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\firstlight\windows-snitch.ps1" /sc minute /mo 1 /f

echo.
echo ==============================================
echo  DONE. The snitch runs every minute, hidden.
echo  Test: connect this laptop to home WiFi -
echo        the witness should get an alert.
echo ==============================================
pause
