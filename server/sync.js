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
  getSyncLog,
  updateSyncLog
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

function discoverFields(customFields) {
  const tester = customFields.find(f => f.name.toLowerCase() === 'tester');
  const requestedBy = customFields.find(f => f.name.toLowerCase() === 'requested by');
  const startDate = customFields.find(f => f.name.toLowerCase() === 'start date');
  const sprint = customFields.find(f => f.name.toLowerCase() === 'sprint');

  return {
    tester: tester ? tester.key : null,
    requestedBy: requestedBy ? requestedBy.key : null,
    startDate: startDate ? startDate.key : null,
    sprint: sprint ? sprint.key : null
  };
}

async function fullSync(io) {
  console.log('Starting full sync...');

  const user = await getCurrentUser();
  currentUserAccountId = user.accountId;
  currentUserEmail = user.emailAddress;
  console.log(`Authenticated as: ${user.displayName} (${currentUserAccountId})`);

  const customFields = await getCustomFields();
  const fields = discoverFields(customFields);

  console.log('Discovered custom fields:', {
    tester: fields.tester,
    requestedBy: fields.requestedBy,
    startDate: fields.startDate,
    sprint: fields.sprint
  });

  const jql = buildMyTasksJql(currentUserAccountId, fields.tester);
  console.log('JQL:', jql);

  const issues = await searchIssuesAll(jql);
  console.log(`Fetched ${issues.length} issues from JIRA`);

  for (const issue of issues) {
    upsertIssue(issue, fields.tester, fields.requestedBy, fields.startDate, fields.sprint);
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
  updateSyncLog(now, fields.tester, fields.requestedBy, fields.startDate, fields.sprint);

  console.log('Full sync complete.');

  if (io) {
    io.emit('sync:complete', { count: issues.length, lastSync: now });
  }
}

async function incrementalSync(io) {
  const log = getSyncLog();
  if (!log || !log.last_sync) {
    return fullSync(io);
  }

  console.log(`Incremental sync since ${log.last_sync}...`);

  const jql = `(${buildMyTasksJql(currentUserAccountId, log.custom_field_tester)}) AND updated >= "${log.last_sync.replace('T', ' ').replace('Z', '')}"`;

  const issues = await searchIssuesAll(jql);
  console.log(`Fetched ${issues.length} updated issues`);

  const changedKeys = [];
  for (const issue of issues) {
    upsertIssue(issue, log.custom_field_tester, log.custom_field_requested_by, log.custom_field_start_date, log.custom_field_sprint);
    changedKeys.push(issue.key);

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
  updateSyncLog(now, log.custom_field_tester, log.custom_field_requested_by, log.custom_field_start_date, log.custom_field_sprint);

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
    lastSync: log ? log.last_sync : null,
    testerField: log ? log.custom_field_tester : null,
    requestedByField: log ? log.custom_field_requested_by : null
  };
}

module.exports = { startSync, triggerSync, getSyncStatus };
