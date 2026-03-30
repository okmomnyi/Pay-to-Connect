#!/bin/sh
set -e

DOMAIN="${CERTBOT_DOMAIN:-smartwifi.website}"
EMAIL="${CERTBOT_EMAIL:-admin@smartwifi.website}"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
WEBROOT="/var/www/certbot"
CONF="/etc/nginx/conf.d/smartwifi.conf"

log() { echo "[ssl] $*"; }

# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf

# ── Choose startup config ──────────────────────────────────────────────────────
if [ -f "$CERT_PATH" ]; then
    log "Certificate found — starting with HTTPS"
    cp /etc/nginx/templates/https.conf "$CONF"
    sed -i "s|DOMAIN|${DOMAIN}|g" "$CONF"
else
    log "No certificate yet — starting with HTTP"
    cp /etc/nginx/templates/http.conf "$CONF"
    sed -i "s|DOMAIN|${DOMAIN}|g" "$CONF"
fi

# ── Background: obtain cert if missing, then renew every 12h ──────────────────
(
    # Let nginx start first
    sleep 5

    if [ ! -f "$CERT_PATH" ]; then
        log "Requesting SSL certificate for ${DOMAIN} from Let's Encrypt..."
        if certbot certonly \
            --webroot --webroot-path="$WEBROOT" \
            --email "$EMAIL" \
            --agree-tos --no-eff-email \
            --non-interactive \
            -d "$DOMAIN" 2>&1; then
            log "Certificate obtained — switching nginx to HTTPS"
            cp /etc/nginx/templates/https.conf "$CONF"
            sed -i "s|DOMAIN|${DOMAIN}|g" "$CONF"
            nginx -s reload
            log "HTTPS is now active on https://${DOMAIN}"
        else
            log "WARNING: Certificate request failed."
            log "  → Check that DNS for ${DOMAIN} points to this server's public IP"
            log "  → Check that port 80 is open in your firewall"
            log "  → nginx will keep running on HTTP and retry on next container restart"
        fi
    fi

    # Renewal loop: check every 12 hours, reload nginx if cert was renewed
    while true; do
        sleep 43200
        log "Running scheduled certificate renewal..."
        if certbot renew --quiet --webroot --webroot-path="$WEBROOT" 2>&1; then
            nginx -s reload
            log "Certificates renewed and nginx reloaded"
        fi
    done
) &

# ── Start nginx in foreground (PID 1) ─────────────────────────────────────────
log "Starting nginx for ${DOMAIN}..."
exec nginx -g "daemon off;"
