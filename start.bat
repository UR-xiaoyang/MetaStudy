@echo off
chcp 65001 >nul
setlocal

echo Starting Classroom Assistant System...
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3000
echo.

REM When the app backend is already running, only start the frontend.
curl --silent --fail http://localhost:3000/api/health >nul 2>nul
if not errorlevel 1 (
  echo Backend is already running. Starting frontend only...
  npm run dev:frontend
  goto :end
)

REM Do not hide a port conflict caused by another application.
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: Port 3000 is occupied by another application.
  echo Close that application, then run this script again.
  pause
  exit /b 1
)

npm run dev

:end
endlocal
