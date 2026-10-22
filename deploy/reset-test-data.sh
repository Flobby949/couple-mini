#!/usr/bin/env bash
set -euo pipefail
umask 077

case "${1:-}" in
    ''|--dry-run) execute=false ;;
    --confirm-reset) execute=true ;;
    *) echo "Usage: $0 [--dry-run | --confirm-reset]" >&2; exit 2 ;;
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
flock -n 9 || { echo 'Deployment or reset already running' >&2; exit 1; }

mysql() {
    "${compose[@]}" exec -T mysql sh -ec \
        'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE" "$@"' sh "$@"
}
[[ "$(mysql -e 'SELECT DATABASE()')" == couple_mini ]] || {
    echo 'Refusing to reset a database other than couple_mini' >&2
    exit 1
}
redis_reply=$("${compose[@]}" exec -T redis redis-cli --raw ping)
[[ "$redis_reply" == PONG ]] || { echo 'Redis is unavailable' >&2; exit 1; }
api=$("${compose[@]}" ps --all -q api)
[[ -n "$api" ]] || { echo 'API container not found' >&2; exit 1; }

table_names=$(mysql -e 'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE="BASE TABLE" AND TABLE_NAME<>"schema_migrations" ORDER BY TABLE_NAME')
tables=()
while IFS= read -r table; do
    [[ "$table" =~ ^[a-z][a-z0-9_]*$ ]] || { echo 'Unexpected table name' >&2; exit 1; }
    tables+=("$table")
done <<< "$table_names"
migrations=$(mysql -e 'SELECT COUNT(*) FROM schema_migrations')
echo 'Target: FloFlo / couple_mini (all accounts and business data)'
for table in "${tables[@]}"; do
    count=$(mysql -e "SELECT COUNT(*) FROM \`$table\`")
    printf '%-30s %s rows\n' "$table" "$count"
done
echo "Keep: table structures and $migrations migration records"
echo 'Also reset: Redis couple:session:* and all files in /app/uploads'
if ! "$execute"; then
    echo 'Preview only. To back up and reset, run: bash reset-test-data.sh --confirm-reset'
    exit 0
fi

backup="backups/reset-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$backup.partial"
was_running=$(docker inspect --format '{{.State.Running}}' "$api")
reset_started=false
on_exit() {
    status=$?
    if [[ $status -ne 0 ]]; then
        if ! "$reset_started"; then
            echo 'Backup/reset preparation failed; business data was not cleared.' >&2
            if [[ "$was_running" == true ]]; then "${compose[@]}" start api || true; fi
        else
            "${compose[@]}" stop api || true
            echo "Reset incomplete; API remains stopped. Check and restore from $backup before restarting." >&2
        fi
    fi
    exit "$status"
}
trap on_exit EXIT
"${compose[@]}" stop api
"${compose[@]}" exec -T mysql sh -ec \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u "$MYSQL_USER" --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
    > "$backup.partial/database.sql"
docker cp "$api:/app/uploads/." - | gzip -1 > "$backup.partial/media.tar.gz"
docker inspect --format '{{.Config.Image}}' "$api" > "$backup.partial/image"
mv "$backup.partial" "$backup"
echo "Backup saved: $backup"

# One transaction clears business rows; disabling FK checks is connection-local.
# In particular, users.avatar_id and media_files.owner_id form a reference cycle.
{
    echo 'SET FOREIGN_KEY_CHECKS=0; START TRANSACTION;'
    for table in "${tables[@]}"; do printf 'DELETE FROM `%s`;\n' "$table"; done
    echo 'COMMIT; SET FOREIGN_KEY_CHECKS=1;'
} > "$backup/reset.sql"
reset_started=true
mysql < "$backup/reset.sql"
"${compose[@]}" exec -T redis sh -ec \
    'set -o pipefail; redis-cli --scan --pattern "couple:session:*" | xargs -r redis-cli -e UNLINK >/dev/null'
"${compose[@]}" run --rm --no-deps --pull never --entrypoint sh api \
    -ec 'find /app/uploads -mindepth 1 -delete'

for table in "${tables[@]}"; do
    [[ "$(mysql -e "SELECT COUNT(*) FROM \`$table\`")" == 0 ]] || {
        echo "Table $table is not empty" >&2; exit 1
    }
done
[[ "$(mysql -e 'SELECT COUNT(*) FROM schema_migrations')" == "$migrations" ]]
remaining_sessions=$("${compose[@]}" exec -T redis redis-cli --scan --pattern 'couple:session:*')
[[ -z "$remaining_sessions" ]]
"${compose[@]}" up -d --no-deps --wait --wait-timeout 120 api
trap - EXIT
echo "Reset complete. API healthy. Backup: $backup"
echo 'Reopen the mini program and log in again to start from a new account.'
