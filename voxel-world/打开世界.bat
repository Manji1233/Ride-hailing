@echo off
cd /d "%~dp0"
set PORT=8765

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "voxel-world-server" /min py -m http.server %PORT% --bind 127.0.0.1
) else (
  where python >nul 2>nul
  if %ERRORLEVEL%==0 (
    start "voxel-world-server" /min python -m http.server %PORT% --bind 127.0.0.1
  ) else (
    start "" "%~dp0index.html"
    exit /b
  )
)

timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
