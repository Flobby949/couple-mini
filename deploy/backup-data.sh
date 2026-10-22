#!/usr/bin/env bash
set -euo pipefail
umask 077

case "${1:-}" in
    ''|--dry-run) execute=false ;;
    --backup) execute=true ;;
    *) echo "Usage: $0 [--dry-run | --backup]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Too many arguments' >&2; exit 2; }

cd "$(dirname "$0")"
[[ -f compose.yaml && -f .env && -s .current-image ]] || {
    echo 'Install beside /opt/couple-mini/compose.yaml, .env and .current-image' >&2
    exit 1
}
export BACKEND_IMAGE
BACKEND_IMAGE=$(cat .current-image)
compose=(docker compose --env-file .env -f compose.yaml)
"${compose[@]}" config --quiet
exec 9>.deploy.lock
flock -n 9 || { echo 'Deployment, reset or backup already running' >&2; exit 1; }

mysql() {
    "${compose[@]}" exec -T mysql sh -ec \
        'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE" "$@"' sh "$@"
}
[[ "$(mysql -e 'SELECT DATABASE()')" == couple_mini ]] || {
    echo 'Expected the FloFlo couple_mini database' >&2
    exit 1
}
api=$("${compose[@]}" ps --all -q api)
[[ -n "$api" ]] || { echo 'API container not found' >&2; exit 1; }
was_running=$(docker inspect --format '{{.State.Running}}' "$api")
echo 'Target: FloFlo / couple_mini'
echo 'Include: full SQL (schema, data and migrations) and uploaded files'
echo "Registered images: $(mysql -e 'SELECT COUNT(*) FROM media_files')"
echo "API currently running: $was_running"
if ! "$execute"; then
    echo 'Preview only. To export a consistent SQL and image bundle, run: bash backup-data.sh --backup'
    exit 0
fi

backup="backups/export-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
stage="$backup.partial"
mkdir -p backups
mkdir "$stage"
resume_api=false
on_exit() {
    status=$?
    trap - EXIT
    if "$resume_api"; then
        healthy=false
        # Compose 2.21 has no start --wait. Start the same container, never redeploy it.
        if "${compose[@]}" start api; then
            for ((attempt=0; attempt<120; attempt++)); do
                if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$api")" == healthy ]]; then
                    healthy=true
                    break
                fi
                sleep 1
            done
        fi
        if ! "$healthy"; then
            echo 'API could not be restored to healthy; check its logs before resuming use.' >&2
            status=1
        fi
    fi
    if [[ $status -ne 0 ]]; then
        echo "Export did not finish cleanly. Check $stage and $backup; no data was cleared." >&2
    fi
    exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The API is the only writer of both SQL and uploaded files, including background jobs.
if [[ "$was_running" == true ]]; then
    resume_api=true
    "${compose[@]}" stop api
fi
"${compose[@]}" exec -T mysql sh -ec \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u "$MYSQL_USER" --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
    > "$stage/database.sql"
[[ -s "$stage/database.sql" ]]
docker cp "$api:/app/uploads/." - | gzip -1 > "$stage/media.tar.gz"
tar -tzf "$stage/media.tar.gz" | sed 's#^\./##' > "$stage/media-paths.txt"
mysql -e 'SELECT id FROM media_files ORDER BY id' > "$stage/media-ids.txt"
while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    grep -Fxq -- "$id" "$stage/media-paths.txt" || {
        echo "Missing uploaded file for media_files.id=$id" >&2
        exit 1
    }
done < "$stage/media-ids.txt"
(
    cd "$stage"
    sha256sum database.sql media.tar.gz > SHA256SUMS
    sha256sum --check SHA256SUMS
)
tar -czf "$stage/bundle.tar.gz" -C "$stage" database.sql media.tar.gz SHA256SUMS
tar -tzf "$stage/bundle.tar.gz" >/dev/null
mv "$stage/bundle.tar.gz" "$backup"
rm -r -- "$stage"
echo "Backup saved: $backup"
echo 'Keep this bundle as one restore point. Redis sessions and server credentials are not included.'
