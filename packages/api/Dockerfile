# Obraz API + worker (ten sam obraz, różne CMD).
FROM node:22-alpine

WORKDIR /app

# Zależności workspace: kopiujemy manifesty i instalujemy tylko produkcyjne.
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN npm install --omit=dev --workspace @avenit/api --workspace @avenit/shared 2>/dev/null || \
    (cd packages/api && npm install --omit=dev)

# Kod
COPY packages/shared packages/shared
COPY packages/api packages/api

ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001

# Domyślnie API; worker uruchamiany osobnym serwisem z CMD ["node","src/worker.js"].
CMD ["node", "src/index.js"]
