# Backup & Restore

## Database backup

```bash
docker compose exec postgres pg_dump -U nexus nexus > backup-$(date +%Y%m%d).sql
```

## Database restore

```bash
cat backup-20260609.sql | docker compose exec -T postgres psql -U nexus nexus
```

## Uploads volume

Avatars and task attachments are stored in the Docker `uploads` volume.

```bash
docker run --rm -v internalportal_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-backup.tar.gz -C /data .
```

Restore:

```bash
docker run --rm -v internalportal_uploads:/data -v $(pwd):/backup alpine \
  tar xzf /backup/uploads-backup.tar.gz -C /data
```
