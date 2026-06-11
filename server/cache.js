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
      project_key TEXT,
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
      custom_field_requested_by TEXT,
      custom_field_start_date TEXT,
      custom_field_sprint TEXT,
      custom_jql TEXT
    );
  `);

  // Ensure the singleton row exists
  db.exec(`INSERT OR IGNORE INTO sync_log (id, last_sync) VALUES (1, NULL);`);

  // Migration: add project_key if upgrading from older schema
  try { db.exec(`ALTER TABLE issues ADD COLUMN project_key TEXT`); } catch {}

  return db;
}

function getDb() {
  if (!db) throw new Error('Cache not initialized. Call initCache() first.');
  return db;
}

function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val.displayName) return val.displayName;
    if (val.name) return val.name;
    if (val.value) return String(val.value);
    if (Array.isArray(val)) return val.map(v => safeStr(v)).filter(Boolean).join(', ');
    return JSON.stringify(val);
  }
  return String(val);
}

function upsertIssue(
  issue,
  customFieldTester,
  customFieldRequestedBy,
  customFieldStartDate,
  customFieldSprint
) {
  const db = getDb();
  const fields = issue.fields || {};

  const epicKey = fields.epic ? fields.epic.key : null;
  const parentKey = fields.parent ? fields.parent.key : null;
  const fixVersions = Array.isArray(fields.fixVersions)
    ? fields.fixVersions.map(v => v.name).join(', ')
    : '';

  // Sprint from custom field (array type)
  let sprintName = '';
  if (customFieldSprint) {
    const sprintVal = fields[customFieldSprint];
    if (Array.isArray(sprintVal)) {
      const active = sprintVal.filter(s => s.state === 'active');
      sprintName = active.length > 0
        ? active.map(s => s.name).join(', ')
        : sprintVal.map(s => s.name).join(', ');
    } else if (sprintVal && sprintVal.name) {
      sprintName = sprintVal.name;
    }
  }

  // Start date from discovered custom field
  let startDate = null;
  if (customFieldStartDate && fields[customFieldStartDate]) {
    startDate = fields[customFieldStartDate];
  }

  const testerVal = customFieldTester ? fields[customFieldTester] : null;
  const testerName = safeStr(testerVal);

  const requestedByVal = customFieldRequestedBy ? fields[customFieldRequestedBy] : null;
  const requestedByName = safeStr(requestedByVal);

  const projectKey = fields.project ? safeStr(fields.project.key) : '';

  const assignee = fields.assignee || {};
  const reporter = fields.reporter || {};

  let desc = '';
  if (fields.renderedFields && typeof fields.renderedFields.description === 'string') {
    desc = fields.renderedFields.description;
  } else if (typeof fields.description === 'string') {
    desc = fields.description;
  } else if (fields.description && typeof fields.description === 'object') {
    desc = JSON.stringify(fields.description);
  }

  db.prepare(`
    INSERT OR REPLACE INTO issues
      (id, key, summary, status, status_category, assignee_name, assignee_avatar,
       reporter_name, tester_name, epic_key, parent_key, issue_type,
       start_date, due_date, description, fix_versions, requested_by, sprint, priority, project_key, updated, raw_json)
    VALUES
      (@id, @key, @summary, @status, @statusCategory, @assigneeName, @assigneeAvatar,
       @reporterName, @testerName, @epicKey, @parentKey, @issueType,
       @startDate, @dueDate, @description, @fixVersions, @requestedBy, @sprint, @priority, @projectKey, @updated, @rawJson)
  `).run({
    id: issue.id,
    key: issue.key,
    summary: safeStr(fields.summary),
    status: fields.status ? safeStr(fields.status.name) : '',
    statusCategory: fields.status && fields.status.statusCategory ? safeStr(fields.status.statusCategory.name) : '',
    assigneeName: safeStr(assignee.displayName),
    assigneeAvatar: assignee.avatarUrls ? (assignee.avatarUrls['24x24'] || '') : '',
    reporterName: safeStr(reporter.displayName),
    testerName,
    epicKey,
    parentKey,
    issueType: fields.issuetype ? safeStr(fields.issuetype.name) : '',
    startDate,
    dueDate: fields.duedate || null,
    description: desc,
    fixVersions,
    requestedBy: requestedByName,
    sprint: sprintName,
    priority: fields.priority ? safeStr(fields.priority.name) : '',
    projectKey,
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
    safeStr(comment.author),
    safeStr(comment.body),
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

function updateSyncLog(lastSync, testerField, requestedByField, startDateField, sprintField) {
  const db = getDb();
  db.prepare(`
    UPDATE sync_log SET
      last_sync = ?,
      custom_field_tester = ?,
      custom_field_requested_by = ?,
      custom_field_start_date = ?,
      custom_field_sprint = ?
    WHERE id = 1
  `).run(
    lastSync || null,
    testerField || null,
    requestedByField || null,
    startDateField || null,
    sprintField || null
  );
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

function getCustomJql() {
  const log = getSyncLog();
  return log ? log.custom_jql || '' : '';
}

function setCustomJql(jql) {
  const db = getDb();
  db.prepare('UPDATE sync_log SET custom_jql = ? WHERE id = 1').run(jql || null);
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
  deleteIssue,
  getCustomJql,
  setCustomJql
};
