#!/usr/bin/env bash
# Pubblica il sito: scrive il numero di versione, fa commit e push, aspetta che GitHub Pages lo serva.
# Uso: bash pipeline/publish.sh "messaggio del commit"
set -euo pipefail
cd "$(dirname "$0")/.."
V="$(date +%d-%H%M%S)"
printf '{"v":"%s"}\n' "$V" > docs/version.json
git add -A
git commit -q -m "$1"
git push -q origin main
for i in $(seq 1 20); do
  if curl -s -m 15 "https://lsinigaglia.github.io/occhio/version.json?$RANDOM" | grep -q "$V"; then
    echo "online: versione $V"; exit 0
  fi
  sleep 8
done
echo "pubblicato, ma la versione $V non risulta ancora online"
