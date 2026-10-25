@echo off
rem Arrete les serveurs locaux de Mes Investissements (5179) et Mon Budget (5178).
for %%P in (5179 5178) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do taskkill /pid %%I /f >nul 2>nul
)
echo Serveurs arretes.
ping -n 2 127.0.0.1 >nul
