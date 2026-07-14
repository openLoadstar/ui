@echo off
setlocal

set "ROOT=%~dp0"

REM JAVA_HOME is required by the Maven Wrapper (mvnw.cmd) but is not set system-wide
REM on this machine. Set it here, scoped to this script only, if not already defined.
if "%JAVA_HOME%" == "" (
    if exist "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot\bin\java.exe" (
        set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
    )
)

echo ============================================
echo  LOADSTAR Explorer UI - Web Server Launcher
echo ============================================
echo.

if not exist "%ROOT%frontend\node_modules" (
    echo [1/3] Installing frontend dependencies...
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        popd
        goto :end
    )
    popd
) else (
    echo [1/3] Frontend dependencies already installed, skipping npm install.
)

echo.
echo [2/3] Building frontend (vite build)...
pushd "%ROOT%frontend"
call npx vite build
if errorlevel 1 (
    echo.
    echo [ERROR] Frontend build failed.
    popd
    goto :end
)
popd

echo.
echo [3/3] Starting backend (Spring Boot) ...
echo   First run downloads the Maven distribution via Maven Wrapper (mvnw) - this can take a while.
echo   Once the server is up, open http://localhost:8080 in your browser.
echo   Press Ctrl+C to stop the server.
echo.
pushd "%ROOT%backend"
call mvnw.cmd spring-boot:run
popd

:end
endlocal
pause
