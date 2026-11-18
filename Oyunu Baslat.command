#!/bin/zsh
# Toparlak Lig — yerel ağ sunucusunu başlatır (çift tıkla)
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ ! -d node_modules/ws ]; then echo "İlk kurulum yapılıyor…"; npm install --silent; fi
node server.js
