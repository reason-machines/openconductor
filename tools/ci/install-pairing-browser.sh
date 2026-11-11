#!/usr/bin/env bash
set -euo pipefail

packages=(
  xvfb fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6
  xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic
  fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2
  libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0
  libwayland-client0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6
  libxfixes3 libxkbcommon0 libxrandr2
)

"$(dirname "$0")/apt-install.sh" --no-install-recommends "${packages[@]}"
npx --no-install playwright-core install chromium
