# Obraz API + worker (ten sam obraz, różne CMD).
FROM node:22-alpine

# pg_dump (klient Postgres 16) — do backupów baz tenantów z panelu admina.
RUN apk add --no-cache postgresql16-client

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
