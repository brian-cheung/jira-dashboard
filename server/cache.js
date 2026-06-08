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
    startDate: fields.customfield_10015 || null,
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
