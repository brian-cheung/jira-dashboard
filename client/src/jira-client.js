// JIRA API client — supports both direct JIRA access and backend proxy
function getConfig() {
  try {
    return JSON.parse(localStorage.getItem('jira_config') || '{}');
  } catch { return {}; }
}

async function jiraFetch(path, options = {}) {
  const cfg = getConfig();
  if (!cfg.url) throw new Error('JIRA not configured');

  // If backend proxy is configured, route through it
  if (cfg.backendUrl) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-jira-url': cfg.url,
      'x-jira-email': cfg.email,
      'x-jira-token': cfg.token,
    };
    const url = `${cfg.backendUrl}/api/proxy/${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Backend ${res.status}: ${body}`);
    }
    return res.json();
  }

  // Direct JIRA access (only works if CORS is configured on JIRA side)
  const baseUrl = cfg.url.replace('https://', `https://${encodeURIComponent(cfg.email)}:${encodeURIComponent(cfg.token)}@`);
  const headers = {
    'Accept': 'application/json',
    'X-Atlassian-Token': 'no-check'
  };
  if (!options.headers || !options.headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const url = `${baseUrl}/rest/api/3/${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return jiraFetch(path, options);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JIRA ${res.status}: ${body}`);
  }

  return res.json();
}

export async function getCurrentUser() {
  return jiraFetch('myself');
}

export async function getCustomFields() {
  const fields = await jiraFetch('field');
  return fields.filter(f => f.custom);
}

export async function searchIssuesAll(jql) {
  let all = [];
  let nextPageToken = null;
  while (true) {
    const body = { jql, fields: ['*all'], maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await jiraFetch('search/jql', { method: 'POST', body: JSON.stringify(body) });
    all = all.concat(res.issues);
    if (res.isLast) break;
    nextPageToken = res.nextPageToken;
  }
  return all;
}

export async function getIssue(key) {
  return jiraFetch(`issue/${key}?expand=renderedFields`);
}

export async function updateIssue(key, fields) {
  return jiraFetch(`issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields }) });
}

export async function doTransition(key, transitionId) {
  return jiraFetch(`issue/${key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transitionId } })
  });
}

export async function getTransitions(key) {
  const res = await jiraFetch(`issue/${key}/transitions`);
  return res.transitions;
}

export async function addComment(key, text) {
  const body = {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  };
  return jiraFetch(`issue/${key}/comment`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function getComments(key) {
  const res = await jiraFetch(`issue/${key}/comment`);
  return res.comments;
}

export async function createIssue(fields) {
  return jiraFetch('issue', { method: 'POST', body: JSON.stringify({ fields }) });
}

export { getConfig };
