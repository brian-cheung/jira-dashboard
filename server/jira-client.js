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
  const method = options.method || 'GET';
  console.log(`JIRA ${method} ${path}`);
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
    console.log(`Rate limited. Waiting ${retryAfter}s...`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return jiraFetch(path, options);
  }

  if (!res.ok) {
    const body = await res.text();
    const msg = `JIRA API ${res.status} on ${method} ${path}: ${body}`;
    console.error(msg);
    throw new Error(msg);
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

async function searchIssues(jql, fields = ['*all'], maxResults = 100, nextPageToken = null) {
  const body = { jql, fields, maxResults };
  if (nextPageToken) body.nextPageToken = nextPageToken;
  const res = await jiraFetch('search/jql', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res;
}

async function searchIssuesAll(jql) {
  let allIssues = [];
  let nextPageToken = null;
  const maxResults = 100;

  while (true) {
    const res = await searchIssues(jql, ['*all'], maxResults, nextPageToken);
    allIssues = allIssues.concat(res.issues);
    if (res.isLast) break;
    nextPageToken = res.nextPageToken;
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
