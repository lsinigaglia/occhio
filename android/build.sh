#!/usr/bin/env bash
# Compila l'APK di Occhio con i soli strumenti a riga di comando (niente Gradle).
# Richiede JDK 17+ e Android SDK con platforms;android-34 e build-tools;35.0.0.
set -euo pipefail
cd "$(dirname "$0")"
SDK="$(cygpath -m "${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}" 2>/dev/null || echo "${ANDROID_HOME:-$HOME/Android/Sdk}")"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
rm -rf build && mkdir -p build/gen build/classes
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/occhio.unsigned.apk -I "$JAR" --manifest AndroidManifest.xml --java build/gen \
  --min-sdk-version 26 --target-sdk-version 34 --version-code 1 --version-name 0.1 --debug-mode build/res.zip
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -cp "$JAR" -d build/classes \
  $(find src build/gen -name '*.java')
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --lib "$JAR" --min-api 26 --output build \
  $(find build/classes -name '*.class')
python -I -c "import zipfile; z=zipfile.ZipFile('build/occhio.unsigned.apk','a',zipfile.ZIP_DEFLATED); z.write('build/classes.dex','classes.dex'); z.close()"
"$BT/zipalign" -f 4 build/occhio.unsigned.apk build/occhio.aligned.apk
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -storepass android -keypass android \
  -alias occhio -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Occhio Debug" >/dev/null 2>&1
java -jar "$BT/lib/apksigner.jar" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android \
  --out build/occhio.apk build/occhio.aligned.apk
ls -la build/occhio.apk
