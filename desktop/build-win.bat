@echo off
echo ================================================
echo   VoxiDub.AI Desktop - Build Script (Windows)
echo ================================================
echo.

:: Step 1: Check requirements
echo [1/6] Checking requirements...
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from https://nodejs.org && exit /b 1)
where python >nul 2>&1 || (echo ERROR: Python not found! Install from https://python.org && exit /b 1)
where yarn >nul 2>&1 || (echo ERROR: Yarn not found! Run: npm install -g yarn && exit /b 1)
echo OK

:: Step 2: Install desktop dependencies
echo [2/6] Installing desktop dependencies...
cd /d "%~dp0"
call yarn install
if errorlevel 1 (echo ERROR: Failed to install desktop dependencies && exit /b 1)

:: Step 3: Build React frontend
echo [3/6] Building React frontend...
cd /d "%~dp0\..\frontend"
set REACT_APP_BACKEND_URL=http://localhost:8001
call yarn install
call yarn build
if errorlevel 1 (echo ERROR: Failed to build frontend && exit /b 1)

:: Step 4: Create exclude list
echo [4/6] Preparing files...
echo venv> "%~dp0\exclude.txt"
echo __pycache__>> "%~dp0\exclude.txt"
echo tests>> "%~dp0\exclude.txt"
echo .env>> "%~dp0\exclude.txt"

:: Step 5: Copy frontend build
echo [5/6] Copying frontend build...
xcopy /E /I /Y "%~dp0\..\frontend\build" "%~dp0\build"
if errorlevel 1 (echo ERROR: Failed to copy frontend build && exit /b 1)

:: Step 6: Copy backend
echo [6/6] Copying backend...
xcopy /E /I /Y "%~dp0\..\backend" "%~dp0\backend" /EXCLUDE:%~dp0\exclude.txt

:: Step 6: Build .exe
echo [6/6] Building Windows .exe...
cd /d "%~dp0"
call yarn dist-win
if errorlevel 1 (echo ERROR: Failed to build .exe && exit /b 1)

echo.
echo ================================================
echo   BUILD COMPLETE!
echo   .exe file is in: desktop\dist\
echo ================================================
pause
