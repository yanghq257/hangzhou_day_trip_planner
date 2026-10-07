#!/usr/bin/env bash
# 一键构建 release APK（产物：app/build/outputs/apk/release/app-release.apk）
set -e
cd "$(dirname "$0")"

if [ -x ./gradlew ]; then
    echo "[INFO] 使用 gradlew 构建..."
    ./gradlew assembleRelease
else
    echo "[INFO] 未找到 gradlew，改用系统 gradle。"
    echo "[INFO] 若未安装 Gradle，请先用 Android Studio 打开本工程生成 wrapper。"
    gradle assembleRelease
fi

echo "[OK] APK 产物：app/build/outputs/apk/release/app-release.apk"
