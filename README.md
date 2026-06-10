# Nexus — Internal Operations Portal

**Nexus** is a self-hosted team portal that brings your everyday tools into one place: bookmarked apps and links, a task board, network monitoring, and an optional AI assistant. It is designed for internal teams who want a single home screen for operations—not another SaaS subscription.

Sign in once, and everyone sees the tools and status relevant to their role. The main sidebar collapses to a fixed icon column—labels slide away smoothly while icons stay put—with hover expand to peek at labels, matching the `/chat` workspace sidebar.

---

## What Nexus does

Nexus helps your team find things faster, stay on top of work, and spot problems before they escalate. After login, users land on a **home dashboard** with a greeting, quick search, favourite links, and at-a-glance counts for devices that are down and tasks that are overdue.

### Home dashboard

- Search bookmarks as you type, or ask the built-in AI assistant a question.
- Pin favourite bookmarks — order is **locked by default**; click the unlock icon to drag and rearrange.
- See smart suggestions based on what you use often—or what you have not opened in a while.
- Jump straight to monitoring or tasks when something needs attention.
- **Customise your dashboard** — Edit dashboard mode lets you show/hide or minimise widgets; add **Board link** cards that open a project kanban board directly. Layout is saved per user.

### Notes

A **project-organised scratchpad** at `/notes` (VS Code / Code Runner style):

- **Project sidebar** — filter notes by kanban project or **General**; active project persisted per user
- **File explorer** listing notes in the selected project, with multiple open notes as **tabs** across the top
- **Move notes** between projects from the editor toolbar
- **Syntax modes** — Plain Text, Markdown, Shell, JavaScript, TypeScript, Python, JSON, YAML, SQL, HTML, CSS
- **Run / preview** for Markdown with a toggleable bottom preview pane
- **Autosave** — notes are user-specific and persisted in PostgreSQL

### Bookmarks

Organise internal tools, dashboards, docs, and URLs in a structured library. The main view is **browse-first**: tabs, groups, and cards for launching links. A **Settings** cog opens a modal for all management (create, edit, bulk, import/export, view options). Admins can share restricted tabs with specific users.

- **Tabs, groups, and cards** — hierarchical organisation with drag-and-drop when unlocked
- **Compact cards** — bookmark cards are capped in width (auto-fill grid) so they do not stretch across the window
- **Launch links** in a new tab or inside the portal (iframe)
- **Search** across titles, URLs, tags, and descriptions
- **Settings modal** — create tabs/groups/cards, rename/delete, bulk select, import/export, sort/filter/layout
- **Import and export** — back up or migrate bookmark collections as JSON
- Reliable optimistic IDs when creating groups and cards (works in all browser environments)
- **Optional health checks** — tie a bookmark to a monitored endpoint and see up/down status on the card

Editors can create and manage the library; viewers can browse and launch.

### Tasks

A **Jira-inspired** task board with tickets, hierarchy, roadmap planning, and configurable fields:

- Multiple **projects**, each with ticket keys (e.g. `OPS-001`); **last selected project persists** across reloads
- **Kanban board** (horizontal columns) with **cross-column drag-and-drop**, **WIP limit enforcement**, configurable **default ticket types** (Story + Task by default), and a **board type filter** (All / Other tickets / Bugs only) persisted per user and project. Ticket types include **Epic, Feature, Story, Task, and Bug**.
- **Backlog modal** — full-screen table (key, title, type, parent, assignee, priority, due date, points, status); search/filter; rank via drag handle; drag rows onto board columns or use **Move to board** dropdown.
- **Issues view** — sortable columns, column visibility, quick filters, row selection, and bulk actions (assign, move, priority, delete).
- **View switcher** — jump between Board, Issues, and Roadmap from the page header.
- **Roadmap** — tree-ordered hierarchy (children directly under parents); inline bulk editing with draft/commit workflow; **insert rows between lines**; parent picker shows full ticket names and respects hierarchy rules.
- **Tickets** — tabbed detail modal (Overview, Specification, Links & files, Discussion) with **top-anchored layout**; Overview **Description** uses a **rich text editor** (bold, italic, underline, headings, lists, font size, text colour) with **resizable height persisted per user**; **Save and close** alongside Save; **Links & files** supports drag-and-drop uploads, URL links, `.eml` emails, **attachment preview modal** (PDF, Office docs, images, plain text), and **attachment versioning**; **hierarchy rules** configurable per project
- **Project settings** — tabbed layout (General, Board, Roadmap, Hierarchy, Fields & Display); columns, labels, **board card fields** (parent, due date, stale indicator, child subtasks), **visible board types**, **bug visibility default** (show bugs / hide bugs / always show all types), and clearer **hierarchy rules** UI.

### Monitoring

Keep an eye on servers, services, and URLs:

- **Overview** — see which targets are up, down, or unknown, with latency sparklines.
- **Discover devices** — import unmonitored bookmark URLs or **scan a network range** (CIDR / IP range); network scan defaults to **ping** checks with plain IP targets (no URL/port).
- **Check types** — ping, TCP, or HTTP, on a schedule you configure.
- **Device detail pages** — back link to monitoring overview, **Edit** button (configure permission), latency charts (1h / 24h / 7d), and a history of recent checks.
- **Force a check** when you need an immediate result.

A background worker runs checks continuously so the dashboard stays current.

### AI assistant (optional)

When an xAI API key is configured, users with permission can:

- Chat with **Grok** from the home page search bar or AI drawer.
- Use the full **AI Chat** workspace at `/chat` with projects, conversations, project- and conversation-level file knowledge bases (**semantic RAG** across files, notes, meetings, and tasks when `OPENAI_API_KEY` is set), **persistent scoped search toggles** (Files / Notes / Meetings / Tasks), **metadata filters** (kanban project, meeting date range, note language, meeting labels), per-conversation **Skills**, clickable source **citations** with excerpts, and **compact skill activity** (Web/X search, tasks, etc. shown as one-line chips; expand for source links only—the final answer stays full).
- Get **AI-suggested metadata** when creating bookmarks (title, description, tags, icon).
- **Analyse audit logs** in the admin panel (summaries, anomalies, follow-ups).

Leave the API key unset to run Nexus without AI features.

### Meeting Assistant

At `/meetings` (requires `ai:use`):

- **Create** meetings with title, **date/time** (defaults to now), and optional **project** — or **create a new project** inline (`tasks:edit`).
- **Record** or upload meeting audio (browser recordings default to **96 kbps Opus WebM**; admins can change format/bitrate under System Settings).
- **Transcribe** with OpenAI Whisper (`OPENAI_API_KEY`).
- **Summarize** and extract **action items** with Grok.
- **Ask questions** about the meeting in a scoped chat interface.
- **Edit** title, date/time, and project from the meeting detail view.
- **Archive** meetings (soft delete); view them at `/meetings/archived` and **delete permanently** with confirmation.
- Link meetings to **Tasks projects**; convert action items into backlog/tickets.
- Search and filter active/archived meetings by title, transcript, project, and labels.

### Security & user lifecycle

- **Account status:** `pending`, `member`, or `administrator` — new users start as **pending** with access limited to Profile Settings until elevated.
- **Two-factor authentication:** mandatory for non-administrators — choose **authenticator app (TOTP)** or **email codes** in Profile Settings (`/settings`). Optional for admins; enforced at sign-in when enabled. Only one method at a time.
- **Appearance:** choose **Dark** or **Light** theme in Profile Settings (`/settings`); preference is saved per user and applied on every visit.
- **SMTP2go** integration for welcome/invite emails and admin alerts when pending users sign in for the first time (`SMTP2GO_*` env vars).

### Administration

Admins manage the portal itself:

- **Users** — create pending accounts, assign roles, elevate status (`pending` → `member` / `administrator`), send welcome emails, disable users, and override permissions per person.
- **System settings** — AI model choice, header subtitle, meeting recording format/bitrate, and **send test email** to verify SMTP2go.
- **Knowledge base** — RAG chunk browser, index health, 7/30-day retrieval analytics, pipeline debug test search (vector/keyword/fused scores), reindex, and staged backfill progress (`?tab=knowledge`).
- **Audit logs** — review who did what, filter, export, or ask AI to summarise activity.

---

## Who it is for

Nexus suits **internal ops, IT, engineering, or small business teams** that want:

- One bookmark hub instead of scattered browser favourites.
- A simple task board without Jira-level complexity.
- Basic uptime/latency monitoring without a separate monitoring product.
- Optional AI help, hosted on your own infrastructure.

It runs on your network or server—you control the data, users, and backups.

---

## User roles

Access is controlled by role. Admins can also set **custom permissions** per user (e.g. view bookmarks but not edit tasks).

| Role | Typical access |
|------|----------------|
| **Admin** | Everything, including user management and system settings |
| **Editor** | Edit bookmarks, tasks, and monitoring configuration |
| **User** | Edit bookmarks and tasks; view monitoring |
| **Viewer** | Read-only access to bookmarks, tasks, and monitoring |

---

## Technical reference

The sections below cover installation, configuration, and deployment.

### Quick start (Docker)

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET to a long random string

docker compose up -d --build
```

Open **http://localhost:8374** and sign in with the seeded admin credentials from `.env` (default: `admin@localhost` / `changeme123`).

### Development

```bash
cp .env.example .env
# Point DATABASE_URL at local Postgres or run: docker compose up postgres -d

npm install
npm run db:push
npm run db:seed
npm run dev
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing secret (32+ chars) |
| `AUTH_URL` | Public app URL users open in the browser (e.g. `https://nexus.example.com`) |
| `NEXT_PUBLIC_APP_URL` | Same as `AUTH_URL` — used for absolute links in emails and server-side URL generation |
| `AUTH_TRUST_HOST` | Set to `true` when behind Cloudflare Tunnel or a reverse proxy (Auth.js `trustHost`) |
| `XAI_API_KEY` | xAI API key for Grok (optional) |
| `OPENAI_API_KEY` | OpenAI API key for Whisper transcription and RAG embeddings (optional) |
| `SMTP2GO_API_KEY` | SMTP2go API key for transactional email (optional) |
| `SMTP2GO_SENDER_EMAIL` | From address for SMTP2go emails |
| `SMTP2GO_SENDER_NAME` | From name for SMTP2go emails (default: Nexus) |
| `SEED_ADMIN_*` | First-run admin bootstrap |

### Backup & restore

```bash
# Backup
docker compose exec postgres pg_dump -U nexus nexus > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U nexus nexus
```

Uploads (avatars, attachments) live in the `uploads` Docker volume.

### HTTPS (future)

For production/LAN with TLS, place nginx or Caddy in front of the app container:

```nginx
location / {
  proxy_pass http://127.0.0.1:8374;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your HTTPS URL.

### Cloudflare Tunnel (public access)

When exposing Nexus via Cloudflare Tunnel (e.g. `https://nexus.example.com` → internal `8374`):

1. Set stack environment variables to the **public domain**, not the internal IP:
   ```
   AUTH_URL=https://nexus.example.com
   NEXT_PUBLIC_APP_URL=https://nexus.example.com
   AUTH_TRUST_HOST=true
   ```
2. Auth.js runs with `trustHost: true` and middleware redirects use `X-Forwarded-Host` / `X-Forwarded-Proto` from Cloudflare.
3. Prefer relative URLs in the UI; absolute URLs in emails and admin alerts use `NEXT_PUBLIC_APP_URL` / `AUTH_URL`.

Do **not** set `AUTH_URL` to `http://192.168.x.x:8374` when users access the app through the tunnel.

### Portainer stack

Deploy from the GitHub repo with build enabled. Set these stack environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH_SECRET` | Yes | 32+ char random string |
| `POSTGRES_PASSWORD` | Recommended | Change from default |
| `AUTH_URL` | Recommended | Public browser URL, e.g. `https://nexus.example.com` (not internal IP) |
| `NEXT_PUBLIC_APP_URL` | Recommended | Same as `AUTH_URL` |
| `AUTH_TRUST_HOST` | Recommended | `true` when behind Cloudflare Tunnel or reverse proxy |
| `SEED_ADMIN_EMAIL` | Recommended | First-run admin (only if DB empty) |
| `SEED_ADMIN_PASSWORD` | Recommended | Change before first deploy |
| `SEED_ADMIN_NAME` | Optional | Default: `Admin` |
| `XAI_API_KEY` | Optional | Grok AI; leave blank to disable |
| `OPENAI_API_KEY` | Optional | Whisper transcription; RAG embeddings for AI Chat knowledge bases |
| `SMTP2GO_API_KEY` | Optional | Transactional email via SMTP2go REST API |
| `SMTP2GO_SENDER_EMAIL` | Optional | Verified sender email in SMTP2go |
| `SMTP2GO_SENDER_NAME` | Optional | Email sender display name |

`DATABASE_URL` and `UPLOAD_DIR` are set automatically by compose — do not override unless you change the stack file.

Default host port: **8374** (maps to container port 3000).

### SonarQube (code quality)

Static analysis runs via a **self-hosted GitHub Actions runner** on your LAN (`.github/workflows/sonar-self-hosted.yml`), because Cloudflare blocks GitHub-hosted runners from `sonarqube.q1.co.nz`. The runner talks to SonarQube directly at **`http://192.168.2.135:9000`**.

**One-time setup**

1. Create a SonarQube project with key **`nexus`** at [http://192.168.2.135:9000/projects](http://192.168.2.135:9000/projects) (matches `sonar-project.properties`).
2. Generate a **Project Analysis Token** (`sqp_…`): **Project nexus → Project Settings → Analysis Method**.
3. In GitHub → **Settings → Secrets and variables → Actions**, set:

| Secret | Value |
|--------|--------|
| `SONAR_HOST_URL` | `http://192.168.2.135:9000` — **no** `/projects` path, **no** trailing slash |
| `SONAR_TOKEN` | Your `sqp_…` token (no quotes or trailing spaces) |

4. Register a **self-hosted runner** on `192.168.2.135` (or any LAN host that can reach that URL):
   - GitHub repo → **Settings → Actions → Runners → New self-hosted runner** → Linux x64
   - Run the install commands on the server, then `./run.sh` (or install as a service)
   - The runner must stay online for push/PR scans to run

5. Push to `main` or run **Actions → SonarQube Analysis (self-hosted) → Run workflow**.

The cloud workflow (`.github/workflows/sonar.yml`) is **manual-only** for optional tests against the public hostname once Cloudflare access is fixed.

**Configuration**

- Project settings: `sonar-project.properties` at the repo root
- Sources: repository root (excludes tests, `node_modules`, `.next`, `dist`, `coverage`, Drizzle meta)

**Troubleshooting**

| Symptom | Likely cause |
|---------|----------------|
| HTML page “**Sorry, you have been blocked**” / Cloudflare Ray ID | **Cloudflare WAF/bot protection** is blocking GitHub Actions runner IPs (Azure, e.g. `40.x.x.x`) before traffic reaches SonarQube. Your token is fine — fix Cloudflare or use a self-hosted runner. |
| `HTTP 403` on scanner with no Cloudflare HTML | Invalid or expired `SONAR_TOKEN`, or wrong project permissions. |
| Works locally, fails in Actions | Local machine is allowlisted on Cloudflare; GitHub runners are not. Or GitHub secret differs from your local token. |
| `sonar.login` in local tests | Deprecated on SonarQube 10+; use `SONAR_TOKEN` env or `-Dsonar.token=` (not `-Dsonar.login=`). |

**Cloudflare fix (when Actions runners are blocked)**

GitHub-hosted runners use public cloud IPs that Cloudflare often treats as bots. For `sonarqube.q1.co.nz`:

**Without paid WAF**, use one of these instead:

| Option | Effort | Notes |
|--------|--------|--------|
| **1. Self-hosted GitHub runner** (recommended) | Medium | Install a runner on **`192.168.2.135`**. Set `SONAR_HOST_URL` to `http://192.168.2.135:9000`. See `.github/workflows/sonar-self-hosted.yml`. |
| **2. DNS-only subdomain** | Low | Add `sonarqube-origin.q1.co.nz` with **proxy disabled** (grey cloud) pointing at SonarQube’s public IP. Set GitHub secret `SONAR_HOST_URL` to that hostname. Traffic bypasses Cloudflare. Only works if the origin is reachable from the internet. |
| **3. Free Firewall Rules / IP Access Rules** | Low | On the **Free** plan you get **IP Access Rules** and a few **Firewall Rules** (not WAF custom rules). Allow [GitHub Actions IP ranges](https://api.github.com/meta) (`actions` in JSON) for host `sonarqube.q1.co.nz`. Ranges change over time. |
| **4. Reduce bot blocking** | Low | Turn off **Bot Fight Mode** for the SonarQube subdomain, or lower **Security Level** (Page Rule / Configuration Rule if available on your plan). Less precise than IP allowlisting. |
| **5. Scan on your network, not in GitHub** | Medium | Run `sonar-scanner` from Portainer deploy, a cron job, or your dev machine against the internal SonarQube URL. Skip GitHub Actions for analysis entirely. |

Paid **WAF custom rules** are optional — options 1–4 avoid them.

The workflow **Verify** step checks `/api/system/status` (no auth) first — if that returns Cloudflare HTML, the problem is network/WAF, not the token.

The workflow includes a **Verify SonarQube secrets and connectivity** step that checks reachability and token validation before scanning. Use **Actions → SonarQube Analysis → Run workflow** to test after updating Cloudflare or secrets.

**Never commit tokens** to the repository. If a token was pasted into a file, revoke it in SonarQube and create a new one.

After secrets are set, pushes and PRs trigger the **SonarQube Analysis** workflow. Results appear in SonarQube and (for PRs) as GitHub checks when the server is linked.

### Releasing a new version

After merging changes to `main`:

1. Bump `package.json` and `REQUIREMENTS.md` version markers.
2. Commit, tag, and push:
   ```bash
   git tag v1.x.x
   git push origin main
   git push origin v1.x.x
   ```
3. **Publish a GitHub Release** from the tag (tags alone do not appear on the Releases page):
   ```bash
   gh release create v1.x.x --title "v1.x.x — Short title" --notes "Release notes…" --latest
   ```
4. Trigger the Portainer stack webhook to redeploy (migrations run on app startup).

### Architecture

- **app** — Next.js 15 (App Router, Server Actions, Auth.js v5)
- **postgres** — PostgreSQL 16 with pgvector extension
- **monitor-worker** — Background network health checks

For a full feature breakdown, see [REQUIREMENTS.md](./REQUIREMENTS.md).

---

## License

Private / internal use.
