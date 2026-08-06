FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    CHROMIUM_PATH=/usr/bin/chromium \
    HARVEST_MAX_CONCURRENCY=1 \
    HARVEST_TIMEOUT_MS=55000

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation fonts-noto-color-emoji tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.mjs"]
