param(
  [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackupPath = Join-Path $Root $BackupDir
New-Item -ItemType Directory -Force -Path $BackupPath | Out-Null

$DumpPath = Join-Path $BackupPath "infuture-postgres.dump"
$UploadsArchive = Join-Path $BackupPath "infuture-uploads.tar.gz"

docker exec online-classroom-postgres pg_dump -U postgres -d online_classroom -Fc -f /tmp/infuture-postgres.dump
docker cp online-classroom-postgres:/tmp/infuture-postgres.dump $DumpPath
docker exec online-classroom-postgres rm -f /tmp/infuture-postgres.dump

if (Test-Path (Join-Path $Root "apps/api/uploads")) {
  tar -czf $UploadsArchive -C (Join-Path $Root "apps/api") uploads
}

Write-Host "Database dump: $DumpPath"
Write-Host "Uploads archive: $UploadsArchive"
