# JIRA Task Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted React+Express dashboard that syncs JIRA tasks (where user is Assignee/Reporter/Tester) every 15 minutes and displays them in a hierarchy tree + Gantt chart with bidirectional editing.

**Architecture:** Express server proxies JIRA REST API v3, caches issues/comments in SQLite, syncs on 15-min cron, and pushes deltas via WebSocket. React SPA (Vite) renders a split-panel layout: left hierarchy tree, right Gantt chart (Frappe Gantt), detail drawer for editing.

**Tech Stack:** Node.js, Express, better-sqlite3, node-cron, socket.io, React 18, Vite, Frappe Gantt, CSS (plain CSS files, no framework).

---

## File Structure

```
jira-dashboard/
├── .env.example
├── .gitignore
├── package.json                    (root — concurrently runs server+client)
├── server/
│   ├── package.json
│   ├── index.js                    (Express + socket.io setup, wires modules)
│   ├── jira-client.js              (JIRA REST API v3 wrapper)
│   ├── cache.js                    (SQLite — issues, comments, sync_log tables)
│   ├── sync.js                     (full + incremental sync logic)
│   └── routes.js                   (all /api/* route handlers)
├── client/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx                (React entry)
│       ├── App.jsx                 (top-level layout, state management)
│       ├── App.css                 (layout styles)
│       ├── api.js                  (fetch wrapper for all /api calls)
│       ├── socket.js               (socket.io-client singleton)
│       └── components/
│           ├── HierarchyTree.jsx   (expandable Epic→Story→Task tree)
│           ├── HierarchyTree.css
│           ├── GanttChart.jsx      (Frappe Gantt wrapper)
│           ├── GanttChart.css
│           ├── DetailDrawer.jsx    (slide-out detail panel)
│           ├── DetailDrawer.css
│           ├── FilterBar.jsx       (search + Assignee/Reporter/Tester toggles)
│           ├── FilterBar.css
│           ├── StatusBadge.jsx     (colored status pill)
│           ├── Toast.jsx           (notification toasts)
│           └── Toast.css
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `jira-dashboard/package.json`
- Create: `jira-dashboard/.gitignore`
- Create: `jira-dashboard/.env.example`
- Create: `jira-dashboard/server/package.json`
- Create: `jira-dashboard/client/package.json`
- Create: `jira-dashboard/client/index.html`
- Create: `jira-dashboard/client/vite.config.js`

- [ ] **Step 1: Create root package.json**

`jira-dashboard/package.json`:
```json
{
  "name": "jira-dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "cd server && node index.js",
    "client": "cd client && npx vite --port 5173"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Install root dependencies**

Run: `cd /Users/briancheung/jira-dashboard && npm install`
Expected: `concurrently` installed, `node_modules` and `package-lock.json` created.

- [ ] **Step 3: Create server/package.json**

`jira-dashboard/server/package.json`:
```json
{
  "name": "jira-dashboard-server",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^11.6.0",
    "node-fetch": "^2.7.0",
    "node-cron": "^3.0.3",
    "socket.io": "^4.7.5",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5"
  }
}
```

- [ ] **Step 4: Install server dependencies**

Run: `cd /Users/briancheung/jira-dashboard/server && npm install`
Expected: All server dependencies installed.

- [ ] **Step 5: Create client/package.json**

`jira-dashboard/client/package.json`:
```json
{
  "name": "jira-dashboard-client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "frappe-gantt": "^0.6.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2"
  }
}
```

- [ ] **Step 6: Install client dependencies**

Run: `cd /Users/briancheung/jira-dashboard/client && npm install`
Expected: All client dependencies installed.

- [ ] **Step 7: Create client/index.html**

`jira-dashboard/client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JIRA Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 8: Create client/vite.config.js**

`jira-dashboard/client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
```

- [ ] **Step 9: Create .env.example**

`jira-dashboard/.env.example`:
```
JIRA_URL=https://executivecentre.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
PORT=3001
```

- [ ] **Step 10: Create .gitignore**

`jira-dashboard/.gitignore`:
```
node_modules/
.env
*.db
dist/
```

- [ ] **Step 11: Create .env**

Run: `cp /Users/briancheung/jira-dashboard/.env.example /Users/briancheung/jira-dashboard/.env`
Expected: `.env` file created. (User will fill in their email and API token.)

- [ ] **Step 12: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git init && git add -A && git commit -m "feat: scaffold JIRA dashboard project"
```

---

### Task 2: Server entry point

**Files:**
- Create: `jira-dashboard/server/index.js`

- [ ] **Step 1: Create server/index.js**

`jira-dashboard/server/index.js`:
```js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initCache } = require('./cache');
const { startSync, getSyncStatus } = require('./sync');
const routes = require('./routes');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Make io available to route handlers
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

initCache();
startSync(io);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

This file wires Express, socket.io, initializes the SQLite cache, starts the sync scheduler, and mounts all routes under `/api`.

- [ ] **Step 2: Verify server starts (will fail on missing modules - expected)**

Run: `cd /Users/briancheung/jira-dashboard/server && node index.js`
Expected: Error about missing `./cache` or `./sync` module. This confirms the wiring is correct; we'll create those modules next.

- [ ] **Step 3: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add server/index.js && git commit -m "feat: add Express server entry point with socket.io"
```

---

### Task 3: JIRA client module

**Files:**
- Create: `jira-dashboard/server/jira-client.js`

- [ ] **Step 1: Create server/jira-client.js**

`jira-dashboard/server/jira-client.js`:
```js
const fetch = require('node-fetch');

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

async function jiraFetch(path, options = {}) {
  const url = `${JIRA_URL}/rest/api/3/${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
    console.log(`Rate limited. Waiting ${retryAfter}s...`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return jiraFetch(path, options);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JIRA API ${res.status}: ${body}`);
  }

  return res.json();
}

async function getCurrentUser() {
  return jiraFetch('myself');
}

async function getCustomFields() {
  const fields = await jiraFetch('field');
  return fields.filter(f => f.custom);
}

async function searchIssues(jql, fields = '*all', startAt = 0, maxResults = 100) {
  const res = await jiraFetch('search', {
    method: 'POST',
    body: JSON.stringify({ jql, fields, startAt, maxResults, expand: ['renderedFields'] })
  });
  return res;
}

async function searchIssuesAll(jql) {
  let allIssues = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const res = await searchIssues(jql, '*all', startAt, maxResults);
    allIssues = allIssues.concat(res.issues);
    if (startAt + maxResults >= res.total) break;
    startAt += maxResults;
  }

  return allIssues;
}

async function getIssue(key) {
  return jiraFetch(`issue/${key}?expand=renderedFields`);
}

async function updateIssue(key, fields) {
  return jiraFetch(`issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ fields })
  });
}

async function doTransition(key, transitionId) {
  return jiraFetch(`issue/${key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transitionId } })
  });
}

async function getTransitions(key) {
  const res = await jiraFetch(`issue/${key}/transitions`);
  return res.transitions;
}

async function addComment(key, body) {
  return jiraFetch(`issue/${key}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

async function getComments(key) {
  const res = await jiraFetch(`issue/${key}/comment`);
  return res.comments;
}

async function addAttachment(key, fileBuffer, filename) {
  const boundary = `----FormBoundary${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  ]);

  return jiraFetch(`issue/${key}/attachments`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'X-Atlassian-Token': 'no-check'
    },
    body
  });
}

module.exports = {
  getCurrentUser,
  getCustomFields,
  searchIssues,
  searchIssuesAll,
  getIssue,
  updateIssue,
  doTransition,
  getTransitions,
  addComment,
  getComments,
  addAttachment
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add server/jira-client.js && git commit -m "feat: add JIRA REST API v3 client module"
```

---

### Task 4: SQLite cache module

**Files:**
- Create: `jira-dashboard/server/cache.js`

- [ ] **Step 1: Create server/cache.js**

`jira-dashboard/server/cache.js`:
```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'jira-cache.db');

let db;

function initCache() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      summary TEXT,
      status TEXT,
      status_category TEXT,
      assignee_name TEXT,
      assignee_avatar TEXT,
      reporter_name TEXT,
      tester_name TEXT,
      epic_key TEXT,
      parent_key TEXT,
      issue_type TEXT,
      start_date TEXT,
      due_date TEXT,
      description TEXT,
      fix_versions TEXT,
      requested_by TEXT,
      sprint TEXT,
      priority TEXT,
      updated TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      issue_key TEXT NOT NULL,
      author TEXT,
      body TEXT,
      created TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync TEXT,
      custom_field_tester TEXT,
      custom_field_requested_by TEXT
    );
  `);

  // Ensure the singleton row exists
  db.exec(`
    INSERT OR IGNORE INTO sync_log (id, last_sync) VALUES (1, NULL);
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Cache not initialized. Call initCache() first.');
  return db;
}

function upsertIssue(issue, customFieldTester, customFieldRequestedBy) {
  const db = getDb();
  const fields = issue.fields || {};

  const epicKey = fields.epic ? fields.epic.key : null;
  const parentKey = fields.parent ? fields.parent.key : null;
  const fixVersions = (fields.fixVersions || []).map(v => v.name).join(', ');
  const sprint = fields.sprint ? fields.sprint.name : null;
  const testerName = customFieldTester ? (fields[customFieldTester] ? fields[customFieldTester].displayName || fields[customFieldTester].name || fields[customFieldTester] : null) : null;
  const requestedBy = customFieldRequestedBy ? (fields[customFieldRequestedBy] ? fields[customFieldRequestedBy].displayName || fields[customFieldRequestedBy].name || fields[customFieldRequestedBy] : null) : null;

  const assignee = fields.assignee || {};
  const reporter = fields.reporter || {};

  db.prepare(`
    INSERT OR REPLACE INTO issues
      (id, key, summary, status, status_category, assignee_name, assignee_avatar,
       reporter_name, tester_name, epic_key, parent_key, issue_type,
       start_date, due_date, description, fix_versions, requested_by, sprint, priority, updated, raw_json)
    VALUES
      (@id, @key, @summary, @status, @statusCategory, @assigneeName, @assigneeAvatar,
       @reporterName, @testerName, @epicKey, @parentKey, @issueType,
       @startDate, @dueDate, @description, @fixVersions, @requestedBy, @sprint, @priority, @updated, @rawJson)
  `).run({
    id: issue.id,
    key: issue.key,
    summary: fields.summary || '',
    status: fields.status ? fields.status.name : '',
    statusCategory: fields.status ? fields.status.statusCategory.name : '',
    assigneeName: assignee.displayName || '',
    assigneeAvatar: assignee.avatarUrls ? (assignee.avatarUrls['24x24'] || '') : '',
    reporterName: reporter.displayName || '',
    testerName: testerName || '',
    epicKey,
    parentKey,
    issueType: fields.issuetype ? fields.issuetype.name : '',
    startDate: fields.customfield_10015 || null, // common start date field; will be mapped per instance
    dueDate: fields.duedate || null,
    description: fields.renderedFields ? (fields.renderedFields.description || fields.description || '') : (fields.description || ''),
    fixVersions,
    requestedBy: requestedBy || '',
    sprint,
    priority: fields.priority ? fields.priority.name : '',
    updated: fields.updated || null,
    rawJson: JSON.stringify(issue)
  });
}

function upsertComment(issueKey, comment) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO comments (id, issue_key, author, body, created)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    comment.id,
    issueKey,
    comment.author ? comment.author.displayName : '',
    comment.body || '',
    comment.created || ''
  );
}

function getAllIssues() {
  const db = getDb();
  return db.prepare('SELECT * FROM issues ORDER BY epic_key NULLS FIRST, parent_key NULLS FIRST, key').all();
}

function getIssueByKey(key) {
  const db = getDb();
  const issue = db.prepare('SELECT * FROM issues WHERE key = ?').get(key);
  if (!issue) return null;
  const comments = db.prepare('SELECT * FROM comments WHERE issue_key = ? ORDER BY created').all(key);
  return { ...issue, comments };
}

function getSyncLog() {
  const db = getDb();
  return db.prepare('SELECT * FROM sync_log WHERE id = 1').get();
}

function updateSyncLog(lastSync, customFieldTester, customFieldRequestedBy) {
  const db = getDb();
  db.prepare('UPDATE sync_log SET last_sync = ?, custom_field_tester = ?, custom_field_requested_by = ? WHERE id = 1')
    .run(lastSync || null, customFieldTester || null, customFieldRequestedBy || null);
}

function updateIssueLocal(key, fields) {
  const db = getDb();
  const sets = [];
  const params = {};
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = @${k}`);
    params[k] = v;
  }
  params.key = key;
  if (sets.length > 0) {
    db.prepare(`UPDATE issues SET ${sets.join(', ')} WHERE key = @key`).run(params);
  }
}

function deleteIssue(key) {
  const db = getDb();
  db.prepare('DELETE FROM issues WHERE key = ?').run(key);
  db.prepare('DELETE FROM comments WHERE issue_key = ?').run(key);
}

module.exports = {
  initCache,
  getDb,
  upsertIssue,
  upsertComment,
  getAllIssues,
  getIssueByKey,
  getSyncLog,
  updateSyncLog,
  updateIssueLocal,
  deleteIssue
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add server/cache.js && git commit -m "feat: add SQLite cache module with issues, comments, sync_log tables"
```

---

### Task 5: Sync module

**Files:**
- Create: `jira-dashboard/server/sync.js`

- [ ] **Step 1: Create server/sync.js**

`jira-dashboard/server/sync.js`:
```js
const cron = require('node-cron');
const {
  getCurrentUser,
  getCustomFields,
  searchIssuesAll,
  getComments
} = require('./jira-client');
const {
  upsertIssue,
  upsertComment,
  getAllIssues,
  getSyncLog,
  updateSyncLog,
  deleteIssue
} = require('./cache');

let currentUserAccountId = null;
let currentUserEmail = null;

function buildMyTasksJql(accountId, testerFieldId) {
  const clauses = [
    `assignee = ${accountId}`,
    `reporter = ${accountId}`
  ];
  if (testerFieldId) {
    clauses.push(`${testerFieldId} = ${accountId}`);
  }
  return `(${clauses.join(' OR ')}) ORDER BY updated DESC`;
}

async function fullSync(io) {
  console.log('Starting full sync...');

  const user = await getCurrentUser();
  currentUserAccountId = user.accountId;
  currentUserEmail = user.emailAddress;
  console.log(`Authenticated as: ${user.displayName} (${currentUserAccountId})`);

  const customFields = await getCustomFields();
  const testerField = customFields.find(f => f.name.toLowerCase() === 'tester');
  const requestedByField = customFields.find(f => f.name.toLowerCase() === 'requested by');

  const testerFieldKey = testerField ? testerField.key : null;
  const requestedByFieldKey = requestedByField ? requestedByField.key : null;

  if (!testerField) {
    console.log('No custom "Tester" field found — will search by Assignee + Reporter only.');
  }
  if (!requestedByField) {
    console.log('No custom "Requested by" field found.');
  }

  const jql = buildMyTasksJql(currentUserAccountId, testerFieldKey);
  console.log('JQL:', jql);

  const issues = await searchIssuesAll(jql);
  console.log(`Fetched ${issues.length} issues from JIRA`);

  for (const issue of issues) {
    upsertIssue(issue, testerFieldKey, requestedByFieldKey);
  }

  // Fetch comments for each issue
  for (const issue of issues) {
    try {
      const comments = await getComments(issue.key);
      for (const c of comments) {
        upsertComment(issue.key, c);
      }
    } catch (e) {
      console.error(`Failed to fetch comments for ${issue.key}:`, e.message);
    }
  }

  const now = new Date().toISOString();
  updateSyncLog(now, testerFieldKey, requestedByFieldKey);

  console.log('Full sync complete.');

  if (io) {
    io.emit('sync:complete', { count: issues.length, lastSync: now });
  }
}

async function incrementalSync(io) {
  const log = getSyncLog();
  if (!log.last_sync) {
    return fullSync(io);
  }

  console.log(`Incremental sync since ${log.last_sync}...`);

  const jql = `(${buildMyTasksJql(currentUserAccountId, log.custom_field_tester)}) AND updated >= "${log.last_sync.replace('T', ' ').replace('Z', '')}"`;

  const issues = await searchIssuesAll(jql);
  console.log(`Fetched ${issues.length} updated issues`);

  const changedKeys = [];
  for (const issue of issues) {
    upsertIssue(issue, log.custom_field_tester, log.custom_field_requested_by);
    changedKeys.push(issue.key);

    const comments = await getComments(issue.key);
    for (const c of comments) {
      upsertComment(issue.key, c);
    }
  }

  const now = new Date().toISOString();
  updateSyncLog(now, log.custom_field_tester, log.custom_field_requested_by);

  if (io && changedKeys.length > 0) {
    io.emit('sync:updated', { keys: changedKeys, lastSync: now });
  }

  console.log(`Incremental sync complete. ${changedKeys.length} issues updated.`);
}

function startSync(io) {
  fullSync(io).catch(err => console.error('Initial sync failed:', err));

  cron.schedule('*/15 * * * *', () => {
    console.log('Scheduled sync triggered');
    incrementalSync(io).catch(err => console.error('Incremental sync failed:', err));
  });

  console.log('Sync scheduler started (every 15 minutes)');
}

function triggerSync(io) {
  return incrementalSync(io);
}

function getSyncStatus() {
  const log = getSyncLog();
  return {
    lastSync: log.last_sync,
    testerField: log.custom_field_tester,
    requestedByField: log.custom_field_requested_by
  };
}

module.exports = { startSync, triggerSync, getSyncStatus };
```

- [ ] **Step 2: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add server/sync.js && git commit -m "feat: add sync module with full + incremental sync and 15-min scheduler"
```

---

### Task 6: Express routes

**Files:**
- Create: `jira-dashboard/server/routes.js`

- [ ] **Step 1: Create server/routes.js**

`jira-dashboard/server/routes.js`:
```js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const {
  updateIssue,
  doTransition,
  getTransitions,
  addComment,
  addAttachment
} = require('./jira-client');
const {
  getAllIssues,
  getIssueByKey,
  updateIssueLocal,
  updateSyncLog
} = require('./cache');
const { triggerSync, getSyncStatus } = require('./sync');

// GET /api/issues — all cached issues
router.get('/issues', (req, res) => {
  try {
    const issues = getAllIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:key — single issue with comments
router.get('/issues/:key', (req, res) => {
  try {
    const issue = getIssueByKey(req.params.key);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/issues/:key — update summary, description, or transition status
router.put('/issues/:key', async (req, res) => {
  try {
    const { summary, description, transitionId } = req.body;
    const fields = {};

    if (summary !== undefined) fields.summary = summary;
    if (description !== undefined) fields.description = description;

    if (Object.keys(fields).length > 0) {
      await updateIssue(req.params.key, fields);
      updateIssueLocal(req.params.key, { summary: summary, description: description });
    }

    if (transitionId) {
      await doTransition(req.params.key, transitionId);
      const transitions = await getTransitions(req.params.key);
      const newTransition = transitions.find(t => t.id === transitionId);
      if (newTransition && newTransition.to) {
        updateIssueLocal(req.params.key, { status: newTransition.to.name });
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:key/transitions — available status transitions
router.get('/issues/:key/transitions', async (req, res) => {
  try {
    const transitions = await getTransitions(req.params.key);
    res.json(transitions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:key/comments — add comment
router.post('/issues/:key/comments', async (req, res) => {
  try {
    const result = await addComment(req.params.key, req.body.body);
    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:key/attachments — upload attachment
router.post('/issues/:key/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await addAttachment(req.params.key, req.file.buffer, req.file.originalname);
    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — trigger immediate sync
router.post('/sync', async (req, res) => {
  try {
    const io = req.app.get('io');
    await triggerSync(io);
    res.json({ success: true, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — sync status
router.get('/sync/status', (req, res) => {
  res.json(getSyncStatus());
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add server/routes.js && git commit -m "feat: add Express routes for issues, comments, attachments, sync"
```

---

### Task 7: Client API and WebSocket modules

**Files:**
- Create: `jira-dashboard/client/src/api.js`
- Create: `jira-dashboard/client/src/socket.js`

- [ ] **Step 1: Create client/src/api.js**

`jira-dashboard/client/src/api.js`:
```js
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function fetchIssues() {
  return request('/issues');
}

export function fetchIssue(key) {
  return request(`/issues/${key}`);
}

export function updateIssue(key, data) {
  return request(`/issues/${key}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export function fetchTransitions(key) {
  return request(`/issues/${key}/transitions`);
}

export function addComment(key, body) {
  return request(`/issues/${key}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

export function uploadAttachment(key, file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${BASE}/issues/${key}/attachments`, {
    method: 'POST',
    body: formData
  }).then(r => r.json());
}

export function triggerSync() {
  return request('/sync', { method: 'POST' });
}

export function fetchSyncStatus() {
  return request('/sync/status');
}
```

- [ ] **Step 2: Create client/src/socket.js**

`jira-dashboard/client/src/socket.js`:
```js
import { io } from 'socket.io-client';

const socket = io('/', { transports: ['websocket', 'polling'] });

export default socket;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/api.js client/src/socket.js && git commit -m "feat: add API client and WebSocket module"
```

---

### Task 8: StatusBadge, Toast, and FilterBar components

**Files:**
- Create: `jira-dashboard/client/src/components/StatusBadge.jsx`
- Create: `jira-dashboard/client/src/components/Toast.jsx`
- Create: `jira-dashboard/client/src/components/Toast.css`
- Create: `jira-dashboard/client/src/components/FilterBar.jsx`
- Create: `jira-dashboard/client/src/components/FilterBar.css`

- [ ] **Step 1: Create StatusBadge.jsx**

`jira-dashboard/client/src/components/StatusBadge.jsx`:
```jsx
const STATUS_COLORS = {
  'To Do': { bg: '#DFE1E6', text: '#42526E' },
  'In Progress': { bg: '#DEEBFF', text: '#0747A6' },
  'Done': { bg: '#E3FCEF', text: '#006644' },
  'In Review': { bg: '#FFF0B3', text: '#7A5D00' },
  'Blocked': { bg: '#FFEBE6', text: '#BF2600' },
};

export default function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      whiteSpace: 'nowrap'
    }}>
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Create Toast.jsx and Toast.css**

`jira-dashboard/client/src/components/Toast.jsx`:
```jsx
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import './Toast.css';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
```

`jira-dashboard/client/src/components/Toast.css`:
```css
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  padding: 10px 16px;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  animation: slideIn 0.3s ease;
}
.toast-info { background: #0052CC; }
.toast-error { background: #DE350B; }
.toast-success { background: #00875A; }
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

- [ ] **Step 3: Create FilterBar.jsx and FilterBar.css**

`jira-dashboard/client/src/components/FilterBar.jsx`:
```jsx
import './FilterBar.css';

export default function FilterBar({ search, onSearchChange, filters, onFiltersChange }) {
  return (
    <div className="filter-bar">
      <input
        type="text"
        placeholder="Search issues..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        className="filter-search"
      />
      <div className="filter-toggles">
        {['assignee', 'reporter', 'tester'].map(role => (
          <label key={role} className="filter-toggle">
            <input
              type="checkbox"
              checked={filters[role]}
              onChange={e => onFiltersChange({ ...filters, [role]: e.target.checked })}
            />
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </label>
        ))}
      </div>
    </div>
  );
}
```

`jira-dashboard/client/src/components/FilterBar.css`:
```css
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid #DFE1E6;
}
.filter-search {
  padding: 6px 10px;
  border: 1px solid #DFE1E6;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}
.filter-search:focus {
  border-color: #4C9AFF;
}
.filter-toggles {
  display: flex;
  gap: 12px;
}
.filter-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #42526E;
  cursor: pointer;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/components/ && git commit -m "feat: add StatusBadge, Toast, and FilterBar components"
```

---

### Task 9: HierarchyTree component

**Files:**
- Create: `jira-dashboard/client/src/components/HierarchyTree.jsx`
- Create: `jira-dashboard/client/src/components/HierarchyTree.css`

- [ ] **Step 1: Create HierarchyTree.jsx**

`jira-dashboard/client/src/components/HierarchyTree.jsx`:
```jsx
import { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import './HierarchyTree.css';

function buildTree(issues) {
  const map = {};
  const epics = [];

  for (const issue of issues) {
    map[issue.key] = { ...issue, children: [] };
  }

  for (const key in map) {
    const node = map[key];
    if (node.parent_key && map[node.parent_key]) {
      map[node.parent_key].children.push(node);
    } else if (node.epic_key && map[node.epic_key]) {
      map[node.epic_key].children.push(node);
    } else if (node.issue_type === 'Epic') {
      epics.push(node);
    } else {
      epics.push(node);
    }
  }

  return epics;
}

function TreeNode({ node, depth, selectedKey, onSelect, onTransition }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${selectedKey === node.key ? 'tree-row-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => onSelect(node.key)}
      >
        <span className="tree-expand" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
          {hasChildren ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span className="tree-key">{node.key}</span>
        <span className="tree-summary">{node.summary}</span>
        <StatusBadge status={node.status} />
        {node.sprint && <span className="tree-sprint-tag">{node.sprint}</span>}
      </div>
      {expanded && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onTransition={onTransition}
        />
      ))}
    </div>
  );
}

export default function HierarchyTree({ issues, filters, onSelectIssue, selectedKey }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return issues.filter(i => {
      const matchesSearch = !search ||
        i.key.toLowerCase().includes(search.toLowerCase()) ||
        i.summary.toLowerCase().includes(search.toLowerCase());

      const roleChecks = [];
      if (filters.assignee) roleChecks.push(i.assignee_name);
      if (filters.reporter) roleChecks.push(i.reporter_name);
      if (filters.tester) roleChecks.push(i.tester_name);

      const matchesRole = roleChecks.length === 0 || roleChecks.some(Boolean);

      return matchesSearch && matchesRole;
    });
  }, [issues, search, filters]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  return (
    <div className="hierarchy-tree">
      <div className="tree-filter-bar">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="tree-search"
        />
      </div>
      <div className="tree-list">
        {tree.map(node => (
          <TreeNode
            key={node.key}
            node={node}
            depth={0}
            selectedKey={selectedKey}
            onSelect={onSelectIssue}
          />
        ))}
        {tree.length === 0 && (
          <div className="tree-empty">No issues found</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create HierarchyTree.css**

`jira-dashboard/client/src/components/HierarchyTree.css`:
```css
.hierarchy-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tree-filter-bar {
  padding: 8px;
}
.tree-search {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #DFE1E6;
  border-radius: 4px;
  font-size: 11px;
  box-sizing: border-box;
}
.tree-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  border-left: 3px solid transparent;
  font-size: 12px;
  min-height: 28px;
}
.tree-row:hover {
  background: #F4F5F7;
}
.tree-row-selected {
  background: #DEEBFF;
  border-left-color: #0052CC;
}
.tree-expand {
  width: 14px;
  font-size: 9px;
  color: #6B778C;
  flex-shrink: 0;
}
.tree-key {
  font-family: monospace;
  font-size: 11px;
  color: #0052CC;
  flex-shrink: 0;
}
.tree-summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #172B4D;
}
.tree-sprint-tag {
  font-size: 10px;
  background: #EAE6FF;
  color: #403294;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}
.tree-empty {
  padding: 20px;
  text-align: center;
  color: #6B778C;
  font-size: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/components/HierarchyTree.jsx client/src/components/HierarchyTree.css && git commit -m "feat: add HierarchyTree component with expandable Epic→Story→Task tree"
```

---

### Task 10: GanttChart component

**Files:**
- Create: `jira-dashboard/client/src/components/GanttChart.jsx`
- Create: `jira-dashboard/client/src/components/GanttChart.css`

- [ ] **Step 1: Create GanttChart.jsx**

`jira-dashboard/client/src/components/GanttChart.jsx`:
```jsx
import { useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import './GanttChart.css';

const STATUS_COLORS = {
  'To Do': '#DFE1E6',
  'In Progress': '#0052CC',
  'Done': '#00875A',
  'In Review': '#FFAB00',
  'Blocked': '#DE350B'
};

function mapIssuesToGanttTasks(issues) {
  // Sort so epics come first, then children
  return issues.map(issue => {
    const start = issue.start_date || issue.due_date || new Date().toISOString().split('T')[0];
    const end = issue.due_date || start;
    const progress = issue.status_category === 'Done' ? 100
      : issue.status_category === 'In Progress' ? 50
      : 0;

    return {
      id: issue.key,
      name: `${issue.key}: ${issue.summary}`,
      start: start.split('T')[0],
      end: end.split('T')[0],
      progress,
      dependencies: '',
      custom_class: `gantt-status-${(issue.status || '').replace(/\s+/g, '-').toLowerCase()}`
    };
  });
}

export default function GanttChart({ issues, onSelectIssue, selectedKey }) {
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || issues.length === 0) return;

    if (ganttRef.current) {
      containerRef.current.innerHTML = '';
    }

    const tasks = mapIssuesToGanttTasks(issues);

    ganttRef.current = new Gantt(containerRef.current, tasks, {
      view_mode: 'Week',
      date_format: 'YYYY-MM-DD',
      on_click: (task) => {
        onSelectIssue(task.id);
      },
      on_date_change: (task, start, end) => {
        // Date change will be handled by the parent
      },
      custom_popup_html: (task) => {
        const issue = issues.find(i => i.key === task.id);
        if (!issue) return '';
        return `
          <div class="gantt-popup">
            <strong>${task.id}</strong>
            <p>${issue.summary || ''}</p>
            <p>Status: ${issue.status} | Assignee: ${issue.assignee_name}</p>
          </div>
        `;
      }
    });

    return () => {
      if (ganttRef.current) {
        containerRef.current.innerHTML = '';
        ganttRef.current = null;
      }
    };
  }, [issues]);

  // Highlight selected bar
  useEffect(() => {
    if (!ganttRef.current || !selectedKey) return;

    const bars = containerRef.current.querySelectorAll('.bar');
    bars.forEach(b => {
      b.style.outline = b.getAttribute('data-id') === selectedKey ? '2px solid #0052CC' : '';
    });
  }, [selectedKey]);

  if (issues.length === 0) {
    return <div className="gantt-empty">Loading tasks... Sync in progress.</div>;
  }

  return <div ref={containerRef} className="gantt-container" />;
}
```

- [ ] **Step 2: Create GanttChart.css**

`jira-dashboard/client/src/components/GanttChart.css`:
```css
.gantt-container {
  height: 100%;
  overflow: auto;
}
.gantt-container svg {
  width: 100%;
}
.gantt-empty {
  padding: 40px;
  text-align: center;
  color: #6B778C;
  font-size: 14px;
}
/* Frappe Gantt overrides */
.gantt-container .bar {
  transition: filter 0.2s;
}
.gantt-container .bar:hover {
  filter: brightness(0.9);
}
.gantt-popup {
  padding: 8px;
  font-size: 12px;
}
.gantt-popup p {
  margin: 4px 0;
}
```

- [ ] **Step 3: Install Frappe Gantt CSS**

Frappe Gantt ships its own CSS. Update `client/src/main.jsx` in the next task to import it. For now, add the import path.

- [ ] **Step 4: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/components/GanttChart.jsx client/src/components/GanttChart.css && git commit -m "feat: add GanttChart component wrapping Frappe Gantt"
```

---

### Task 11: DetailDrawer component

**Files:**
- Create: `jira-dashboard/client/src/components/DetailDrawer.jsx`
- Create: `jira-dashboard/client/src/components/DetailDrawer.css`

- [ ] **Step 1: Create DetailDrawer.jsx**

`jira-dashboard/client/src/components/DetailDrawer.jsx`:
```jsx
import { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import { fetchIssue, updateIssue, fetchTransitions, addComment, uploadAttachment } from '../api';
import { useToast } from './Toast';
import './DetailDrawer.css';

export default function DetailDrawer({ issueKey, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [transitions, setTransitions] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const addToast = useToast();

  useEffect(() => {
    if (!issueKey) return;
    setLoading(true);
    fetchIssue(issueKey).then(data => {
      setIssue(data);
      setSummary(data.summary);
      setDescription(data.description);
      setLoading(false);
    }).catch(err => {
      addToast('Failed to load issue: ' + err.message, 'error');
      setLoading(false);
    });

    fetchTransitions(issueKey).then(setTransitions).catch(() => {});
  }, [issueKey]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateIssue(issueKey, { summary, description });
      addToast('Issue updated', 'success');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    }
    setSaving(false);
  }

  async function handleTransition(transitionId) {
    try {
      await updateIssue(issueKey, { transitionId });
      addToast('Status updated', 'success');
      const updated = await fetchIssue(issueKey);
      setIssue(updated);
      const newTransitions = await fetchTransitions(issueKey);
      setTransitions(newTransitions);
    } catch (err) {
      addToast('Transition failed: ' + err.message, 'error');
    }
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    try {
      await addComment(issueKey, commentText);
      setCommentText('');
      addToast('Comment added', 'success');
      const updated = await fetchIssue(issueKey);
      setIssue(updated);
    } catch (err) {
      addToast('Comment failed: ' + err.message, 'error');
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadAttachment(issueKey, file);
      addToast('Attachment uploaded', 'success');
    } catch (err) {
      addToast('Upload failed: ' + err.message, 'error');
    }
  }

  if (!issueKey) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{issueKey}</h2>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="drawer-loading">Loading...</div>
        ) : issue ? (
          <div className="drawer-body">
            <div className="drawer-field">
              <label>Status</label>
              <div className="drawer-status-row">
                <StatusBadge status={issue.status} />
                {transitions.length > 0 && (
                  <select
                    className="drawer-transition-select"
                    onChange={e => e.target.value && handleTransition(e.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>Transition...</option>
                    {transitions.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="drawer-field">
              <label>Summary</label>
              <input value={summary} onChange={e => setSummary(e.target.value)} />
            </div>

            <div className="drawer-field">
              <label>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={6}
              />
            </div>

            <div className="drawer-meta">
              <div><strong>Assignee:</strong> {issue.assignee_name || '-'}</div>
              <div><strong>Reporter:</strong> {issue.reporter_name || '-'}</div>
              <div><strong>Tester:</strong> {issue.tester_name || '-'}</div>
              <div><strong>Fix versions:</strong> {issue.fix_versions || '-'}</div>
              <div><strong>Sprint:</strong> {issue.sprint || '-'}</div>
              <div><strong>Requested by:</strong> {issue.requested_by || '-'}</div>
              <div><strong>Issue type:</strong> {issue.issue_type || '-'}</div>
              <div><strong>Priority:</strong> {issue.priority || '-'}</div>
              <div><strong>Due date:</strong> {issue.due_date || '-'}</div>
            </div>

            <button
              className="drawer-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div className="drawer-section">
              <h3>Comments</h3>
              <div className="drawer-comments">
                {(issue.comments || []).map(c => (
                  <div key={c.id} className="drawer-comment">
                    <span className="comment-author">{c.author}</span>
                    <span className="comment-date">{new Date(c.created).toLocaleString()}</span>
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: c.body }} />
                  </div>
                ))}
              </div>
              <div className="drawer-comment-form">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                />
                <button onClick={handleAddComment}>Add Comment</button>
              </div>
            </div>

            <div className="drawer-section">
              <h3>Attachments</h3>
              <input type="file" onChange={handleFileUpload} />
            </div>
          </div>
        ) : (
          <div className="drawer-loading">Issue not found</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DetailDrawer.css**

`jira-dashboard/client/src/components/DetailDrawer.css`:
```css
.drawer-overlay {
  position: fixed;
  top: 0; right: 0; bottom: 0; left: 0;
  background: rgba(0,0,0,0.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: 480px;
  max-width: 90vw;
  background: #fff;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0,0,0,0.15);
  animation: slideDrawer 0.25s ease;
}
@keyframes slideDrawer {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #DFE1E6;
}
.drawer-header h2 {
  margin: 0;
  font-size: 16px;
  color: #172B4D;
}
.drawer-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #6B778C;
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.drawer-field {
  margin-bottom: 14px;
}
.drawer-field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6B778C;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.drawer-field input,
.drawer-field textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #DFE1E6;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}
.drawer-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.drawer-transition-select {
  padding: 4px 8px;
  border: 1px solid #DFE1E6;
  border-radius: 4px;
  font-size: 12px;
}
.drawer-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 16px 0;
  font-size: 12px;
  color: #42526E;
}
.drawer-save-btn {
  width: 100%;
  padding: 10px;
  background: #0052CC;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 20px;
}
.drawer-save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.drawer-section {
  margin-top: 20px;
  border-top: 1px solid #DFE1E6;
  padding-top: 16px;
}
.drawer-section h3 {
  font-size: 13px;
  color: #172B4D;
  margin: 0 0 10px;
}
.drawer-comments {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.drawer-comment {
  padding: 8px 0;
  border-bottom: 1px solid #F4F5F7;
}
.comment-author {
  font-weight: 600;
  font-size: 12px;
  color: #172B4D;
}
.comment-date {
  font-size: 11px;
  color: #6B778C;
  margin-left: 8px;
}
.comment-body {
  font-size: 12px;
  margin-top: 4px;
  color: #172B4D;
}
.drawer-comment-form textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #DFE1E6;
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
  margin-bottom: 6px;
}
.drawer-comment-form button {
  padding: 6px 14px;
  background: #0052CC;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.drawer-loading {
  padding: 40px;
  text-align: center;
  color: #6B778C;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/components/DetailDrawer.jsx client/src/components/DetailDrawer.css && git commit -m "feat: add DetailDrawer with editing, comments, transitions, attachments"
```

---

### Task 12: App component and entry point

**Files:**
- Create: `jira-dashboard/client/src/main.jsx`
- Create: `jira-dashboard/client/src/App.jsx`
- Create: `jira-dashboard/client/src/App.css`

- [ ] **Step 1: Create main.jsx**

`jira-dashboard/client/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/Toast';
import 'frappe-gantt/dist/frappe-gantt.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Create App.jsx**

`jira-dashboard/client/src/App.jsx`:
```jsx
import { useState, useEffect, useCallback } from 'react';
import HierarchyTree from './components/HierarchyTree';
import GanttChart from './components/GanttChart';
import DetailDrawer from './components/DetailDrawer';
import FilterBar from './components/FilterBar';
import { fetchIssues, fetchSyncStatus, triggerSync } from './api';
import socket from './socket';
import { useToast } from './components/Toast';
import './App.css';

export default function App() {
  const [issues, setIssues] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ lastSync: null, countdown: null });
  const [filters, setFilters] = useState({ assignee: true, reporter: true, tester: true });
  const [search, setSearch] = useState('');
  const addToast = useToast();

  const loadIssues = useCallback(async () => {
    try {
      const data = await fetchIssues();
      setIssues(data);
    } catch (err) {
      addToast('Failed to load issues: ' + err.message, 'error');
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await fetchSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    loadIssues();
    loadSyncStatus();
  }, []);

  useEffect(() => {
    socket.on('sync:complete', (data) => {
      addToast(`Sync complete: ${data.count} issues`, 'info');
      loadIssues();
      loadSyncStatus();
    });

    socket.on('sync:updated', (data) => {
      loadIssues();
      loadSyncStatus();
    });

    return () => {
      socket.off('sync:complete');
      socket.off('sync:updated');
    };
  }, []);

  async function handleManualSync() {
    try {
      addToast('Syncing...', 'info');
      await triggerSync();
      await loadIssues();
      await loadSyncStatus();
    } catch (err) {
      addToast('Sync failed: ' + err.message, 'error');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>JIRA Dashboard</h1>
        <div className="header-actions">
          <span className="sync-status">
            {syncStatus.lastSync
              ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleTimeString()}`
              : 'Not synced yet'}
          </span>
          <button className="sync-btn" onClick={handleManualSync}>Sync Now</button>
        </div>
      </header>
      <div className="app-main">
        <div className="app-sidebar">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
          />
          <HierarchyTree
            issues={issues}
            filters={filters}
            search={search}
            onSelectIssue={setSelectedKey}
            selectedKey={selectedKey}
          />
        </div>
        <div className="app-content">
          <GanttChart
            issues={issues}
            onSelectIssue={setSelectedKey}
            selectedKey={selectedKey}
          />
        </div>
      </div>
      <DetailDrawer
        issueKey={selectedKey}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create App.css**

`jira-dashboard/client/src/App.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #172B4D; }
.app { height: 100%; display: flex; flex-direction: column; }
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: #0052CC;
  color: #fff;
  flex-shrink: 0;
}
.app-header h1 { font-size: 16px; font-weight: 600; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.sync-status { font-size: 11px; opacity: 0.85; }
.sync-btn {
  padding: 4px 12px;
  border: 1px solid rgba(255,255,255,0.5);
  background: transparent;
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.sync-btn:hover { background: rgba(255,255,255,0.15); }
.app-main { flex: 1; display: flex; overflow: hidden; }
.app-sidebar {
  width: 350px;
  min-width: 280px;
  border-right: 1px solid #DFE1E6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-content { flex: 1; overflow: hidden; padding: 10px; }
```

- [ ] **Step 4: Verify the client builds**

Run: `cd /Users/briancheung/jira-dashboard/client && npx vite build`
Expected: No errors. Build output in `client/dist/`.

- [ ] **Step 5: Commit**

```bash
cd /Users/briancheung/jira-dashboard && git add client/src/main.jsx client/src/App.jsx client/src/App.css && git commit -m "feat: add App component, React entry point, and global styles"
```

---

### Task 13: Integration testing and final wiring

**Files:** None new

- [ ] **Step 1: Start the full application**

Run: `cd /Users/briancheung/jira-dashboard && npm run dev`
Expected: Server starts on `http://localhost:3001`, client on `http://localhost:5173`.

- [ ] **Step 2: Verify the JIRA connection**

Open `http://localhost:5173` in browser.
Expected:
- Initial full sync triggers on server startup
- Sync status in header updates after sync completes
- Issues appear in the hierarchy tree (Epics as top-level, Stories underneath, Tasks nested)
- Gantt chart renders with bars for each issue
- Clicking an issue opens the detail drawer with fields/status/comments/attachments
- "Sync Now" button triggers an immediate incremental sync

- [ ] **Step 3: Verify editing works**

In the detail drawer:
- Edit summary, click "Save Changes" → toast confirms, JIRA updated
- Select a transition from dropdown → status changes on JIRA
- Add a comment → appears in comment thread
- Upload an attachment → success toast
- Verify changes persist on page reload (synced back from JIRA)

- [ ] **Step 4: Verify WebSocket real-time updates**

Open a second browser tab to `http://localhost:5173`. Edit an issue in tab 1. Tab 2 should update within seconds via WebSocket.

- [ ] **Step 5: Commit any fixes if needed, then final commit**

```bash
cd /Users/briancheung/jira-dashboard && git add -A && git commit -m "feat: complete JIRA dashboard — integration verified"
```
