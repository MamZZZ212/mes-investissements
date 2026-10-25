@echo off
rem Lance Mes Investissements (http://localhost:5179) et Mon Budget (http://localhost:5178) en arriere-plan,
rem seulement s'ils ne tournent pas deja, puis ouvre le navigateur. Les serveurs restent actifs apres
rem fermeture de cette fenetre ; pour les arreter : Arreter-Investissements.bat (ou redemarrer le PC).
cd /d "%~dp0"
set "PY=pythonw"
where pythonw >nul 2>nul || set "PY=python"

netstat -ano | findstr /r /c:":5179 .*LISTENING" >nul || start "" %PY% server.py
if exist "..\Sites web\budget-app\server.py" (
  netstat -ano | findstr /r /c:":5178 .*LISTENING" >nul || (
    pushd "..\Sites web\budget-app"
    start "" %PY% server.py
    popd
  )
)
ping -n 3 127.0.0.1 >nul
start "" http://localhost:5179
