#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
project="floflo-backup-test-$$"
real_docker=$(command -v docker)
compose=(docker compose --project-name "$project" --env-file "$work/.env" -f "$work/compose.yaml")
cleanup() {
    status=$?
    trap - EXIT
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
    if [[ $status == 0 ]]; then rm -r -- "$work"; else echo "Test logs: $work" >&2; fi
    exit "$status"
}
trap cleanup EXIT
cp "$root/deploy/backup-data.sh" "$work/backup-data.sh"
touch "$work/.env"
echo couple-mini-backend:deploy-check > "$work/.current-image"
cat > "$work/compose.yaml" <<'YAML'
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: couple_mini
      MYSQL_USER: couple_mini
      MYSQL_PASSWORD: backup-ci-only
      MYSQL_ROOT_PASSWORD: backup-root-ci-only
    healthcheck:
      test: [CMD-SHELL, 'MYSQL_PWD="$$MYSQL_PASSWORD" mysql -u "$$MYSQL_USER" "$$MYSQL_DATABASE" -e "SELECT 1" >/dev/null']
      interval: 2s
      retries: 60
  redis:
    image: redis:8.8.0-alpine
    environment: { REDISCLI_AUTH: backup-ci-only }
    command: [redis-server, --requirepass, backup-ci-only]
    healthcheck:
      test: [CMD, redis-cli, ping]
      interval: 2s
      retries: 30
  api:
    image: couple-mini-backend:deploy-check
    environment:
      MYSQL_DSN: 'couple_mini:backup-ci-only@tcp(mysql:3306)/couple_mini?parseTime=true&loc=UTC&charset=utf8mb4'
      REDIS_ADDR: redis:6379
      REDIS_PASSWORD: backup-ci-only
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
cat > "$work/bin/docker" <<SH
#!/usr/bin/env bash
if [[ \${BACKUP_TEST_FAIL_DUMP:-} == 1 && \$* == *mysqldump* ]]; then echo 'Injected DUMP failure' >&2; exit 42; fi
if [[ \${BACKUP_TEST_FAIL_MEDIA:-} == 1 && \${1:-} == cp ]]; then echo 'Injected MEDIA failure' >&2; exit 43; fi
if [[ \${BACKUP_TEST_FAIL_RESUME:-} == 1 && \$* == *' start api' ]]; then echo 'Injected RESUME failure' >&2; exit 44; fi
exec "$real_docker" "\$@"
SH
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
"${compose[@]}" up -d --pull never --wait --wait-timeout 180 mysql redis
mysql() {
    "${compose[@]}" exec -T mysql sh -ec 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE" "$@"' sh "$@"
}
mysql -e 'CREATE TABLE schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(6) NOT NULL)'
for migration in "$root/backend/migrations/"*.sql; do
    mysql < "$migration"
    mysql -e "INSERT INTO schema_migrations VALUES ('$(basename "$migration")',NOW(6))"
done
"${compose[@]}" up -d --pull never --wait --wait-timeout 120 api
api=$("${compose[@]}" ps -q api)
mysql -e "INSERT INTO users (id,openid,nickname,created_at) VALUES (REPEAT('a',32),'backup-fixture','备份头像',NOW(6)); INSERT INTO media_files VALUES (REPEAT('b',32),REPEAT('a',32),'image/png',68,1,1,NOW(6)),(REPEAT('c',32),REPEAT('a',32),'image/png',68,1,1,NOW(6)); UPDATE users SET avatar_id=REPEAT('b',32); INSERT INTO accounts VALUES (REPEAT('a',32),-7); INSERT INTO stores VALUES (REPEAT('d',32),REPEAT('a',32)); INSERT INTO products VALUES (REPEAT('e',32),REPEAT('a',32),'备份商品','带图片的约定',REPEAT('c',32),5,3,NOW(6),NOW(6));"
python3 - "$work/pixel.png" <<'PY'
import base64, pathlib, sys
pathlib.Path(sys.argv[1]).write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII='))
PY
docker cp "$work/pixel.png" "$api:/app/uploads/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
docker cp "$work/pixel.png" "$api:/app/uploads/cccccccccccccccccccccccccccccccc"
"${compose[@]}" exec -T api sh -ec 'mkdir /app/uploads/nested; echo orphan > /app/uploads/nested/unreferenced'
"${compose[@]}" exec -T redis redis-cli SET couple:session:fixture test-token >/dev/null
started=$(docker inspect --format '{{.State.StartedAt}}' "$api")

bash "$work/backup-data.sh" > "$work/dry-run.log"
[[ ! -d "$work/backups" ]]
[[ $(docker inspect --format '{{.State.StartedAt}}' "$api") == "$started" ]]
echo 'PASS: default preview exports nothing and does not restart the API'
(
    exec 9>"$work/.deploy.lock"
    flock -n 9
    if bash "$work/backup-data.sh" --backup > "$work/locked.log" 2>&1; then exit 1; fi
)
[[ ! -d "$work/backups" ]]
echo 'PASS: deployment/reset lock prevents a concurrent backup'

bash "$work/backup-data.sh" --backup > "$work/export.log"
backup=$(sed -n 's/^Backup saved: //p' "$work/export.log")
[[ -f "$work/$backup" ]]
[[ $(tar -tzf "$work/$backup" | sort) == $'SHA256SUMS\ndatabase.sql\nmedia.tar.gz' ]]
[[ $(docker inspect --format '{{.State.Health.Status}}' "$api") == healthy ]]
mkdir "$work/restore"
tar -xzf "$work/$backup" -C "$work/restore"
(cd "$work/restore" && sha256sum --check SHA256SUMS)
mkdir "$work/restored-media"
tar -xzf "$work/restore/media.tar.gz" -C "$work/restored-media"
cmp "$work/pixel.png" "$work/restored-media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
cmp "$work/pixel.png" "$work/restored-media/cccccccccccccccccccccccccccccccc"
[[ $(cat "$work/restored-media/nested/unreferenced") == orphan ]]
"${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "CREATE DATABASE backup_restore"'
"${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root backup_restore' < "$work/restore/database.sql"
restored=$("${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --batch --skip-column-names -u root backup_restore -e "SELECT CONCAT(u.nickname,CHAR(58),a.balance,CHAR(58),p.stock) FROM users u JOIN media_files m ON u.avatar_id=m.id AND m.owner_id=u.id JOIN accounts a ON a.user_id=u.id JOIN products p ON p.owner_id=u.id JOIN media_files c ON p.cover_id=c.id"')
[[ "$restored" == '备份头像:-7:3' ]]
[[ $("${compose[@]}" exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --batch --skip-column-names -u root backup_restore -e "SELECT COUNT(*) FROM schema_migrations"') == 6 ]]
[[ $(mysql -e 'SELECT COUNT(*) FROM schema_migrations') == 6 ]]
[[ $(mysql -e 'SELECT COUNT(*) FROM products') == 1 ]]
[[ $("${compose[@]}" exec -T redis redis-cli GET couple:session:fixture) == test-token ]]
python3 - "$work/$backup" <<'PY'
import os, sys
assert os.stat(sys.argv[1]).st_mode & 0o077 == 0
PY
echo 'PASS: portable bundle restores SQL, avatar/cover links and exact image bytes; source rows and Redis survive'

for failure in DUMP MEDIA; do
    before=$(find "$work/backups" -name '*.partial' -prune -o -name '*.tar.gz' -type f -print | wc -l | tr -d '[:space:]')
    if env "BACKUP_TEST_FAIL_$failure=1" bash "$work/backup-data.sh" --backup > "$work/failed-$failure.log" 2>&1; then exit 1; fi
    grep -q "Injected $failure failure" "$work/failed-$failure.log"
    [[ $(find "$work/backups" -name '*.partial' -prune -o -name '*.tar.gz' -type f -print | wc -l | tr -d '[:space:]') == "$before" ]]
    [[ $(docker inspect --format '{{.State.Health.Status}}' "$api") == healthy ]]
    [[ $(mysql -e 'SELECT COUNT(*) FROM users') == 1 ]]
done
echo 'PASS: SQL/media export failures publish no completed archive and restore the API'

"${compose[@]}" exec -T api rm /app/uploads/cccccccccccccccccccccccccccccccc
if bash "$work/backup-data.sh" --backup > "$work/missing.log" 2>&1; then exit 1; fi
grep -q 'Missing uploaded file' "$work/missing.log"
[[ $(docker inspect --format '{{.State.Health.Status}}' "$api") == healthy ]]
docker cp "$work/pixel.png" "$api:/app/uploads/cccccccccccccccccccccccccccccccc"
echo 'PASS: a missing referenced image fails the export instead of declaring an incomplete backup complete'

"${compose[@]}" stop api
bash "$work/backup-data.sh" --backup > "$work/stopped.log"
[[ $(docker inspect --format '{{.State.Running}}' "$api") == false ]]
echo 'PASS: an API that was already stopped remains stopped'
"${compose[@]}" start api
if BACKUP_TEST_FAIL_RESUME=1 bash "$work/backup-data.sh" --backup > "$work/resume.log" 2>&1; then exit 1; fi
backup=$(sed -n 's/^Backup saved: //p' "$work/resume.log")
tar -tzf "$work/$backup" >/dev/null
grep -q 'API could not be restored' "$work/resume.log"
grep -q 'Injected RESUME failure' "$work/resume.log"
[[ $(docker inspect --format '{{.State.Running}}' "$api") == false ]]
echo 'PASS: restart failure is reported while retaining the completed archive'
