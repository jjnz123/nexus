# Nexus — Internal Operations Portal

A self-hosted web hub for bookmarks, kanban tasks, network monitoring, and Grok AI assistance.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET to a long random string

docker compose up -d --build
```

Open **http://localhost:8374** and sign in with the seeded admin credentials from `.env` (default: `admin@localhost` / `changeme123`).

## Development

```bash
cp .env.example .env
# Point DATABASE_URL at local Postgres or run: docker compose up postgres -d

npm install
npm run db:push
npm run db:seed
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing secret (32+ chars) |
| `AUTH_URL` | Public app URL (e.g. `http://localhost:8374`) |
| `XAI_API_KEY` | xAI API key for Grok (optional) |
| `SEED_ADMIN_*` | First-run admin bootstrap |

## Backup & Restore

```bash
# Backup
docker compose exec postgres pg_dump -U nexus nexus > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U nexus nexus
```

Uploads (avatars, attachments) live in the `uploads` Docker volume.

## HTTPS (Future)

For production/LAN with TLS, place nginx or Caddy in front of the app container:

```nginx
location / {
  proxy_pass http://127.0.0.1:8374;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

Set `AUTH_URL` to your HTTPS URL.

## Portainer Stack

Deploy from the GitHub repo with build enabled. Set these stack environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH_SECRET` | Yes | 32+ char random string |
| `POSTGRES_PASSWORD` | Recommended | Change from default |
| `AUTH_URL` | Recommended | Must match browser URL, e.g. `http://192.168.1.50:8374` |
| `SEED_ADMIN_EMAIL` | Recommended | First-run admin (only if DB empty) |
| `SEED_ADMIN_PASSWORD` | Recommended | Change before first deploy |
| `SEED_ADMIN_NAME` | Optional | Default: `Admin` |
| `XAI_API_KEY` | Optional | Grok AI; leave blank to disable |

`DATABASE_URL` and `UPLOAD_DIR` are set automatically by compose — do not override unless you change the stack file.

Default host port: **8374** (maps to container port 3000).

## Architecture

- **app** — Next.js 15 (App Router, Server Actions, Auth.js v5)
- **postgres** — PostgreSQL 16
- **monitor-worker** — Background network health checks

## Roles

| Role | Capabilities |
|------|-------------|
| Admin | Full access + user management |
| Editor | Edit bookmarks, tasks, monitoring config |
| User | Edit bookmarks/tasks, view monitoring |
| Viewer | Read-only |

## License

Private / internal use.
