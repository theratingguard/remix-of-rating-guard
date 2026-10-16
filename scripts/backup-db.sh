#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="${RATINGGUARD_APP_DIR:-/opt/rating-guard}"
ENV_FILE="${RATINGGUARD_ENV_FILE:-$APP_DIR/.env.production}"
BACKUP_DIR="${RATINGGUARD_BACKUP_DIR:-/backups/rating-guard}"
SCRIPT_PATH="${RATINGGUARD_BACKUP_SCRIPT:-$APP_DIR/scripts/backup-db.sh}"
CRON_TAG="# rating-guard-database-backup"

load_database_url() {
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    printf '%s' "$SUPABASE_DB_URL"
    return
  fi
  if [[ -n "${DATABASE_URL:-}" ]]; then
    printf '%s' "$DATABASE_URL"
    return
  fi
  if [[ -f "$ENV_FILE" ]]; then
    node - "$ENV_FILE" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?(?:SUPABASE_DB_URL|DATABASE_URL)\s*=\s*(.*?)\s*$/);
  if (!match) continue;
  let value = match[1];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    value = value.slice(1, -1);
  process.stdout.write(value);
  break;
}
NODE
  fi
}

database_url="$(load_database_url)"

if [[ "${1:-}" == "--dry-run" ]]; then
  archive="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'rating-guard-db-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)"
  [[ -n "$archive" ]] || { echo "No database backup archive is available to validate." >&2; exit 1; }
  gzip -t "$archive"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$temp_dir"' EXIT
  mapfile -t entries < <(tar -tzf "$archive")
  [[ "${#entries[@]}" -eq 1 && "${entries[0]}" == rating-guard-db-*.dump ]] || {
    echo "Backup archive has an unexpected entry layout." >&2
    exit 1
  }
  tar -xzf "$archive" -C "$temp_dir" -- "${entries[0]}"
  pg_restore --list "$temp_dir/${entries[0]}" >/dev/null
  echo "Backup archive passed gzip, tar, and pg_restore catalog validation: $(basename "$archive")"
  exit 0
fi

[[ -n "$database_url" ]] || {
  echo "Set SUPABASE_DB_URL or DATABASE_URL to a PostgreSQL connection URI before running a backup." >&2
  exit 1
}
command -v pg_dump >/dev/null || { echo "pg_dump is required for database backups." >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore is required to validate backups." >&2; exit 1; }
command -v tar >/dev/null || { echo "tar is required to package backups." >&2; exit 1; }
command -v gzip >/dev/null || { echo "gzip is required to package backups." >&2; exit 1; }

if [[ "${1:-}" == "--install-cron" ]]; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  existing="$(crontab -l 2>/dev/null || true)"
  filtered="$(printf '%s\n' "$existing" | grep -Fv "$CRON_TAG" || true)"
  printf '%s\n%s\n' "$filtered" "0 2 * * * /bin/bash $SCRIPT_PATH >> /var/log/rating-guard-backup.log 2>&1 $CRON_TAG" | crontab -
  echo "Installed daily 02:00 server-time backup cron entry."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_dir="$(mktemp -d "$BACKUP_DIR/.backup.XXXXXX")"
trap 'rm -rf -- "$temporary_dir"' EXIT
dump_file="$temporary_dir/rating-guard-db-$timestamp.dump"
archive="$BACKUP_DIR/rating-guard-db-$timestamp.tar.gz"

RATINGGUARD_BACKUP_DATABASE_URL="$database_url" node - "$dump_file" <<'NODE'
const { spawn } = require("node:child_process");
const output = process.argv[2];
let db;
try {
  db = new URL(process.env.RATINGGUARD_BACKUP_DATABASE_URL);
} catch {
  console.error("Database backup URL is invalid.");
  process.exit(2);
}
if (!["postgres:", "postgresql:"].includes(db.protocol) || !db.hostname || !db.pathname.slice(1)) {
  console.error("Database backup URL must be a PostgreSQL URI with a host and database name.");
  process.exit(2);
}
const env = {
  ...process.env,
  PGHOST: db.hostname,
  PGPORT: db.port || "5432",
  PGUSER: decodeURIComponent(db.username),
  PGPASSWORD: decodeURIComponent(db.password),
  PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
  PGSSLMODE: db.searchParams.get("sslmode") || "require",
  PGCONNECT_TIMEOUT: "15",
};
delete env.RATINGGUARD_BACKUP_DATABASE_URL;
const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", output], {
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Could not start pg_dump: ${error.name}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (code !== 0) process.exitCode = code || 1;
});
NODE

tar -czf "$archive" -C "$temporary_dir" "$(basename "$dump_file")"
chmod 600 "$archive"
gzip -t "$archive"
pg_restore --list "$dump_file" >/dev/null
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'rating-guard-db-*.tar.gz' -mmin +10080 -delete
echo "Created and validated database backup: $(basename "$archive")"