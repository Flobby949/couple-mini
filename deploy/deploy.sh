#!/usr/bin/env bash
set -euo pipefail
umask 077

# Install this root-owned script at /opt/couple-mini/deploy.sh and use it as
# the deployment key's forced command. The key cannot request a remote shell.
cd /opt/couple-mini
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }

request=${SSH_ORIGINAL_COMMAND:-${1:-}}
if [[ ! "$request" =~ ^deploy\ (sha256:[a-f0-9]{64})$ ]]; then
    echo 'Expected: deploy sha256:<64 lowercase hex characters>' >&2
    exit 1
fi
digest=${BASH_REMATCH[1]}
IFS= read -r registry_user
IFS= read -r registry_token
[[ "$registry_user" =~ ^[A-Za-z0-9_-]+$ && -n "$registry_token" ]]

export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login ghcr.io -u "$registry_user" --password-stdin >/dev/null
unset registry_token

export BACKEND_IMAGE="ghcr.io/flobby949/couple-mini-backend@$digest"
compose=(docker compose --env-file .env -f compose.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" pull api
"${compose[@]}" up -d --wait --wait-timeout 300 mysql redis

old_api=$("${compose[@]}" ps -q api)
if [[ -n "$old_api" ]]; then
    backup="backups/$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$backup.partial"
    "${compose[@]}" stop api
    if "${compose[@]}" exec -T mysql sh -c \
        'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u "$MYSQL_USER" --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
        > "$backup.partial/database.sql" \
        && docker cp "$old_api:/app/uploads/." - | gzip -1 > "$backup.partial/media.tar.gz"; then
        docker inspect --format '{{.Config.Image}}' "$old_api" > "$backup.partial/image"
        mv "$backup.partial" "$backup"
        echo "Backup saved: $backup"
    else
        "${compose[@]}" start api
        echo 'Backup failed; the existing API was restarted' >&2
        exit 1
    fi
fi

if ! "${compose[@]}" up -d --wait --wait-timeout 300; then
    "${compose[@]}" logs --tail=80 api >&2
    echo 'Deployment failed; retain the backup and check migrations before rollback' >&2
    exit 1
fi

# Only mark the release current after its database, Redis, and API are healthy.
printf '%s\n' "$BACKEND_IMAGE" > .current-image.next
mv .current-image.next .current-image
echo "Deployment healthy: $BACKEND_IMAGE"
