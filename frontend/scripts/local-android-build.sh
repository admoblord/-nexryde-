#!/usr/bin/env bash
set -euo pipefail

BUILD_TYPE="${1:-apk}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"

if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Java runtime not found."
  echo "Install JDK 17 and set JAVA_HOME before running local Android builds."
  exit 1
fi

if ! java -version >/dev/null 2>&1; then
  echo "ERROR: Java command exists, but runtime is not installed/configured."
  echo "Install JDK 17 and set JAVA_HOME before running local Android builds."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "Install Node.js 20+ before running local Android builds."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "ERROR: Node.js 20+ is required (detected: $(node -v))."
  echo "Run 'nvm use 20' (or install Node 20+) and retry."
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ERROR: ANDROID_HOME / ANDROID_SDK_ROOT is not set."
  echo "Install Android SDK and export ANDROID_HOME (or ANDROID_SDK_ROOT)."
  exit 1
fi

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ ! -d "$SDK_ROOT" ]]; then
  echo "ERROR: Android SDK path does not exist: $SDK_ROOT"
  echo "Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your installed Android SDK directory."
  exit 1
fi

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "ERROR: Android directory not found at $ANDROID_DIR"
  exit 1
fi

cd "$ANDROID_DIR"
export NODE_ENV=production

KEY_PROPS="$ANDROID_DIR/keystore.properties"
if [[ ! -f "$KEY_PROPS" ]]; then
  echo ""
  echo "ERROR: Release signing is not configured — Play Store will reject debug-signed AAB/APK."
  echo ""
  echo "Option A — Local Gradle (you create the keystore):"
  echo "  1) cd \"$ANDROID_DIR/app\""
  echo "  2) keytool -genkeypair -v -storetype PKCS12 -keystore nexryde-upload-key.jks -alias nexryde-upload -keyalg RSA -keysize 2048 -validity 10000"
  echo "  3) cp \"$ANDROID_DIR/keystore.properties.example\" \"$KEY_PROPS\""
  echo "  4) Edit $KEY_PROPS with your passwords and paths"
  echo ""
  echo "Option B — Expo EAS (recommended): Expo generates & stores Play upload keys for you."
  echo "  cd \"$PROJECT_ROOT\" && npx eas-cli login && npm run build:eas:android"
  echo ""
  exit 1
fi

case "$BUILD_TYPE" in
  apk)
    if ! ./gradlew clean assembleRelease; then
      echo ""
      echo "WARN: clean assembleRelease failed, retrying without clean..."
      ./gradlew assembleRelease
    fi
    echo ""
    echo "Release APK generated:"
    echo "$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
    ;;
  aab)
    if ! ./gradlew clean bundleRelease; then
      echo ""
      echo "WARN: clean bundleRelease failed, retrying without clean..."
      ./gradlew bundleRelease
    fi
    echo ""
    echo "Release AAB generated:"
    echo "$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
    ;;
  *)
    echo "Usage: ./scripts/local-android-build.sh [apk|aab]"
    exit 1
    ;;
esac
