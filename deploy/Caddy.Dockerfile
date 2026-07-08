# Caddy — standardowy obraz. On-demand TLS (HTTP-01) nie wymaga wtyczki DNS,
# więc działa z dowolnym providerem DNS (lh.pl, Hostinger itd.).
# (Jeśli w przyszłości przejdziesz na Cloudflare i zechcesz certyfikat wildcard
#  przez DNS-01, tu dobudujesz xcaddy z caddy-dns/cloudflare.)
FROM caddy:2-alpine
