# Nexus — Requirements

Internal operations portal for bookmarks, kanban tasks, network monitoring, and AI assistance.

**Current release:** v3.2.0

## 1. Overview

| Item | Detail |
|------|--------|
| Product name | Nexus |
| Stack | Next.js 15 (App Router), Server Actions, Auth.js v5, PostgreSQL, Drizzle ORM |
| AI provider | xAI Grok (optional; `XAI_API_KEY`); OpenAI Whisper (optional; `OPENAI_API_KEY`) |
| Email | SMTP2go REST API (optional; `SMTP2GO_*`) |
| Background services | `monitor-worker` for scheduled network health checks |

## 2. Authentication & Authorization

### 2.1 Authentication

- Email/password sign-in via credentials provider (`/login`)
- Two-step login when TOTP is enabled (password, then authenticator or backup code)
- JWT session strategy (includes `status`, `totpEnabled` on session user)
- Redirect unauthenticated users to `/login`
- Pending users and users without required 2FA are restricted to `/settings` only
- Public routes: `/api/auth/*`, `/api/health`
- Auth.js `trustHost: true` — trusts `X-Forwarded-Host` / `X-Forwarded-Proto` from Cloudflare Tunnel and reverse proxies
- Middleware redirects resolve the public origin from forwarded headers (not the internal Docker/LAN address)
- Absolute URLs in emails use `NEXT_PUBLIC_APP_URL` (preferred) or `AUTH_URL`

### 2.1.1 Account status

| Status | Access |
|--------|--------|
| `pending` | Profile Settings only until elevated |
| `member` | Full access per role (after 2FA setup if required) |
| `administrator` | Admin access; role forced to `admin`; 2FA optional but enforced at login when enabled |

- New users created by admins start as **`pending`**
- Admins elevate `pending` → `member` or `administrator` in Admin Panel
- First login by a pending user emails all administrators (SMTP2go)

### 2.1.2 Two-factor authentication (TOTP & email)

- Mandatory for all users **except** administrators (admins may optionally enable either method in Profile Settings)
- **Authenticator app (TOTP):** QR enrollment in Profile Settings, backup codes (hashed, one-time use)
- **Email codes:** optional alternative via SMTP2go — enable in Profile Settings with password verification; code sent at sign-in
- Only one method active at a time (authenticator or email)
- When enabled on any account (including administrators), the second factor is required at sign-in
- TOTP secrets encrypted at rest using `AUTH_SECRET`-derived key
- Email verification codes expire after 10 minutes

### 2.1.3 Transactional email (SMTP2go)

- Provider: `https://api.smtp2go.com/v3/email/send` with `X-Smtp2go-Api-Key` header
- Env: `SMTP2GO_API_KEY`, `SMTP2GO_SENDER_EMAIL`, `SMTP2GO_SENDER_NAME`
- Sends: welcome/invite emails on user creation; admin alert on pending user first login; **test email** from Admin → Settings
- Gracefully skips when not configured (logs warning)

### 2.2 Roles

| Role | Default capabilities |
|------|---------------------|
| Admin | Full access including user management, system settings, audit logs |
| Editor | Edit bookmarks, tasks, monitoring config; view monitoring; use AI |
| User | Edit bookmarks and tasks; view monitoring; use AI |
| Viewer | Read-only access to bookmarks, tasks, and monitoring |

### 2.3 Per-User Permission Overrides

Admins can override role defaults per user:

- AI assistant (`ai:use`)
- Bookmarks view (`bookmarks:view`)
- Bookmarks edit (`bookmarks:edit`)
- Tasks view (`tasks:view`)
- Tasks edit (`tasks:edit`)
- Monitoring view (`monitoring:view`)
- Monitoring configure (`monitoring:configure`)

Admin-only permissions (not overridable via custom flags):

- User management (`users:manage`)
- Admin panel access (`admin:access`)

### 2.4 Route Access Control

| Route prefix | Required permission |
|--------------|---------------------|
| `/chat` | `ai:use` |
| `/meetings` | `ai:use` |
| `/meetings/archived` | `ai:use` |
| `/admin` | `admin:access` |
| `/bookmarks` | `bookmarks:view` |
| `/tasks` | `tasks:view` |
| `/monitoring` | `monitoring:view` |
| `/settings` | All authenticated users |
| `/notes` | All authenticated users |
| `/` | All authenticated users |

## 3. Global Application Shell

Available on all authenticated app routes.

### 3.1 Navigation

- Sidebar: Home, **Notes**, **AI Chat**, Bookmarks, Tasks, Monitoring
- Nav items hidden when the user lacks the required permission
- Active route highlighting
- **Collapsible sidebar** — fixed icon column; labels collapse/expand with CSS transitions (icons do not shift). Icon-only mode with hover expand (same behaviour as `/chat` sidebar)
- Manual collapse/expand toggle; state persisted in user preferences (`app_sidebar_collapsed`)
- Full viewport height rail with CSS width transitions (no flicker)
- Mobile-responsive header with product branding
- **Mobile navigation drawer** — hamburger menu exposes permission-filtered nav links on small screens

### 3.2 Header

- Configurable portal subtitle (from system settings)
- Subtitle can be enabled or disabled globally

### 3.3 Notifications

- Bell icon with unread count badge
- Dropdown list of recent notifications (up to 10)
- Mark individual notification as read
- Mark all notifications as read
- Badge and list update immediately after mark-read actions (React Query invalidation)
- Optional deep link per notification (`Open` action)

### 3.4 Profile Menu

- User avatar (uploaded image or initials fallback)
- Display name and email
- **Admin users:** links to System Settings, Admin Panel, Audit Logs
- **Non-admin users:** link to Profile Settings
- Sign out (redirect to `/login`)

## 4. Home (`/`)

### 4.1 Dashboard

- Personalized time-based greeting with user name
- Permission-aware rendering of widgets and sections

### 4.2 Search & AI Entry

Requires `ai:use` permission.

- Unified search input
- Live bookmark filtering as user types (title, description, group, tab)
- Display up to 6 bookmark matches with launch action
- Submit opens AI chat drawer
- `ai:` prefix skips bookmark filtering and sends prompt to AI

### 4.3 Operations Summary Widgets

- **Devices Down** — count of down monitors; links to `/monitoring` (requires `monitoring:view`)
- **Overdue Tasks** — count of overdue tasks; links to `/tasks` (requires `tasks:view`)

### 4.4 Smart Bookmark Suggestions

Requires `bookmarks:view`.

- **Most used (7 days)** — frequently launched bookmarks
- **Haven't used in a while** — stale bookmarks based on click history
- Launch bookmarks directly from suggestions

### 4.5 Favourites

Requires `bookmarks:view`.

- Display user-favourited bookmarks (cards capped at ~320px width)
- Drag-and-drop reorder **locked by default** — small unlock icon toggles rearrange mode (persisted order saved on drop)
- Launch bookmarks (new tab or in-app iframe)
- Link to full bookmarks page

### 4.6 AI Chat Drawer

Requires `ai:use`.

- Grok-branded streaming chat drawer (opened from home search or Ask AI)
- Distinct user (right) and assistant (left) message bubbles with avatars
- **Markdown rendering** in assistant replies (headings, lists, code blocks, links)
- Large textarea input: Enter to send, Shift+Enter for newline
- Streaming with animated “Thinking…” state; **Stop** while generating
- **Copy** on each assistant message; **Regenerate** on the latest reply
- **New chat** clears the in-drawer conversation
- Starter prompt chips on empty state
- Auto-scroll while streaming
- Nexus-aware system prompt on the chat API
- Initial prompt support from home search (`ai:` prefix or Enter)
- Error handling for missing API key or insufficient permissions
- Ephemeral session only (no database persistence); use `/chat` for saved history

## 4.7 AI Chat Workspace (`/chat`)

Requires `ai:use`. Also linked from the sidebar as **AI Chat**.

### Layout

Three-panel workspace (full-bleed within app shell):

- **Left** — Collapsible projects and conversations sidebar (icon-only mode with hover expand)
- **Center** — Main chat area with header (conversation title, Skills and Files actions), active skill chips above composer, and file manager access
- **Right** — Vertical history indicator bar (one marker per user/assistant message)

### Collapsible Sidebar

- Manual collapse/expand toggle; state persisted in user preferences (`chat_sidebar_collapsed`)
- Fixed **56px icon column** — icons stay aligned when collapsing; only labels animate out
- Hover over collapsed sidebar smoothly expands full labels and lists (no DOM swap / flicker)
- Quick access to file manager from sidebar header

### Projects & Conversations

- Conversations belong to a parent **Project** (or **General** when no project is selected)
- Create, rename, and delete **Projects** (user-owned; separate from kanban `projects`)
- **General** pseudo-project for conversations without a project
- Create, rename, delete, and **search** conversations within the active project
- Last message preview and relative timestamp on each conversation
- Active project and conversation persisted in user preferences

### Chat Interface

- Streaming Grok responses via `/api/ai/chat` with messages persisted to PostgreSQL
- User vs assistant bubbles with markdown (assistant), copy, and regenerate (latest assistant reply)
- **Attachments** — images, PDFs, and text files via `/api/uploads`; thumbnails for images, file cards for documents
- Starter prompt chips on empty conversation
- Stop streaming mid-generation (partial assistant reply saved when content exists)

### File Management

- **Project-level files** — upload, rename, delete files shared across all conversations in a project (knowledge base)
- **Conversation-level files** — upload, rename, delete files scoped to the current conversation only
- File manager dialog labels scope clearly (**Project-wide** vs **This conversation** badges)
- File manager dialog with search, image/document grouping, drag-and-drop upload, previews, and bulk upload
- Text file content extracted for basic RAG-style context in AI responses
- Message-level attachments remain supported in the composer

### AI Skills (Tool Use)

- Grok can invoke Nexus **skills** during `/chat` conversations (permission-aware)
- Built-in skills: **Create Task**, **Update Task**, **Check Monitoring**, **Search Bookmarks**, **Web Search**, **X Search**
- Web Search and X Search use the xAI Responses API (`web_search` / `x_search` tools); require `ai:use`
- **Per-conversation skill toggles** — Skills panel to enable/disable each skill; stored in `enabled_skills` on the conversation (`null` = all permitted skills; `[]` = none)
- Active skills shown as chips above the composer; header **Skills** button opens management dialog
- Skill usage shown inline in assistant messages with Grok-style result cards (status, structured results)
- **Collapsed by default** once the assistant's final answer is displayed; users can expand to view full skill output (Web/X search show summary + citations, not raw JSON)
- Skill results persisted in message `metadata` jsonb
- Only enabled skills are sent to the model as tools
- Extensible skill registry in `src/lib/ai/skills/`

### Vertical History Indicator Bar

- Scrollable timeline with a marker for **every** user and assistant message
- Click marker → smooth scroll to that message (Framer Motion highlight)
- Hover marker → preview card (excerpt, sender, timestamp)
- Distinct colors for user vs Grok markers
- Active message tracked via scroll intersection

### Data Model

- `ai_projects` — user-owned project folders
- `ai_conversations` — title, project link, last message preview/at, `enabled_skills` (jsonb)
- `ai_messages` — role, content, attachments (jsonb), metadata (jsonb, skill events), timestamps
- `ai_project_files` — project knowledge base files with text preview cache
- `ai_conversation_files` — conversation-scoped files with text preview cache
- User preferences: `active_ai_project_id`, `active_ai_conversation_id`, `chat_sidebar_collapsed`, `app_sidebar_collapsed`

## 4.8 Notes (`/notes`)

All authenticated users.

### Layout

- Full-bleed workspace within the app shell (similar to `/chat`)
- **Left** — collapsible file explorer listing the user's notes
- **Top** — tab bar for multiple open notes
- **Center** — title, language/mode selector, editor textarea
- **Bottom** — optional Markdown preview pane (toggleable; **Run** opens preview for Markdown)

### Features

- Create, rename (inline title), and delete notes
- **Syntax modes:** Plain Text, Markdown, Shell Script, JavaScript, TypeScript, Python, JSON, YAML, SQL, HTML, CSS
- **Autosave** on edit (debounced server persistence)
- Workspace state persisted per user: open tabs, active tab, preview visibility, explorer collapsed

### Data Model

- `user_notes` — `id`, `user_id`, `title`, `content`, `language`, `sort_order`, timestamps
- `user_preferences.notes_workspace` (jsonb) — open tab IDs, active tab, preview/explorer UI state

## 5. Bookmarks (`/bookmarks`)

Requires `bookmarks:view`. Edit operations require `bookmarks:edit`.

### 5.0 Browse-first layout

The main bookmarks view is **read-focused**:

- **Tabs bar** — switch between tabs (drag reorder when unlocked)
- **Search bar** — fuzzy search with match count
- **Settings cog** — opens a management modal for all create/edit/bulk/import/view options
- **Groups and cards** — browse and launch; no inline rename/delete/edit controls on the main canvas

All creation, editing, deletion, bulk actions, import/export, and view preferences live in the **Settings** modal (or sub-modals it opens). Cards launch on click; card editing is available from Settings → Manage cards or the bookmark editor modal.

### 5.1 Structure

- **Tabs** — top-level organization
  - Create, rename, delete
  - Drag-and-drop reorder
  - Active tab persisted per user
- **Groups** — within each tab
  - Create, rename, delete (empty groups only)
  - Collapse/expand
  - Drag-and-drop reorder
- **Cards** — bookmark entries within groups
  - Create, edit, duplicate
  - Archive with undo toast
  - Restore archived cards
  - Permanent delete with confirmation

### 5.2 Layout & Ordering

- Grid or list layout (persisted per user)
- Bookmark cards capped at ~320px width in grid mode (auto-fill layout within groups); list mode cards capped at `max-w-2xl`
- Sort modes: custom, alphabetical, most used, most used (30d), recently used, health
- Global layout lock (prevents drag-and-drop)
- Per-tab layout lock
- Drag-and-drop card reorder and cross-group moves (when unlocked and sort mode is custom)
- Drag-and-drop group reorder (when unlocked)

### 5.3 Search & Filters

- Fuzzy search across title, description, URL, tags
- Filter chips: all, recently used, monitored & healthy, disabled
- Dynamic tag-based filters
- Show/hide archived cards
- Match count vs total count display

### 5.4 Bookmark Card

Each card supports:

- Launch in new tab or in-app iframe modal (click card or hover open icon in browse mode)
- Health status pill when linked to monitoring
- Click statistics (total clicks, last used)
- Visual flash on health status change
- Bulk selection checkbox when bulk mode is enabled from Settings
- Edit, duplicate, archive, delete, favourite, and enable/disable via **Settings → Manage cards** or the bookmark editor modal (not inline on the card)

### 5.5 Bookmark Editor

- Fields: title, description, URL, group, tags, accent color
- Icon types: emoji, Lucide icon, uploaded image, favicon
- **URL enrichment** — auto-fetch title, description, favicon from URL
- **AI suggestion** — Grok suggests title, description, icon, tags, suggested group (requires `ai:use`)
- Open in iframe toggle
- Enabled toggle
- **Health monitoring** — link card to monitor device (requires `monitoring:configure`)
- Actions from editor: duplicate, archive, delete, toggle favourite

### 5.6 Bulk Operations

Requires `bookmarks:edit`. Enabled from **Settings → Bulk actions**.

- Bulk selection mode (bulk bar appears below search when active)
- Bulk enable, disable, archive, delete
- Bulk move to group or tab (uses dedicated `move` action — does not change enabled state)
- Bulk enable health monitoring (requires `monitoring:configure`)
- Bulk export selected cards

### 5.7 Import & Export

Requires `bookmarks:edit`. Available from **Settings → Import & export** and empty states.

- **Export:** current tab, all tabs, or selected cards as JSON
- **Import:** JSON file upload with preview (tab/group/card counts); preview loads when dialog opens; accepts `.json` files on all browsers
- Import modes: merge or replace
- **Create tab**, **Add group**, and **Import JSON** work from empty states (no tabs / no groups / no cards)
- **Add group** opens a proper create-group dialog (not browser `prompt`); tab data initializes immediately so create actions work before async load completes
- Optimistic create/update uses shared `createId()` helper (not raw `crypto.randomUUID`) for environments where `randomUUID` is unavailable
- Settings sub-dialogs open after the settings modal closes (avoids Radix dialog stacking issues)

### 5.8 Admin Bookmark Sharing

Requires `admin:access`.

- Share tabs with selected users (`bookmark_shares` table)
- Tab visibility: **everyone** (default) or **restricted** (only admins + shared users)
- Share dialog opened from **Settings → Active tab**
- Shares on groups/cards resolve to parent tab visibility for recipients

### 5.9 Launch Analytics

- Record bookmark launches with source (`bookmarks`, `landing`, `search`, `suggestions`) and referrer
- Per-user click counts for sorting and smart suggestions

### 5.10 Smart Suggestions

- Same frequent/stale suggestion sections as home page

### 5.11 Empty States

- Guided empty states for: no tabs, no groups, no cards

## 6. Tasks (`/tasks`, `/tasks/[KEY]`)

Requires `tasks:view`. Edit operations require `tasks:edit`.

### 6.1 Projects

- List and switch between projects
- Create project with key (e.g. `OPS`) and display name
- Empty state when no projects exist

### 6.2 Layout & Views

- **Collapsible Tasks sidebar** — Board, Issues, Roadmap, Project settings (icon-only + hover expand)
- **View switcher** in the page header — quick toggle between Board, Issues, and Roadmap (alongside sidebar navigation)
- **Kanban board** — non-backlog columns only, single horizontal scroll row (no wrapping)
- **Backlog panel** — slide-out panel (top-right button); create/manage backlog items; move to board (To Do)
- WIP limit display per column with visual warning when exceeded

### 6.3 Task Hierarchy & Ticket Fields

- Ticket types: **Epic**, **Feature**, **Story**, **Task**
- Optional **parent** link for hierarchy (Epic → Feature → Story/Task)
- Extended ticket fields stored on `tasks`:
  - Title, description, **details**, **acceptance criteria**, **definition of done**, **story points**
  - Priority, due date, assignee, column/status, type, parent, labels
- **Linked issues** — `task_links` table (relates to, blocks, duplicates); search-and-link UI in ticket modal
- **Attachments** — upload via `/api/uploads`, stored in `task_attachments` with mime type; image/PDF preview in modal
- **Comments** — threaded replies via `parent_id` on `task_comments`

### 6.4 Filtering

- Search tasks by title, description, and key
- Filter by priority: all, low, medium, high, urgent
- Filter by assignee: all, unassigned, or specific user

### 6.5 Issues View

- Jira-style table of all project tasks with sortable columns: key, type, title, status, assignee, priority, parent, due date, story points
- **Column visibility** menu — show/hide columns per user session
- **Filters** — search (title, description, key), type, status/column, priority, assignee
- **Row selection** with bulk action bar: assign, move column, set priority, delete (requires `tasks:edit`)
- Click row to open ticket detail modal

### 6.6 Roadmap View

- **Draft/commit workflow** — inline edits stay local until **Commit changes**; **Discard** resets draft
- **Add item** dropdown — create Epic, Feature, Story, or Task directly on the roadmap
- Editable table: key, title, type, parent, assignee, priority, due date, story points, status/column
- Hierarchy visible via indent + collapse/expand on parent rows
- Bulk create, update, and delete committed via `commitRoadmapChanges` server action

### 6.7 Project Settings

Requires `tasks:edit`.

- **Columns:** drag-to-reorder, create, edit (name, color, WIP limit), delete (non-backlog columns)
- Backlog column managed here but hidden from kanban
- **Labels:** create with name and color
- **Ticket fields by type:** per Epic/Feature/Story/Task — drag-to-reorder fields, show/hide toggles; stored in `projects.settings.ticketFields`; controls ticket modal, backlog create form visibility

### 6.8 Create Ticket

Requires `tasks:edit`.

- **New task** toolbar button opens create-task dialog (board columns only)
- Per-column **+** button pre-selects target column
- **Backlog panel** — expanded create form: title, description, type, priority, assignee, parent, story points (respects field settings)
- Backlog items created via backlog panel; move to board defaults to To Do

### 6.9 Task Cards

- Display task key, title, type, priority badge, assignee, due date, labels
- Draggable on kanban board
- Click to open task detail modal

### 6.10 Ticket Detail Modal

- Deep-linkable via `/tasks/[KEY]` (e.g. `/tasks/OPS-001`)
- **Tabbed layout** — Overview, Specification, Links & files, Discussion (reduces cramped single-page scrolling)
- Header: ticket key badge, type/status badges, inline title edit
- Field visibility/order driven by project ticket field settings for the ticket type
- Edit all ticket fields (see §6.3)
- **Overview tab** — metadata grid, description, labels (pill toggles), subtasks
- **Specification tab** — details, acceptance criteria, definition of done
- **Links & files tab** — linked issues panel (search, link, unlink, open linked ticket); attachments (upload, preview images/PDFs, delete)
- **Discussion tab** — threaded comments with avatars, sticky composer
- **Subtasks:** add, toggle complete, progress indicator
- Copy shareable ticket URL
- Sticky footer: Save / Delete (with confirmation)

### 6.11 Server Actions (No UI Yet)

The following task operations exist at the server layer but are not exposed in the UI:

- Export project

## 7. Monitoring (`/monitoring`)

Requires `monitoring:view`. Device configuration requires `monitoring:configure`.

### 7.1 Overview

- Summary stats: total, up, down, unknown device counts
- Device cards with:
  - Status badge and animated down indicator
  - Latency sparkline (recent checks)
  - Last latency and last check time
  - Edit and open-details actions

### 7.2 Device Management

Requires `monitoring:configure`.

- Create monitor device (single-device dialog)
- **Discover devices** dialog with two workflows:
  - **Bookmark URLs** — enabled bookmark URLs not yet monitored; multi-select; bulk create
  - **Network scan** — user-defined CIDR or IP range (max 254 hosts); TCP probe on common ports; review discovered hosts; bulk add with **ping** check type and plain IP targets (no URL/port); skips already-monitored targets
- Edit monitor device
- Delete monitor device
- Device fields:
  - Name
  - Target (URL or host)
  - Check type: ping, TCP, HTTP
  - Interval (seconds)
  - Timeout (milliseconds)
  - Enabled toggle

### 7.3 Background Checks

- Scheduled checks via `monitor-worker` service
- Store check history: status, latency, error message, timestamp

## 8. Device Detail (`/monitoring/[id]`)

Requires `monitoring:view`.

- Device name, target, current status
- **Back to monitoring** link at top of page
- **Edit device** — same dialog as overview (requires `monitoring:configure`): name, target, check type, interval, timeout, enabled, delete
- **Force check now** — queue immediate check and refresh page
- **Latency trend chart** — selectable ranges: 1h, 24h, 7d
- **Recent checks table** — timestamp, status, latency, error (up to 100 rows)

## 9. Profile Settings (`/settings`)

All authenticated users.

- View email (read-only)
- Update display name
- Change password (requires current password; minimum 8 characters)

Admin system settings remain under `/admin?tab=settings`.

## 10. Administration (`/admin`)

Requires `admin:access`. Tab selection via query param: `?tab=users|settings|ai-history|audit`.

### 10.1 User Management

- List all users: name, email, role, access mode, status
- Create user: email, name, password, role, optional custom permissions
- Edit user: update details, optional password reset, disable account
- Roles: admin, editor, user, viewer
- Custom permission overrides per user

### 10.2 System Settings

- **AI model** — select preset Grok model or enter custom model ID
- **Portal header subtitle** — text and enable/disable toggle
- **Email test** — send a test message via SMTP2go to verify configuration (shows configured/not configured status)

### 10.3 Audit Logs

- View audit log entries (paginated, default 100)
- Filter by search text, user email, action type
- Refresh log list
- Export filtered logs as JSON
- **AI analysis** — ask Grok to summarize activity, flag anomalies, suggest follow-ups

### 10.4 AI History

Requires `admin:access`. Tab: **AI History** (`?tab=ai-history`).

- Search across **all users'** persisted AI chat data
- Search fields: conversation titles, message content (user and assistant), user names/emails
- Filters: user, project, date range
- Results show conversation title, project, owner, role badge, matched snippet, timestamp
- **View conversation** opens read-only dialog with full message thread
- Export search results as **JSON** or **CSV**

## 11. Bookmark Health Monitoring Integration

Requires `monitoring:configure` to enable; `monitoring:view` to display status.

- Link bookmark cards to monitor devices
- Display health pill on cards (up, down, unknown, degraded)
- Sort and filter bookmarks by health status
- Bulk enable health monitoring on selected cards
- Health status change notifications (via notification system)
- Background health checks via `monitor-worker`

## 12. API Endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `/api/auth/[...nextauth]` | * | Auth.js session handling | Public (auth routes) |
| `/api/health` | GET | Application health check | Public |
| `/api/ai/chat` | POST | Streaming Grok chat | Authenticated + `ai:use` |
| `/api/ai/audit-analyze` | POST | Grok audit log analysis | Authenticated + `ai:use` |
| `/api/uploads` | POST | File upload (icons, avatars) | Authenticated |
| `/uploads/[...path]` | GET | Serve uploaded files | Authenticated (via app) |

## 13. Data & Persistence

### 13.1 User Preferences

- Active bookmark tab
- Bookmarks layout mode (grid/list)
- Bookmarks global layout lock
- Bookmarks sort mode
- Home favourites order
- Active AI project and conversation (`/chat`)
- Chat sidebar collapsed state (`/chat`)
- App sidebar collapsed state (global nav)
- Notes workspace state (`/notes`)

### 13.2 Notes Persistence

- Per-user notes in `user_notes`
- Workspace UI state in `user_preferences.notes_workspace`

### 13.3 AI Chat Persistence

- Per-user projects, conversations, messages, project files, conversation files, and per-conversation enabled skills (see §4.7)
- Attachments stored as jsonb on messages; knowledge-base files in dedicated tables
- Skill execution metadata stored on assistant messages

### 13.4 Audit Trail

- Log user actions across the application
- Filterable and exportable from admin panel

### 13.5 Notifications

- In-app notifications with title, body, optional link
- Read/unread state per user

## 14. Non-Functional Requirements

### 14.1 Deployment

- Docker Compose: app, PostgreSQL, monitor-worker
- Default host port: 8374 (internal/LAN access only)
- Environment: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_TRUST_HOST`, `XAI_API_KEY`, `OPENAI_API_KEY`, `SMTP2GO_*` (all optional except core auth/DB), seed admin vars

#### 14.1.1 Public access via Cloudflare Tunnel

When users reach Nexus at a public domain (e.g. `https://nexus.example.com`):

| Variable | Value |
|----------|-------|
| `AUTH_URL` | `https://nexus.example.com` |
| `NEXT_PUBLIC_APP_URL` | `https://nexus.example.com` |
| `AUTH_TRUST_HOST` | `true` |

- Do not set `AUTH_URL` to an internal IP or `:8374` address when the tunnel serves the public domain
- Redirects and auth callbacks use forwarded headers (`X-Forwarded-Host`, `X-Forwarded-Proto`) via `src/lib/url.ts`
- UI navigation uses relative paths wherever possible

### 14.2 Security

- Session-based authentication with signed JWT
- Role and permission checks on server actions
- Route-level authorization in middleware
- Password minimum length: 8 characters
- Uploaded files served from dedicated upload directory

### 14.3 UX

- Responsive layout (sidebar on desktop, compact header + mobile nav drawer)
- Loading skeletons and empty states
- Toast notifications for success and error feedback
- Optimistic UI updates with rollback on failure (bookmarks)
- Page transitions via Framer Motion
- Grok-like AI chat with markdown, streaming, and message actions (home drawer + `/chat` workspace)

## 15. Meeting Assistant (`/meetings`)

Requires `ai:use`. Transcription requires `OPENAI_API_KEY`; summarization requires `XAI_API_KEY`.

### 15.1 Core workflow

- Create meeting with **title**, **date/time** (defaults to now), and optional **project** link
- **Create a new Tasks project** inline from the meeting form when the user has `tasks:edit`
- **Record** in browser (MediaRecorder) or **upload** audio file
- States: `recording` → `processing` → `ready` (or `failed`)
- Background processing: Whisper transcription → Grok summary + action item extraction

### 15.2 Meeting detail

- Edit title, date/time, and project from the detail view
- Tabs: Summary (markdown), Transcript, Action items, Ask AI
- Audio playback from uploaded recording
- Scoped Q&A chat persisted in `meeting_messages`
- **Archive** active meetings (soft delete via `archived_at`)

### 15.3 Action items → Tasks

- Extracted action items stored in `meeting_action_items`
- Convert to Tasks ticket in selected project (defaults to To Do column)
- Tracks `convertedTaskId` to prevent duplicate conversion

### 15.4 List & search

- Active meetings sorted by `meeting_at` descending (archived meetings excluded)
- Search title, transcript, summary; filter by project
- Labels stored as jsonb array on meeting record

### 15.5 Archive & delete

- Route `/meetings/archived` lists archived meetings with search and project filter
- **Permanent delete** only from archived list or archived meeting detail (with confirmation)
- Hard delete removes meeting record and related action items/messages

## 16. Out of Scope / Known Gaps

- Project export UI (server action exists, no front-end)
- Bookmark share UI for individual groups/cards (server supports tab/group/card resource types)
- Message list virtualization for very long `/chat` conversations (may be added later)
