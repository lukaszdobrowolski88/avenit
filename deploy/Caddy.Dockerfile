# Caddy z wtyczką DNS Cloudflare (wymagane dla wildcard TLS *.domena.pl).
# Jeśli używasz innego providera DNS, podmień moduł (np. caddy-dns/duckdns).
FROM caddy:2-builder-alpine AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
