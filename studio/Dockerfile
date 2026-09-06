# Pressing 90' studio — lightweight render node (Render free tier: 0.1 CPU / 512 MB).
# node-canvas draws the cards (same designs as the admin studio), ffmpeg
# assembles reels. No headless Chrome — too heavy for the free instance.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libfontconfig1 fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Brand fonts (same families as the site) — fetched from the Google Fonts repo.
RUN mkdir -p /app/fonts && cd /app/fonts \
    && curl -fsSL -o Anton.ttf   https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf \
    && curl -fsSL -o Archivo.ttf https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf \
    && curl -fsSL -o Tajawal-Bold.ttf https://github.com/google/fonts/raw/main/ofl/tajawal/Tajawal-Bold.ttf \
    && curl -fsSL -o Tajawal-Medium.ttf https://github.com/google/fonts/raw/main/ofl/tajawal/Tajawal-Medium.ttf \
    && curl -fsSL -o IBMPlexMono.ttf https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
