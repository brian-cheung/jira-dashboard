# JIRA Task Dashboard — Design Spec

**Date:** 2026-06-08
**Status:** Approved

## Overview

A self-hosted web dashboard that displays all JIRA tasks where the user is Assignee, Reporter, or Tester. Shows parent-child hierarchy and a Gantt timeline. Syncs with JIRA every 15 minutes and supports bidirectional editing (status, comments, descriptions, attachments) with real-time push to the frontend.

## JIRA Connection

- **Instance:** `executivecentre.atlassian.net` (JIRA Cloud)
- **Auth:** API token + email via HTTP Basic Auth
- **API:** JIRA REST API v3
- **Hierarchy:** Epic → Story → Task/Subtask

## Architecture

```
Browser (React SPA)
  ├── Gantt Timeline view (Frappe Gantt)
  ├── Hierarchy Tree view
  └── Task detail drawer (inline editing)
        │
        │ REST + WebSocket (socket.io)
        ▼
Express Server (Node.js)
  ├── JIRA API proxy (hides token)
  ├── SQLite cache (better-sqlite3)
  ├── Sync scheduler (node-cron, 15-min)
  └── WebSocket server (socket.io)
        │
        │ HTTPS + Basic Auth
        ▼
JIRA Cloud REST API v3
```

## Backend

### Modules

1. **JIRA Client** (`src/jira-client.js`): Wraps `node-fetch` for JIRA REST API v3 calls. Basic Auth (email + API token). Handles pagination and rate limiting (`Retry-After` headers).

2. **SQLite Cache** (`src/cache.js`): Tables:
   - `issues` — id, key, summary, status, assignee, reporter, tester, epic_key, parent_key, start_date, due_date, description, fix_versions, requested_by, sprint, raw_json
   - `comments` — id, issue_key, author, body, created_at
   - `sync_log` — last_sync timestamp, cursor

3. **Sync Scheduler** (`src/sync.js`): Full sync on startup. Incremental sync every 15 minutes using `updated >= last_sync` JQL. Emits delta via WebSocket.

4. **REST Endpoints:**

   | Method | Path | Purpose |
   |--------|------|---------|
   | GET | `/api/issues` | All cached issues filtered by current user |
   | GET | `/api/issues/:key` | Single issue with comments |
   | PUT | `/api/issues/:key` | Update summary, description, status transition |
   | POST | `/api/issues/:key/comments` | Add comment |
   | POST | `/api/issues/:key/attachments` | Upload attachment (multipart) |
   | POST | `/api/sync` | Trigger immediate sync |
   | GET | `/api/sync/status` | Last sync time, next sync countdown |

### Configuration

- JIRA email and API token stored in `.env` (never sent to browser)
- User identity (who "me" is) derived from the authenticated JIRA session
- Port: `3001` default, configurable via `PORT` env var

## Frontend

### Layout

Split-panel: left 30% hierarchy tree, right 70% Gantt chart. Detail drawer slides in from right on task click.

### Components

1. **Hierarchy Tree:** Expandable tree (Epic → Story → Task). Each node: key, truncated summary, colored status badge. Right-click or chevron for inline status transitions. Filter bar for Assignee/Reporter/Tester toggles + text search.

2. **Gantt Chart:** Frappe Gantt library. Bars color-coded by status. Epics as group headers with darker bars. Click opens detail. Drag reschedules dates (pushes to JIRA). Today marker line. Time scale: day/week/month.

3. **Detail Drawer:** Slide-out from right. Full description (JIRA markdown rendered), comment thread, attachment list + upload, status transition dropdown, save/cancel. Changes sync to JIRA immediately.

### Tech Stack

- React 18 with Vite
- Frappe Gantt (MIT license, dependency + drag-to-reschedule support)
- socket.io-client for WebSocket
- CSS Modules or Tailwind for styling

## Data Flow

### Read path
1. Browser requests `GET /api/issues` → Express returns from SQLite cache
2. Every 15 minutes: Express syncs with JIRA, stores delta in SQLite, emits `sync:updated` via WebSocket
3. Frontend receives delta event, re-fetches only changed issue keys

### Write path
1. User edits an issue/comment/attachment in the frontend
2. Browser sends PUT/POST to Express
3. Express immediately proxies the request to JIRA REST API
4. On success, Express updates SQLite cache and broadcasts the change via WebSocket
5. Frontend confirms the update visually

## Error Handling

- JIRA API errors (4xx/5xx) surfaced to frontend as structured JSON
- Network errors show a toast notification, do not block UI
- Sync failures logged to console, retried on next interval
- Rate limit responses: back off per `Retry-After` header

## Dependencies

### Server
- express, better-sqlite3, node-fetch, node-cron, socket.io, multer (attachments), dotenv

### Client
- react, react-dom, frappe-gantt, socket.io-client, vite

## Display Fields

- **Assignee** — standard JIRA field, displayed as avatar + name in the hierarchy tree and detail drawer
- **Reporter** — standard JIRA field, displayed in the detail drawer
- **Tester** — likely a custom field in this JIRA instance, auto-discovered via field metadata API. Displayed in the detail drawer
- **Fix versions** — JIRA standard field `fixVersions`, displayed as comma-separated version names in the detail drawer and optionally as a tag in the hierarchy tree
- **Sprint** — JIRA agile field, displays the current sprint name (if assigned to an active sprint) in the detail drawer and as a tag in the hierarchy
- **Requested by** — likely a custom field in this JIRA instance, auto-discovered via field metadata API. Displayed in the detail drawer

## Out of Scope

- Multi-user support (single user only)
- Authentication/login page (API token in `.env` only)
- Deployment/packaging (local dev first, deployment decided later)
- JIRA custom fields beyond standard ones
- Offline mode
