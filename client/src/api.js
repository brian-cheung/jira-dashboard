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

export function createIssue(data) {
  return request('/issues', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function fetchSettings() {
  return request('/settings');
}

export function saveSettings(data) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}
