# Backup & Restore

## Admin UI (recommended)

**Admin → Settings → Backup & Restore**

| Action | Detail |
|--------|--------|
| Download backup | Full `.tar.gz`: `database.sql` (pg_dump), `uploads/`, `manifest.json` |
| Email backup | SMTP2go attachment when archive ≤ 10 MB |
| Restore | Select `.tar.gz`, confirm warning, enter passcode; replaces DB + uploads |

Requires admin access. Events are logged to the audit trail.

---

## Manual CLI — database only

```bash
docker compose exec postgres pg_dump -U nexus nexus > backup-$(date +%Y%m%d).sql
```

Restore:

```bash
cat backup-20260609.sql | docker compose exec -T postgres psql -U nexus nexus
```

## Manual CLI — uploads volume only

Avatars, task attachments, and meeting audio live in the Docker `uploads` volume.

```bash
docker run --rm -v internalportal_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-backup.tar.gz -C /data .
```

Restore:

```bash
docker run --rm -v internalportal_uploads:/data -v $(pwd):/backup alpine \
  tar xzf /backup/uploads-backup.tar.gz -C /data
```
