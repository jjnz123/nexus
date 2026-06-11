# Nexus — Requirements

Internal operations portal for bookmarks, kanban tasks, network monitoring, and AI assistance.

**Current release:** v4.7.0

## 1. Overview

| Item | Detail |
|------|--------|
| Product name | Nexus |
| Stack | Next.js 15 (App Router), Server Actions, Auth.js v5, PostgreSQL, Drizzle ORM |
| AI provider | xAI Grok (optional; `XAI_API_KEY`); OpenAI Whisper + RAG embeddings (optional; `OPENAI_API_KEY`) |
| Vector search | pgvector (PostgreSQL extension; `pgvector/pgvector:pg16` image) |
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

Admins can override role defaults per user (view and edit per module):

- AI assistant (`ai:use`)
- Notes view / edit (`notes:view`, `notes:edit`)
- Meetings view / edit (`meetings:view`, `meetings:edit`)
- Bookmarks view / edit (`bookmarks:view`, `bookmarks:edit`)
- Tasks view / edit (`tasks:view`, `tasks:edit`)
- Monitoring view / configure (`monitoring:view`, `monitoring:configure`)

**New users** default to **locked-down custom permissions** (no module access) until an admin grants access.

**Project sharing:** admins assign per-user **view** or **edit** membership on specific kanban projects via `project_members`. Users only see projects they belong to (admins see all). Shared project data (notes, AI chat, meetings, tasks) is accessible only when the user also has the corresponding module permission.

Admin-only permissions (not overridable via custom flags):

- User management (`users:manage`)
- Admin panel access (`admin:access`)

### 2.4 Route Access Control

| Route prefix | Required permission |
|--------------|---------------------|
| `/chat` | `ai:use` |
| `/meetings` | `meetings:view` |
| `/meetings/archived` | `meetings:view` |
| `/admin` | `admin:access` |
| `/bookmarks` | `bookmarks:view` |
| `/tasks` | `tasks:view` |
| `/monitoring` | `monitoring:view` |
| `/settings` | All authenticated users |
| `/notes` | `notes:view` |
| `/` | All authenticated users |

## 3. Global Application Shell

Available on all authenticated app routes.

### 3.1 Navigation

- Sidebar: Home, **Notes**, **AI Chat**, Bookmarks, Tasks, Monitoring
- Nav items hidden when the user lacks the required permission
- Active route highlighting
- **Collapsible sidebar** — fixed icon column; labels collapse/expand with CSS transitions (icons do not shift). Icon-only mode with hover expand (same behaviour as `/chat` sidebar)
- Manual collapse/expand toggle (always visible; `PanelLeftOpen` when collapsed, `PanelLeftClose` when expanded); state persisted in user preferences (`app_sidebar_collapsed`)
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
- **Edit dashboard** mode — show/hide widgets, minimise sections (collapsed header only), persisted in `user_preferences.home_dashboard`
- Configurable widget order: Search & AI, Operations, Smart suggestions, Favourites, Board links
- **Board link cards** — user-added shortcuts to project kanban boards (`/tasks` with `activeKanbanProjectId` set); add/remove in edit mode

### 4.1.1 App sidebar

- Collapsible main navigation rail (56px collapsed / 256px expanded); state in `user_preferences.app_sidebar_collapsed`
- Collapse/expand toggle always visible in the icon column; icon reflects the **next action** (`PanelLeftOpen` when collapsed, `PanelLeftClose` when expanded); module branding icon + title shown in the header label area when expanded

### 4.2 Search & AI Entry

Requires `ai:use` permission.

- Unified search input with **project context selector** (default **General**)
- Live bookmark filtering as user types (title, description, group, tab)
- Display up to 6 bookmark matches with launch action
- Submit creates a persisted **AI Chat** conversation in the selected project and redirects to `/chat` with the prompt (General conversations follow General RAG rules — see §4.7)
- `ai:` prefix skips bookmark filtering and sends prompt to AI

### 4.2.1 BETA / detailed errors

When `BETA_MODE=true` or `SHOW_DETAILED_ERRORS=true` (server) and matching `NEXT_PUBLIC_*` vars (client), error boundaries and toasts may show detailed messages and stack traces instead of generic failures.

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

- **Left** — Collapsible projects and conversations sidebar (icon-only mode with hover expand); **project files** icon on each project row; **conversation files** icon on each conversation row; project badge on conversation items
- **Center** — Main chat area with header (conversation title, Skills), active skill chips above composer
- **Right** — Vertical history indicator bar (one marker per user/assistant message)

### Collapsible Sidebar

- Manual collapse/expand toggle (always visible; icon reflects next action); state persisted in user preferences (`chat_sidebar_collapsed`)
- Fixed **56px icon column** — icons stay aligned when collapsing; only labels animate out
- Hover over collapsed sidebar smoothly expands full labels and lists (no DOM swap / flicker)
- **General** conversations: RAG scopes locked to conversation files only (no notes/meetings/tasks/cross-project search)

### Projects & Conversations

- Conversations belong to a shared kanban **Project** (from `projects`, same as Tasks and Notes) or **General** when no project is selected
- Project list filtered by **project membership** (`project_members`); admins see all projects
- **General** pseudo-project for conversations without a project
- Create, rename, delete, and **search** conversations within the active project
- Last message preview and relative timestamp on each conversation
- Active project and conversation persisted in user preferences

### Chat Interface

- Streaming Grok responses via `/api/ai/chat` with messages persisted to PostgreSQL
- User vs assistant bubbles with markdown (assistant), copy, **edit last user message** (reloads composer and truncates from that point), regenerate (latest assistant reply), and **fork** (branch from any past assistant reply into a new tab)
- **Composer keyboard:** Enter = new line; Shift+Enter = send
- **Conversation tabs** — forked branches share a tab group above the chat (Main + forks); switch tabs to continue alternate paths; close fork tabs individually
- **Project-scoped knowledge** — RAG retrieval for notes, meetings, tasks, and project files is limited to the conversation’s kanban project (badge shown in knowledge controls; manual project filter hidden when locked)
- **File transparency** — when RAG retrieves files, the model is instructed to name filenames in its answer; assistant messages show collapsible **Referenced files** and **Sources** panels (hidden by default; expand to view links and categories—no hover excerpt popups)
- **Attachments** — images, PDFs, and text files via `/api/uploads`; thumbnails for images, file cards for documents
- Starter prompt chips on empty conversation
- Stop streaming mid-generation (partial assistant reply saved when content exists)

### File Management

- **Project-level files** — upload, rename, delete files shared across all conversations in a project (knowledge base)
- **Conversation-level files** — upload, rename, delete files scoped to the current conversation only
- **Meetings tab** (project file manager) — browse meeting recordings/transcripts linked to the project (read-only)
- **Tasks tab** (project file manager) — browse ticket attachments for the project (read-only)
- **Green indexed tick** on all file manager rows when content is in the vector database (`rag_index_state.status = indexed`)
- File manager dialog with search, image/document grouping, drag-and-drop upload (project/conversation tabs), previews
- Text file content indexed for **semantic RAG retrieval** in AI responses (see §16)
- **Knowledge search defaults:** Files and Notes on; **Meetings** and **Tasks** off until enabled — enabling either opens a time-range picker (7 days, 30 days, all time, custom)

### AI Skills (Tool Use)

- Grok can invoke Nexus **skills** during `/chat` conversations (permission-aware)
- Built-in skills: **Create Task**, **Update Task**, **Check Monitoring**, **Search Bookmarks**, **Web Search**, **X Search**
- Web Search and X Search use the xAI Responses API (`web_search` / `x_search` tools); require `ai:use`
- **Per-conversation skill toggles** — Skills panel to enable/disable each skill; stored in `enabled_skills` on the conversation (`null` = all permitted skills; `[]` = none)
- Active skills shown as chips above the composer; header **Skills** button opens management dialog
- Skill usage shown as **compact one-line chips** in assistant messages (label, status icon, short metadata); click to expand for structured details (Web/X search show query + source URLs only—not the model-facing summary)
- **Always collapsed by default** during streaming and after the answer; only the final markdown reply is shown at full size
- Skill results persisted in message `metadata` jsonb
- Only enabled skills are sent to the model as tools
- Extensible skill registry in `src/lib/ai/skills/`

### Vertical History Indicator Bar

- Scrollable timeline with a marker for **every** user and assistant message
- Click marker → smooth scroll to that message (Framer Motion highlight)
- Hover marker → preview card (excerpt, sender, timestamp) rendered via portal with fixed positioning so it is not clipped by chat scroll containers
- Distinct colors for user vs Grok markers
- Active message tracked via scroll intersection

### Data Model

- `ai_conversations` — title, link to shared kanban `projects.id`, last message preview/at, `enabled_skills` (jsonb), `tab_group_id` (fork tab group), `fork_from_message_id` (nullable branch point)
- `ai_messages` — role, content, attachments (jsonb), metadata (jsonb: skill events, citations, referenced files), timestamps
- `ai_project_files` — kanban project knowledge base files with text preview cache
- `ai_conversation_files` — conversation-scoped files with text preview cache
- User preferences: `active_ai_project_id`, `active_ai_conversation_id`, `active_kanban_project_id`, `chat_sidebar_collapsed`, `app_sidebar_collapsed`

## 4.8 Notes (`/notes`)

All authenticated users.

### Layout

- Full-bleed workspace within the app shell (similar to `/chat`)
- **Left** — collapsible sidebar with **project list** (General + kanban projects) and filtered note list
- **Top** — tab bar for multiple open notes
- **Center** — title, project selector (move note), language/mode selector, editor textarea
- **Bottom** — optional Markdown preview pane (toggleable; **Run** opens preview for Markdown)

### Features

- Create, rename (inline title), delete, and **move notes between projects**
- Filter notes by selected project (General = no project)
- **Syntax modes:** Plain Text, Markdown, Shell Script, JavaScript, TypeScript, Python, JSON, YAML, SQL, HTML, CSS
- **Autosave** on edit (debounced server persistence)
- Workspace state persisted per user: active project, open tabs, active tab, preview visibility, explorer collapsed

### Data Model

- `user_notes` — `id`, `user_id`, optional `project_id` (FK → kanban `projects`), `title`, `content`, `language`, `sort_order`, timestamps
- `user_preferences.notes_workspace` (jsonb) — `activeProjectId`, open tab IDs, active tab, preview/explorer UI state

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
- **Last selected project persisted** in `user_preferences.active_kanban_project_id` (restored on reload; deep-linked tickets override)
- Empty state when no projects exist

### 6.2 Layout & Views

- **Collapsible Tasks sidebar** — Board, Issues, Roadmap, Project settings (icon-only + hover expand)
- **View switcher** in the page header — quick toggle between Board, Issues, and Roadmap (alongside sidebar navigation)
- **Kanban board** — non-backlog columns only, single horizontal scroll row (no wrapping); cross-column drag-and-drop from anywhere on the card (no separate drag handle) with optimistic UI, server persistence via `reorderTasks`, and rollback on failure; drops onto **empty columns** persist correctly; **WIP limits block drops** when a column is at capacity (toast warning); drop target falls back to highlighted column when pointer collision is ambiguous; **child tickets hidden from top-level columns** — expand subtask list on parent card via clickable subtask badge; click child to open ticket modal
- **Board type filter** — two layers:
  - **Project default types** — configurable in Project Settings → Board (`projects.settings.boardSettings.visibleTypes`); defaults to Story + Task only on the kanban board
  - **Bug visibility mode** — Project Settings → Board (`projects.settings.boardSettings.bugBoardMode`): `show_bugs` (default filter All), `hide_bugs` (default filter Other tickets), or `all_types` (always show all types regardless of user filter)
  - **User board filter** — segmented control on the Board (All / Other tickets / Bugs only); persisted per user and project in `user_preferences.tasks_workspace.boardFilters[projectId]`
- **Board card fields** — configurable per project: parent ticket, due date, stale indicator (days since last update), child subtask count
- **Backlog modal** — full-screen dialog (top-right button); Jira-like table with search/filter; drag handle to rank; drag row onto board column or use column dropdown; quick-create row
- WIP limit display per column (counts all tickets in column, not just filtered types) with visual warning when exceeded

### 6.3 Task Hierarchy & Ticket Fields

- Ticket types: **Epic**, **Feature**, **Story**, **Task**, **Subtask**, **Bug**
- Optional **parent** link for hierarchy (Epic → Feature → Story/Task/Bug; **Subtask** nests under Story or Task); **configurable hierarchy rules** per project in settings; Bug may be a child of Epic, Feature, Story, or Task (or stand alone); parent dropdown filtered by allowed types; server-side validation prevents cycles and invalid parents
- Extended ticket fields stored on `tasks`:
  - Title, description, **details**, **acceptance criteria**, **definition of done**, **story points**
  - Priority, due date, **start date**, **end date** (roadmap/Gantt), assignee, column/status, type, parent, labels
- **Linked issues** — `task_links` table (relates to, blocks, duplicates); search-and-link UI in ticket modal
- **Attachments & links** — drag-and-drop file upload; **version history** when re-uploading the same filename; external **URL links** (SharePoint, Drive, etc.); separate **Emails** section for dragged `.eml` files with subject/sender/date; upload via `/api/uploads`, stored in `task_attachments` with kind (`file` | `url` | `email`)
- **Child subtasks** — quick-create linked child tickets (`tasks.parent_id`) from the ticket modal Overview tab; manage from parent modal: change status/column, edit title, delete, open child ticket
- **Checklist subtasks** — lightweight checklist rows in `task_subtasks` (toggle complete)
- **Comments** — threaded replies via `parent_id` on `task_comments`

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
- **Add item** dropdown — create Epic, Feature, Story, Task, Subtask, or Bug directly on the roadmap
- **Insert between rows** — hover **Insert below** control between rows to add a sibling in context (Jira Advanced Roadmaps-style)
- **Tree ordering** — children appear directly under their parent (depth-first by `sortOrder` / ticket number), not grouped by type
- Editable table: key, title, type, parent, assignee, priority, due date, **start date**, **end date**, story points, status/column
- **Column visibility** — show/hide columns via toolbar menu; persisted in `projects.settings.roadmapSettings`
- **Saved views** — save and restore column configurations per project
- **Gantt timeline column** — horizontal bars for tickets with start/end dates; drag bar to move schedule; resize handles to extend/compress; optional (no bar when dates unset)
- **Parent picker** — shows `KEY – Title` (e.g. `VC-003 – Implement Authentication`); options filtered by project **hierarchy rules**; allowed parent types shown per row
- Hierarchy visible via indent + collapse/expand on parent rows
- Bulk create, update, and delete committed via `commitRoadmapChanges` server action

### 6.7 Project Settings

Requires `tasks:edit`.

**Tabbed layout:** General · Board · Roadmap · Hierarchy · Fields & Display · **Access** · Workflow (future)

- **General:** project summary, **labels** (create, edit, delete with name and colour)
- **Board:** drag-to-reorder columns, create/edit/delete (name, color, WIP limit); backlog column managed here but hidden from kanban; **board settings** — default visible ticket types on kanban; **bug visibility mode** (`show_bugs`, `hide_bugs`, `all_types`); card field toggles (parent, due date, stale indicator, child subtasks) and stale threshold days (`projects.settings.boardSettings`)
- **Roadmap:** column visibility and saved views stored in `projects.settings.roadmapSettings`
- **Hierarchy:** allowed parent types per child type with clearer matrix, default tree diagram, and impact notes for Board/Roadmap/modal; stored in `projects.settings.hierarchyRules`
- **Fields & Display:** per Epic/Feature/Story/Task/**Subtask**/Bug — drag-to-reorder fields, show/hide toggles; stored in `projects.settings.ticketFields`; controls ticket modal and backlog create form visibility
- **Access:** manage `project_members` for this project — grant view/edit per user (mirrors Admin → Users project access, project-centric view)

### 6.8 Create Ticket

Requires `tasks:edit`.

- **New task** toolbar button opens create-task dialog (board columns only)
- Per-column **+** button pre-selects target column
- **Backlog modal** — table view with search/filter; quick-create; rank via drag handle; move to any board column via dropdown or drag onto column (respects WIP limits)
- Backlog items created in backlog modal; default move target is first non-backlog column when using legacy server action without column id

### 6.9 Task Cards

- Display task key, title, type, priority badge, assignee, labels
- Optional fields per project board settings: parent key, due date, stale badge, **expandable child subtask list** (click badge to expand; click child to open modal)
- Draggable on kanban board from anywhere on the card (cross-column; no grip handle icon)
- Click title/key area to open task detail modal

### 6.10 Ticket Detail Modal

- Deep-linkable via `/tasks/[KEY]` (e.g. `/tasks/OPS-001`)
- **Top-anchored dialog** — fixed height with internal scroll; **wider modal** (`max-w-7xl`); tab changes do not shift modal position
- **Tabbed layout** — Overview, Specification, Links & files, Discussion
- Header: ticket key badge, type/status badges, **parent ticket link** (`Parent: KEY – Title`) when applicable, inline title edit
- Field visibility/order driven by project ticket field settings for the ticket type
- Edit all ticket fields (see §6.3)
- **Links & files tab** — drag-and-drop zone (files + `.eml` emails); external URL links; file attachments with version history, per-version download, **Preview** button, and **green indexed tick** when attachment is indexed in RAG (`rag_index_state.status = indexed`); linked issues panel
- **Overview tab** — two-column issue-tracker layout: **Description** (TipTap rich text: bold, italic, underline, headings, lists, font size, colour; **auto-growing height** — no manual resize), **child subtask management** (add, status, edit, delete, open), and Discussion on the left; **right sidebar** for type, status, assignee, priority, due date, story points, parent (filtered by hierarchy rules), labels, and checklist
- **Specification tab** — details, acceptance criteria, definition of done
- **Discussion tab** — full-height threaded comments (same panel as Overview)
- Copy shareable ticket URL
- Sticky footer: **Save changes**, **Save and close**, and Delete (with confirmation)
- Board refresh after save is client-driven (`getProjectBoard`) — task updates do not call `revalidatePath("/tasks")`, avoiding Server Component re-render errors on deep-linked ticket URLs; hierarchy parent validation runs only when type or parent changes

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
- **Appearance:** select **Dark** or **Light** color theme (stored in `user_preferences.color_theme`, synced via cookie for SSR)

Admin system settings remain under `/admin?tab=settings`.

## 10. Administration (`/admin`)

Requires `admin:access`. Tab selection via query param: `?tab=users|settings|knowledge|ai-history|audit`.

### 10.1 User Management

- List all users: name, email, role, access mode, status
- Create user: email, name, password, role — defaults to **locked-down permissions** (no modules)
- Edit user: update details, optional password reset, disable account, **per-module view/edit toggles**, **project sharing** (view/edit per project via `UserProjectAccessPanel`)
- Roles: admin, editor, user, viewer
- Custom permission overrides per user (when `useCustom` is enabled)

### 10.2 System Settings

- **AI model** — select preset Grok model or enter custom model ID
- **Portal header subtitle** — text and enable/disable toggle
- **Meeting audio recording** — browser recording format (default WebM Opus) and bitrate (default 96 kbps)
- **Email test** — send a test message via SMTP2go to verify configuration (shows configured/not configured status)

- **Meeting audio recording** — browser recording format (default WebM Opus) and bitrate (default 96 kbps)

### 10.3 Knowledge Base (RAG)

Tab: **Knowledge** (`?tab=knowledge`).

- Overview stats: indexed/failed sources, total chunks, retrieval success rate (30 days)
- **Tabs:** Analytics, Chunks, Test search, Sources
- Source breakdown by type; top retrieved sources (7 and 30 days)
- Retrieval pipeline stats (runs, avg duration, avg chunks used); low-relevance query log
- **Chunk browser** — search indexed chunks by content/title/type; view metadata and last indexed time; delete individual chunks
- **Test search** — admin hybrid search with timing breakdown, vector/keyword/fused scores, fusion rank, and which chunks entered context
- **Sources** — failed source list with errors; recent index status; per-source reindex; **Backfill all** with per-stage progress (notes, meetings, tasks, files)

### 10.4 Audit Logs

- View audit log entries (paginated, default 100)
- Filter by search text, user email, action type
- Refresh log list
- Export filtered logs as JSON
- **AI analysis** — ask Grok to summarize activity, flag anomalies, suggest follow-ups

### 10.5 AI History

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
- Active kanban/tasks project (`/tasks`)
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
- **Select audio input device** before recording (choice persisted in localStorage; **System default** uses macOS input setting e.g. Loopback Audio). `getUserMedia` is called **only** when the user clicks Start recording — never on app load or section navigation
- **Record** in browser (MediaRecorder via global `RecordingProvider` at app-shell level; survives SPA navigation). Active recordings continue when visiting Notes, AI Chat, Tasks, etc. Header recording indicator remains visible with live dB meters
- **Header recording indicator** — always visible next to notifications (grey when idle with link to last meeting; red with live meters when recording)
- States: `recording` → `processing` → `ready` (or `failed`)
- Background processing: Whisper transcription → Grok summary + action item extraction
- Processing view shows spinner and **auto-refreshes** when transcription completes

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

## 16. RAG — Retrieval-Augmented Generation

Full RAG pipeline across AI Chat files, Notes, Meetings, and Tasks (Phases 1–4 complete).

### Architecture

- **Vector store:** PostgreSQL + pgvector (`rag_chunks`, HNSW cosine index) + PostgreSQL FTS (`search_vector` tsvector, GIN index)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dimensions) via `OPENAI_API_KEY`
- **Abstraction:** `src/lib/rag/` — chunking, embeddings, hybrid fusion, query rewriting, store, indexer, retriever, backfill
- **Permission model:**
  - **User-scoped:** notes, meetings, AI chat files (`user_id` + ownership checks)
  - **Org-scoped:** tasks (`scope = org`; requires `tasks:view` for retrieval)
  - **Admin mode:** cross-user search in Admin → Knowledge test search

### Indexed sources

| Source type | Content | Index triggers |
|-------------|---------|----------------|
| `ai_project_file` / `ai_conversation_file` | Uploaded text files | Upload, delete |
| `user_note` | Title + content | Create, update, delete |
| `meeting_transcript` / `meeting_summary` / `meeting_action_item` | Transcript, summary, action items | After processing, archive metadata update, delete |
| `task` | Title, description, details, AC, DoD, subtasks, comments | Create, update, delete, comments, subtasks |
| `task_attachment` | Ticket file/email attachment text (including **PDF** via `pdf-parse`) | Upload, delete; auto-reindex on prior failed status |

### File referencing in AI Chat

- Retrieved file chunks carry metadata: `filename`, `mimeType`, `sourceCategory` (`project_file`, `conversation_file`, `ticket_attachment`), optional `pageLabel`
- Context block lists retrieved filenames and instructs the model to name them when used
- Assistant message metadata stores deduplicated `referencedFiles[]` alongside `citations[]`
- UI: **Referenced files** panel (collapsed by default) + **Sources** list (collapsed by default; category badges; no hover excerpt popups)

### Ingestion

- Semantic chunking (markdown headings / paragraph overlap)
- Content-hash incremental indexing via `rag_index_state`
- Lazy backfill on chat query; admin **Backfill all** for existing data

### Retrieval

- **Hybrid search:** vector similarity + PostgreSQL full-text search, fused with reciprocal rank fusion (RRF)
- **Query rewriting:** Grok expands user queries before embedding (improved entity-preserving prompt when `XAI_API_KEY` set)
- **Re-ranking:** fused score ordering before context budget trim
- **Scoped search in `/chat`:** persistent Files / Notes / Meetings / Tasks toggles above composer (saved in browser localStorage). **Default:** Files and Notes on; Meetings and Tasks **off**. Enabling Meetings or Tasks opens a time-range dialog (7 days, 30 days, all time, custom). When a conversation belongs to a project, retrieval is limited to that project. **General** conversations: conversation files only.
- **Metadata filters in `/chat`:** meeting date range (set via scope toggle dialog or filters panel), meeting label, note language — applied at retrieval. Task date range filters apply when Tasks scope is enabled (`taskDateFrom` / `taskDateTo` on chunk metadata)
- **Meeting Q&A:** uses RAG retrieval for long meetings instead of full transcript injection
- Context budget ~12KB; citations with deep links and source category; deduplicated **Referenced files** list persisted on assistant messages; retrieval logged to `rag_retrieval_logs` and `rag_retrieval_runs` (timings, scores, used-in-context flag)

### Admin

- Tab `/admin?tab=knowledge` — chunk browser, index health, 7/30-day analytics, pipeline debug test search, reindex, staged backfill

### Infrastructure

- Docker Postgres image: `pgvector/pgvector:pg16`
- Migrations: `0015_rag_pgvector.sql`, `0016_rag_phases_2_4.sql`, `0017_rag_observability.sql`, `0018_color_theme.sql`, `0024_ai_conversation_tabs.sql`, `0025_user_access_and_project_members.sql`

## 17. Out of Scope / Known Gaps

- Project export UI (server action exists, no front-end)
- Bookmark share UI for individual groups/cards (server supports tab/group/card resource types)
- Message list virtualization for very long `/chat` conversations (may be added later)
