#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f backups/infuture-postgres.dump ]; then
  echo "Missing backups/infuture-postgres.dump"
  exit 1
fi

if [ -f backups/infuture-uploads.tar.gz ]; then
  mkdir -p data
  tar -xzf backups/infuture-uploads.tar.gz -C data
fi

POSTGRES_USER_VALUE="$(grep -E '^POSTGRES_USER=' .env.production | cut -d= -f2-)"
POSTGRES_DB_VALUE="$(grep -E '^POSTGRES_DB=' .env.production | cut -d= -f2-)"
POSTGRES_USER_VALUE="${POSTGRES_USER_VALUE:-postgres}"
POSTGRES_DB_VALUE="${POSTGRES_DB_VALUE:-online_classroom}"

docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_restore \
  -U "$POSTGRES_USER_VALUE" \
  -d "$POSTGRES_DB_VALUE" \
  --clean --if-exists < backups/infuture-postgres.dump

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
