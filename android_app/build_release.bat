@echo off
setlocal
REM 一键构建 release APK（产物：app\build\outputs\apk\release\app-release.apk）
cd /d "%~dp0"

if exist "gradlew.bat" (
    echo [INFO] 使用 gradlew 构建...
    call gradlew.bat assembleRelease
) else (
    echo [INFO] 未找到 gradlew，改用系统 gradle。
    echo [INFO] 若未安装 Gradle，请先用 Android Studio 打开本工程生成 wrapper。
    gradle assembleRelease
)

if errorlevel 1 (
    echo [ERROR] 构建失败
    exit /b 1
)

echo [OK] APK 产物：app\build\outputs\apk\release\app-release.apk
endlocal
