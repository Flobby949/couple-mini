#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run once as root from the prepared bootstrap directory.
[[ $EUID -eq 0 ]]
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ ! -e /opt/couple-mini/.env ]] || { echo 'Existing deployment configuration found' >&2; exit 1; }
for file in .env notification-mappings.json deploy-key.pub compose.yaml deploy.sh nginx-location.conf; do
    [[ -f "$file" ]] || { echo "Missing bootstrap file: $file" >&2; exit 1; }
done

install -d -m 700 /opt/couple-mini
install -m 600 .env /opt/couple-mini/.env
install -m 644 notification-mappings.json compose.yaml /opt/couple-mini/
install -m 755 deploy.sh /opt/couple-mini/deploy.sh

install -m 644 nginx-location.conf /etc/nginx/snippets/couple-mini-location.conf
site=/etc/nginx/conf.d/flobby.top.conf
include='    include /etc/nginx/snippets/couple-mini-location.conf;'
backup="/opt/couple-mini/nginx-before-$(date -u +%Y%m%dT%H%M%SZ).conf"
if ! grep -Fq "$include" "$site"; then
    [[ $(grep -Ec '^[[:space:]]*server_name[[:space:]]+www[.]flobby[.]top;' "$site") -eq 1 ]]
    cp -p "$site" "$backup"
    awk -v include="$include" '{print} /^[[:space:]]*server_name[[:space:]]+www[.]flobby[.]top;/ {print include}' \
        "$site" > "$site.next"
    cat "$site.next" > "$site"
    rm "$site.next"
    if ! nginx -t; then
        cp -p "$backup" "$site"
        exit 1
    fi
    if ! systemctl reload nginx; then
        cp -p "$backup" "$site"
        systemctl reload nginx
        exit 1
    fi
fi

install -d -m 700 /root/.ssh
key="restrict,command=\"/opt/couple-mini/deploy.sh\" $(cat deploy-key.pub)"
touch /root/.ssh/authorized_keys
grep -Fqx "$key" /root/.ssh/authorized_keys || printf '%s\n' "$key" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
echo 'Bootstrap ready; release tags may now deploy couple-mini.'
