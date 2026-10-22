#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
project="floflo-reset-test-$$"
real_docker=$(command -v docker)
compose=(docker compose --project-name "$project" --env-file "$work/.env" -f "$work/compose.yaml")
cleanup() {
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
cp "$root/deploy/reset-test-data.sh" "$work/reset-test-data.sh"
touch "$work/.env"
echo couple-mini-backend:deploy-check > "$work/.current-image"
cat > "$work/compose.yaml" <<'YAML'
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: couple_mini
      MYSQL_USER: couple_mini
      MYSQL_PASSWORD: reset-ci-only
      MYSQL_ROOT_PASSWORD: reset-root-ci-only
    healthcheck:
      test: [CMD-SHELL, 'MYSQL_PWD="$$MYSQL_PASSWORD" mysql -u "$$MYSQL_USER" "$$MYSQL_DATABASE" -e "SELECT 1" >/dev/null']
      interval: 2s
      retries: 60
  redis:
    image: redis:8.8.0-alpine
    environment: { REDISCLI_AUTH: reset-ci-only }
    command: [redis-server, --requirepass, reset-ci-only]
    healthcheck:
      test: [CMD, redis-cli, ping]
      interval: 2s
      retries: 30
  api:
    image: couple-mini-backend:deploy-check
    environment:
      MYSQL_DSN: 'couple_mini:reset-ci-only@tcp(mysql:3306)/couple_mini?parseTime=true&loc=UTC&charset=utf8mb4'
      REDIS_ADDR: redis:6379
      REDIS_PASSWORD: reset-ci-only
      HTTP_ADDR: 0.0.0.0:8080
      MEDIA_ROOT: /app/uploads
    volumes: [media:/app/uploads]
    healthcheck:
      test: [CMD, wget, -q, -O, /dev/null, http://127.0.0.1:8080/health/ready]
      interval: 2s
      retries: 30
volumes:
  media:
YAML
export COMPOSE_PROJECT_NAME="$project"
mkdir "$work/bin"
# Intercept only an intentional backup failure; all other calls use real Docker.
cat > "$work/bin/docker" <<SH
#!/usr/bin/env bash
if [[ \${RESET_TEST_FAIL_BACKUP:-} == 1 && \${1:-} == cp ]]; then exit 1; fi
if [[ \${RESET_TEST_FAIL_MEDIA:-} == 1 && \$* == *'--entrypoint sh api'* ]]; then exit 1; fi
exec "$real_docker" "\$@"
SH
# macOS lacks the flock command; fcntl uses the same inherited file lock.
if ! command -v flock >/dev/null; then
    cat > "$work/bin/flock" <<'PY'
#!/usr/bin/env python3
import fcntl, sys
try:
    fcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(1)
PY
fi
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"
"${compose[@]}" up -d --wait --wait-timeout 180 mysql redis
mysql() {
    "${compose[@]}" exec -T mysql sh -ec 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE" "$@"' sh "$@"
}
mysql -e 'CREATE TABLE schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(6) NOT NULL)'
for migration in "$root/backend/migrations/"*.sql; do
    mysql < "$migration"
    mysql -e "INSERT INTO schema_migrations VALUES ('$(basename "$migration")',NOW(6))"
done
"${compose[@]}" up -d --wait --wait-timeout 120 api
mysql -e "INSERT INTO users (id,openid,nickname,created_at) VALUES (REPEAT('a',32),'reset-fixture','reset-fixture',NOW(6)); INSERT INTO media_files VALUES (REPEAT('b',32),REPEAT('a',32),'image/png',5,1,1,NOW(6)); UPDATE users SET avatar_id=REPEAT('b',32);"
"${compose[@]}" exec -T api sh -ec 'mkdir /app/uploads/nested; echo image > /app/uploads/nested/orphan; echo avatar > /app/uploads/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
"${compose[@]}" exec -T redis redis-cli SET couple:session:fixture test-token >/dev/null
"${compose[@]}" exec -T redis redis-cli SET unrelated:keep keep >/dev/null

bash "$work/reset-test-data.sh" > "$work/dry-run.log"
[[ $(mysql -e 'SELECT COUNT(*) FROM users') == 1 ]]
[[ ! -d "$work/backups" ]]
echo 'PASS: default is read-only preview'
(
    exec 9>"$work/.deploy.lock"
    flock -n 9
    if bash "$work/reset-test-data.sh" --confirm-reset > "$work/locked.log" 2>&1; then exit 1; fi
)
[[ $(mysql -e 'SELECT COUNT(*) FROM users') == 1 ]]
echo 'PASS: concurrent deploy/reset lock prevents mutation'
if RESET_TEST_FAIL_BACKUP=1 bash "$work/reset-test-data.sh" --confirm-reset > "$work/failed-backup.log" 2>&1; then exit 1; fi
[[ $(mysql -e 'SELECT COUNT(*) FROM users') == 1 ]]
[[ $("${compose[@]}" exec -T redis redis-cli GET couple:session:fixture) == test-token ]]
"${compose[@]}" up -d --wait --wait-timeout 120 api
echo 'PASS: backup failure keeps data and restarts the existing API'

bash "$work/reset-test-data.sh" --confirm-reset > "$work/reset.log"
[[ $(mysql -e 'SELECT COUNT(*) FROM users') == 0 ]]
[[ $(mysql -e 'SELECT COUNT(*) FROM media_files') == 0 ]]
[[ $(mysql -e 'SELECT COUNT(*) FROM schema_migrations') == 6 ]]
[[ $("${compose[@]}" exec -T redis redis-cli EXISTS couple:session:fixture) == 0 ]]
[[ $("${compose[@]}" exec -T redis redis-cli GET unrelated:keep) == keep ]]
[[ $("${compose[@]}" exec -T api sh -c 'find /app/uploads -mindepth 1 | wc -l' | tr -d '[:space:]') == 0 ]]
backup=$(sed -n 's/^Backup saved: //p' "$work/reset.log")
tar -tzf "$work/$backup/media.tar.gz" | grep -q nested/orphan
"${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "CREATE DATABASE reset_restore"'
"${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root reset_restore' < "$work/$backup/database.sql"
restored=$("${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --batch --skip-column-names -u root reset_restore -e "SELECT COUNT(*) FROM users u JOIN media_files m ON u.avatar_id=m.id AND m.owner_id=u.id"')
[[ "$restored" == 1 ]]
echo 'PASS: reset clears business rows, sessions and images; migrations and other Redis keys survive'
echo 'PASS: SQL and media backups can restore the user/avatar reference cycle'
mysql -e "INSERT INTO users (id,openid,nickname,created_at) VALUES (REPEAT('c',32),'partial-fixture','partial-fixture',NOW(6))"
if RESET_TEST_FAIL_MEDIA=1 bash "$work/reset-test-data.sh" --confirm-reset > "$work/partial-reset.log" 2>&1; then exit 1; fi
[[ $(mysql -e 'SELECT COUNT(*) FROM users') == 0 ]]
api=$("${compose[@]}" ps --all -q api)
[[ $(docker inspect --format '{{.State.Running}}' "$api") == false ]]
grep -q 'Reset incomplete' "$work/partial-reset.log"
echo 'PASS: failure after SQL reset keeps the API stopped and reports the backup'
bash "$work/reset-test-data.sh" --confirm-reset > "$work/retry-reset.log"
echo 'PASS: reset can complete after an interrupted attempt'
echo "Test logs: $work"
