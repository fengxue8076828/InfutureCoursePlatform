# InfutureCoursePlatform CI/CD

This project deploys to the DigitalOcean Droplet through GitHub Actions.

## Deployment model

1. Local development happens on your computer.
2. Commit and push changes to GitHub.
3. GitHub Actions runs web type-check and API compile checks.
4. If checks pass, GitHub Actions SSHs into the Droplet.
5. The Droplet pulls the latest Git commit, rebuilds Docker images, and restarts services with `docker compose`.

## Required GitHub repository secrets

Open GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret.

Required secrets:

- `DO_HOST`: `165.232.69.252`
- `DO_USER`: usually `root`, or your deploy user
- `DO_PORT`: usually `22`
- `DO_SSH_KEY`: private SSH key that can log in to the Droplet

Recommended secret:

- `PRODUCTION_ENV_B64`: base64 encoded content of the server `.env.production` file. If this secret is not set, the workflow will use the existing `/opt/InfutureCoursePlatform/.env.production` on the server.

Optional repository variable:

- `APP_DIR`: defaults to `/opt/InfutureCoursePlatform`

## Create PRODUCTION_ENV_B64 on Windows PowerShell

Create or update your production env file first. Do not commit it.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\InfutureCoursePlatform\deploy\.env.production.real")) | Set-Clipboard
```

Paste the clipboard value into GitHub secret `PRODUCTION_ENV_B64`.

## First-time server preparation

SSH into the Droplet, then run:

```bash
sudo bash /opt/InfutureCoursePlatform/deploy/bootstrap-digitalocean.sh
```

If the repository is not on the server yet, create the app directory and clone once:

```bash
sudo mkdir -p /opt/InfutureCoursePlatform
sudo git clone https://github.com/fengxue8076828/InfutureCoursePlatform.git /opt/InfutureCoursePlatform
cd /opt/InfutureCoursePlatform
sudo bash deploy/bootstrap-digitalocean.sh
```

Then create `/opt/InfutureCoursePlatform/.env.production` or configure `PRODUCTION_ENV_B64` in GitHub Actions.

## Production env keys

Use `deploy/.env.production.example` as the template. Required production keys include database credentials, API URL, Google OAuth client ID, SMTP settings, and Stripe keys.

Important Stripe URLs:

- Checkout success URL is based on `FRONTEND_BASE_URL`.
- Stripe webhook endpoint: `https://api.infuture.world/api/v1/payments/stripe/webhook`

## Manual deploy fallback

If GitHub Actions is unavailable, SSH into the Droplet and run:

```bash
cd /opt/InfutureCoursePlatform
git fetch origin main
git checkout main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --remove-orphans
```
