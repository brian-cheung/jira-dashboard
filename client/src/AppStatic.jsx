import { useState, useEffect, useCallback, useMemo } from 'react';
import Dashboard from './components/Dashboard';
import MetricsDashboard from './components/MetricsDashboard';
import DetailDrawer from './components/DetailDrawer';
import CreateIssueModal from './components/CreateIssueModal';
import Timeline from './components/Timeline';
import StatusBadge, { getStatusColor, STATUS_ORDER } from './components/StatusBadge';
import { searchIssuesAll, getCurrentUser, getCustomFields, addComment, getComments, getTransitions, doTransition, getIssue, updateIssue, createIssue as jiraCreateIssue } from './jira-client';
import { getConfig } from './jira-client';
import { adfToHtml } from './adf';
import './App.css';
import './components/FilterBar.css';
import './components/Dashboard.css';
import './components/DetailDrawer.css';
import './components/HierarchyTree.css';
import './components/MetricsDashboard.css';
import './components/CreateIssueModal.css';
import './components/Setup.css';
import './components/Toast.css';
import './components/Timeline.css';

// Simple toast inline (no socket)
function useSimpleToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, addToast };
}

function parseIssue(issue) {
  const f = issue.fields || {};
  const cfg = getConfig();
  const testerKey = cfg.testerField || '';
  const requestedByKey = cfg.requestedByField || '';
  const startDateKey = cfg.startDateField || '';
  const sprintKey = cfg.sprintField || '';

  const fixVersions = (f.fixVersions || []).map(v => v.name).join(', ');

  let sprintName = '';
  if (sprintKey && f[sprintKey]) {
    const sv = f[sprintKey];
    if (Array.isArray(sv)) {
      sprintName = sv.map(s => s.name).join(', ');
    } else if (sv.name) {
      sprintName = sv.name;
    }
  }

  const testerVal = testerKey ? f[testerKey] : null;
  const testerName = testerVal
    ? (testerVal.displayName || testerVal.name || (typeof testerVal === 'string' ? testerVal : ''))
    : '';

  const requestedByVal = requestedByKey ? f[requestedByKey] : null;
  const requestedByName = requestedByVal
    ? (Array.isArray(requestedByVal) ? requestedByVal.map(v => v.displayName || v.name || v).join(', ') : (requestedByVal.displayName || requestedByVal.name || (typeof requestedByVal === 'string' ? requestedByVal : '')))
    : '';

  let desc = '';
  const rd = f.renderedFields;
  if (rd && typeof rd.description === 'string') desc = rd.description;
  else if (typeof f.description === 'string') desc = f.description;
  else if (f.description) desc = JSON.stringify(f.description);

  return {
    id: issue.id,
    key: issue.key,
    summary: f.summary || '',
    status: f.status ? f.status.name : '',
    status_category: f.status && f.status.statusCategory ? f.status.statusCategory.name : '',
    assignee_name: f.assignee ? f.assignee.displayName || '' : '',
    assignee_avatar: f.assignee && f.assignee.avatarUrls ? f.assignee.avatarUrls['24x24'] || '' : '',
    reporter_name: f.reporter ? f.reporter.displayName || '' : '',
    tester_name: testerName,
    epic_key: f.epic ? f.epic.key : null,
    parent_key: f.parent ? f.parent.key : null,
    issue_type: f.issuetype ? f.issuetype.name : '',
    start_date: startDateKey ? f[startDateKey] : null,
    due_date: f.duedate || null,
    description: desc,
    fix_versions: fixVersions,
    requested_by: requestedByName,
    sprint: sprintName,
    priority: f.priority ? f.priority.name : '',
    components: (f.components || []).map(c => ({ id: c.id, name: c.name })),
    project_key: f.project ? f.project.key : '',
    created: f.created || null,
    updated: f.updated || null,
    comments: [],
  };
}

// Config screen
function ConfigScreen({ onConfigured }) {
  const [url, setUrl] = useState('https://executivecentre.atlassian.net');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [jql, setJql] = useState('');
  const [backendUrl, setBackendUrl] = useState('https://jira-proxy.tec-jira.workers.dev/');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  async function handleConnect() {
    setTesting(true);
    setError('');
    const cfg = { url, email, token, jql, backendUrl };
    localStorage.setItem('jira_config', JSON.stringify(cfg));
    try {
      const user = await getCurrentUser();
      cfg.displayName = user.displayName;
      cfg.accountId = user.accountId;
      localStorage.setItem('jira_config', JSON.stringify(cfg));
      onConfigured(cfg);
    } catch (e) {
      setError('Connection failed: ' + e.message + (backendUrl ? '' : '. You may need to set up a backend proxy — see below.'));
      localStorage.removeItem('jira_config');
    }
    setTesting(false);
  }

  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('jira_config') || '{}'); } catch { return {}; }
  }, []);

  useEffect(() => {
    if (saved.url && saved.email && saved.token) {
      setUrl(saved.url || '');
      setEmail(saved.email || '');
      setToken(saved.token || '');
      setJql(saved.jql || '');
      setBackendUrl(saved.backendUrl || 'https://jira-proxy.tec-jira.workers.dev/');
    }
  }, []);

  return (
    <div className="config-screen">
      <div className="config-card">
        <div className="config-left">
          <div className="config-logo">
            <svg width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0052CC"/><text x="24" y="32" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="22" fontWeight="bold">J</text></svg>
          </div>
          <h1>JIRA Dashboard</h1>
          <p className="config-subtitle">Connect your Atlassian account to view and manage your tasks in one place.</p>
          <div className="config-features">
            <div className="config-feature">
              <span className="config-feature-icon">📋</span>
              <span>Track all your issues across projects</span>
            </div>
            <div className="config-feature">
              <span className="config-feature-icon">📊</span>
              <span>Metrics and trends at a glance</span>
            </div>
            <div className="config-feature">
              <span className="config-feature-icon">✏️</span>
              <span>Edit, comment, and create issues directly</span>
            </div>
            <div className="config-feature">
              <span className="config-feature-icon">🔒</span>
              <span>Credentials stay in your browser only</span>
            </div>
          </div>
        </div>

        <div className="config-right">
          <h2>Connect to JIRA</h2>

          <div className="config-field">
            <label>JIRA URL</label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-company.atlassian.net" />
          </div>
          <div className="config-field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="config-field">
            <label>API Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your API token here" />
            <span className="config-hint">
              <a href="https://id.atlassian.com/manage/api-tokens" target="_blank" rel="noopener noreferrer">Create an API token →</a>
            </span>
          </div>
          <div className="config-field">
            <label>JQL Query <span className="config-optional">optional</span></label>
            <input type="text" value={jql} onChange={e => setJql(e.target.value)} placeholder="Default: issues assigned to, reported by, or tested by you" />
          </div>
          <div className="config-field">
            <label>Backend Proxy URL <span className="config-optional">needed for browser access</span></label>
            <input type="text" value={backendUrl} onChange={e => setBackendUrl(e.target.value)} placeholder="e.g. https://your-app.onrender.com — leave blank to try direct access" />
            <span className="config-hint">
              JIRA blocks browser requests. Deploy a free proxy on <a href="https://render.com" target="_blank" rel="noopener noreferrer">Render →</a> or run the included server locally
            </span>
          </div>

          {error && <div className="config-error">{error}</div>}

          <button className="config-btn" onClick={handleConnect} disabled={testing}>
            {testing ? <span className="config-spinner" /> : null}
            {testing ? 'Connecting...' : 'Connect to JIRA'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Toast
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

// DetailDrawer wrapper that works with the direct JIRA client
function DetailDrawerStatic({ issueKey, issues, onClose, addToast }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [transitions, setTransitions] = useState([]);
  const [savingSummary, setSavingSummary] = useState(false);

  useEffect(() => {
    if (!issueKey) return;
    setLoading(true);
    getIssue(issueKey).then(data => {
      const parsed = parseIssue(data);
      // Fetch comments with ADF-to-HTML conversion
      parsed.comments = (data.fields.comment && data.fields.comment.comments || []).map(c => ({
        id: c.id,
        author: c.author ? c.author.displayName : '',
        body: (() => {
          const raw = c.body;
          if (!raw) return '';
          if (typeof raw === 'string') return adfToHtml(raw) || raw;
          return adfToHtml(raw) || JSON.stringify(raw);
        })(),
        created: c.created
      }));
      if (data.fields.renderedFields && data.fields.renderedFields.description) {
        parsed.description = data.fields.renderedFields.description;
      }
      setIssue(parsed);
      setSummary(parsed.summary);
      setLoading(false);
    }).catch(err => {
      addToast('Failed: ' + err.message, 'error');
      setLoading(false);
    });

    getTransitions(issueKey).then(setTransitions).catch(() => {});
  }, [issueKey]);

  if (!issueKey) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{issueKey}</h2>
          <div className="drawer-header-actions">
            <a href={`${getConfig().url}/browse/${issueKey}`} target="_blank" rel="noopener noreferrer" className="drawer-jira-link">Open in JIRA ↗</a>
            <button className="drawer-close" onClick={onClose}>×</button>
          </div>
        </div>
        {loading ? <div className="drawer-loading">Loading...</div> : issue ? (
          <div className="drawer-body">
            <div className="drawer-field">
              <label>Status</label>
              <div className="drawer-status-row">
                <StatusBadge status={issue.status} />
                {transitions.length > 0 && (
                  <select className="drawer-transition-select" onChange={async e => {
                    if (!e.target.value) return;
                    try { await doTransition(issueKey, e.target.value); addToast('Status updated', 'success'); } catch (err) { addToast('Failed: ' + err.message, 'error'); }
                  }} defaultValue="">
                    <option value="" disabled>Transition...</option>
                    {transitions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="drawer-field">
              <label>Summary</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={summary} onChange={e => setSummary(e.target.value)} style={{ flex: 1 }} />
                <button className="drawer-save-btn" style={{ width: 'auto', padding: '6px 12px', margin: 0 }} disabled={savingSummary} onClick={async () => {
                  setSavingSummary(true);
                  try { await updateIssue(issueKey, { summary }); addToast('Saved', 'success'); } catch (err) { addToast('Failed: ' + err.message, 'error'); }
                  setSavingSummary(false);
                }}>{savingSummary ? '...' : 'Save'}</button>
              </div>
            </div>
            <div className="drawer-field">
              <label>Description</label>
              <div className="drawer-desc-rendered" dangerouslySetInnerHTML={{ __html: adfToHtml(issue.description) || '<em>No description</em>' }} />
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
            {(() => {
              const parentChain = [];
              let current = issue;
              while (current && (current.parent_key || current.epic_key)) {
                const parentKey = current.parent_key || current.epic_key;
                const parent = issues.find(i => i.key === parentKey);
                if (!parent || parent.key === current.key) break;
                parentChain.push(parent);
                current = parent;
              }
              const children = issues.filter(i => i.parent_key === issue.key || i.epic_key === issue.key);
              if (parentChain.length === 0 && children.length === 0) return null;
              return (
                <details className="drawer-section drawer-hierarchy">
                  <summary>Hierarchy ({parentChain.length + children.length})</summary>
                  {parentChain.length > 0 && (
                    <div className="hierarchy-group">
                      <div className="hierarchy-label">Parents</div>
                      {parentChain.map(p => (
                        <div key={p.key} className="hierarchy-item parent" onClick={() => { }} style={{ cursor: 'pointer' }}>
                          <span className="hierarchy-key">{p.key}</span>
                          <span className="hierarchy-summary">{p.summary}</span>
                          <StatusBadge status={p.status} />
                        </div>
                      ))}
                    </div>
                  )}
                  {children.length > 0 && (
                    <div className="hierarchy-group">
                      <div className="hierarchy-label">Children ({children.length})</div>
                      {children.map(c => (
                        <div key={c.key} className="hierarchy-item child">
                          <span className="hierarchy-key">{c.key}</span>
                          <span className="hierarchy-summary">{c.summary}</span>
                          <StatusBadge status={c.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              );
            })()}

            <div className="drawer-section">
              <h3>Comments</h3>
              <div className="drawer-comments">
                {(issue.comments || []).map(c => (
                  <div key={c.id} className="drawer-comment">
                    <span className="comment-author">{c.author}</span>
                    <span className="comment-date">{new Date(c.created).toLocaleString()}</span>
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: c.body || '<em>No content</em>' }} />
                  </div>
                ))}
                {(issue.comments || []).length === 0 && <div className="drawer-loading" style={{ padding: 10, fontSize: 12 }}>No comments yet.</div>}
              </div>
            </div>
          </div>
        ) : <div className="drawer-loading">Issue not found</div>}
      </div>
    </div>
  );
}

// Main App
export default function AppStatic() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('jira_config') || '{}');
      if (saved.url && saved.email && saved.token) return saved;
    } catch { }
    return null;
  });
  const [issues, setIssues] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [filters, setFilters] = useState({ assignee: true, reporter: true, tester: true });
  const [statusFilter, setStatusFilter] = useState({});
  const [sprintFilter, setSprintFilter] = useState({});
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('tickets');
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const { toasts, addToast } = useSimpleToast();

  const doSync = useCallback(async (silent) => {
    if (!config) return;
    setSyncing(true);
    try {
      // Discover custom fields
      const user = await getCurrentUser();
      let testerField = '', requestedByField = '', startDateField = '', sprintField = '';
      try {
        const fields = await getCustomFields();
        const tester = fields.find(f => f.name.toLowerCase() === 'tester');
        const requestedBy = fields.find(f => f.name.toLowerCase() === 'requested by');
        const startDate = fields.find(f => f.name.toLowerCase() === 'start date');
        const sprint = fields.find(f => f.name.toLowerCase() === 'sprint');
        testerField = tester ? tester.key : '';
        requestedByField = requestedBy ? requestedBy.key : '';
        startDateField = startDate ? startDate.key : '';
        sprintField = sprint ? sprint.key : '';
      } catch (e) { /* ignore field discovery errors */ }

      // Update config with discovered fields
      const newCfg = { ...config, testerField, requestedByField, startDateField, sprintField, accountId: user.accountId };
      localStorage.setItem('jira_config', JSON.stringify(newCfg));
      setConfig(newCfg);

      // Build JQL
      const defaultJql = `(assignee = ${user.accountId} OR reporter = ${user.accountId}${testerField ? ` OR ${testerField} = ${user.accountId}` : ''}) ORDER BY updated DESC`;
      const jql = config.jql || defaultJql;

      console.log('Syncing with JQL:', jql);
      const raw = await searchIssuesAll(jql);
      const parsed = raw.map(parseIssue);
      setIssues(parsed);
      setLastSync(new Date());

      // Set default status filter (all except Done) on first load
      if (!silent) {
        const defaults = {};
        const TWO_COL_ORDER = ['Backlog','UAT','To Do','Ready for deployment','In Progress','Done','Ready for UAT','On Hold'];
        for (const i of parsed) {
          if (!i.status) continue;
          const norm = TWO_COL_ORDER.find(s => s.toLowerCase() === i.status.toLowerCase()) || i.status;
          if (norm.toLowerCase() !== 'done') defaults[norm] = true;
        }
        setStatusFilter(defaults);
      }

      if (!silent) addToast(`Loaded ${parsed.length} issues`, 'success');
    } catch (err) {
      if (!silent) addToast('Sync failed: ' + err.message, 'error');
    }
    setSyncing(false);
  }, [config]);

  // Initial sync
  useEffect(() => {
    if (config) {
      doSync(false);
      const interval = setInterval(() => doSync(true), 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, []);

  if (!config) {
    return <ConfigScreen onConfigured={(cfg) => { setConfig(cfg); setTimeout(() => doSync(false), 100); }} />;
  }

  const sharedFilterProps = {
    search, onSearchChange: setSearch,
    filters, onFiltersChange: setFilters,
    statusFilter, onStatusFilterChange: setStatusFilter,
    sprintFilter, onSprintFilterChange: setSprintFilter,
    typeFilter, onTypeFilterChange: setTypeFilter,
    priorityFilter, onPriorityFilterChange: setPriorityFilter,
    projectFilter, onProjectFilterChange: setProjectFilter,
  };

  function clearAllFilters() {
    setFilters({ assignee: false, reporter: false, tester: false });
    setStatusFilter({});
    setSprintFilter({});
    setTypeFilter('');
    setPriorityFilter('');
    setProjectFilter({});
    setSearch('');
  }

  function resetToUndone() {
    const undone = {};
    const TWO_COL_ORDER = ['Backlog','UAT','To Do','Ready for deployment','In Progress','Done','Ready for UAT','On Hold'];
    for (const i of issues) {
      if (!i.status) continue;
      const norm = TWO_COL_ORDER.find(s => s.toLowerCase() === i.status.toLowerCase()) || i.status;
      if (norm.toLowerCase() !== 'done') undone[norm] = true;
    }
    setStatusFilter(undone);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>JIRA Dashboard</h1>
        <div className="header-actions">
          <span className="sync-status">
            {lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : 'Not synced'}
          </span>
          <button className="sync-btn" onClick={() => setShowCreate(true)}>+ New Issue</button>
          <button className="sync-btn" onClick={() => doSync(false)} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</button>

        </div>
      </header>
      <div className="app-tabs">
        <button className={`app-tab ${tab === 'tickets' ? 'active' : ''}`} onClick={() => setTab('tickets')}>Tickets</button>
        <button className={`app-tab ${tab === 'metrics' ? 'active' : ''}`} onClick={() => setTab('metrics')}>Metrics</button>
        <button className={`app-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>Timeline</button>
        <button className={`app-tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>Setup</button>
      </div>
      <div className="app-main">
        {tab !== 'timeline' && (
          <div className="app-sidebar">
            <div className="filter-bar">
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="filter-search" />

              <div className="filter-section">
                <div className="filter-section-label">Role</div>
                <div className="filter-chips">
                  {[
                    { key: 'assignee', label: 'Assignee' },
                    { key: 'reporter', label: 'Reporter' },
                    { key: 'tester', label: 'Tester' },
                  ].map(({ key, label }) => (
                    <button key={key} className={`filter-chip ${filters[key] ? 'active' : ''}`}
                      onClick={() => setFilters({ ...filters, [key]: !filters[key] })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status chips */}
              {(() => {
                const allStatuses = [...new Set(issues.map(i => i.status).filter(Boolean))];
                const TWO_COL_ORDER = ['Backlog','UAT','To Do','Ready for deployment','In Progress','Done','Ready for UAT','On Hold'];
                const ordered = [...new Set([
                  ...TWO_COL_ORDER.filter(s => allStatuses.some(a => a.toLowerCase() === s.toLowerCase())),
                  ...allStatuses.filter(a => !TWO_COL_ORDER.some(s => s.toLowerCase() === a.toLowerCase())).sort()
                ])];
                return (
                  <div className="filter-section">
                    <div className="filter-section-label">Status</div>
                    <div className="filter-chips">
                      {ordered.map(s => {
                        const sc = getStatusColor(s);
                        const active = statusFilter[s];
                        return (
                          <button key={s} className={`filter-chip ${active ? 'active' : ''}`}
                            onClick={() => setStatusFilter({ ...statusFilter, [s]: !active })}
                            style={active ? { backgroundColor: sc.bg, borderColor: sc.border, color: sc.text, fontWeight: 600 } : {}}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Project filter */}
              {(() => {
                const projects = [...new Set(issues.map(i => i.project_key).filter(Boolean))].sort();
                if (!projects.length) return null;
                const activeCount = Object.values(projectFilter).filter(Boolean).length;
                return (
                  <div className="filter-section">
                    <label className="filter-section-label">Project</label>
                    <div className="multi-select" tabIndex="0" onBlur={e => {
                      if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('open');
                    }}>
                      <div className="multi-select-trigger" onClick={e => {
                        e.currentTarget.parentElement.classList.toggle('open');
                      }}>
                        {activeCount > 0 ? `${activeCount} selected` : 'All projects'}
                      </div>
                      <div className="multi-select-dropdown">
                        {projects.map(p => (
                          <label key={p} className="multi-select-option">
                            <input type="checkbox" checked={projectFilter[p] || false}
                              onChange={e => setProjectFilter({ ...projectFilter, [p]: e.target.checked })} />
                            {p}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const sprints = [...new Set(issues.flatMap(i => (i.sprint || '').split(', ').filter(Boolean)))].sort();
                if (!sprints.length) return null;
                const activeCount = Object.values(sprintFilter).filter(Boolean).length;
                return (
                  <div className="filter-section">
                    <label className="filter-section-label">Sprint</label>
                    <div className="multi-select" tabIndex="0" onBlur={e => {
                      if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('open');
                    }}>
                      <div className="multi-select-trigger" onClick={e => {
                        e.currentTarget.parentElement.classList.toggle('open');
                      }}>
                        {activeCount > 0 ? `${activeCount} selected` : 'All sprints'}
                      </div>
                      <div className="multi-select-dropdown">
                        {sprints.map(s => (
                          <label key={s} className="multi-select-option">
                            <input type="checkbox" checked={sprintFilter[s] || false}
                              onChange={e => setSprintFilter({ ...sprintFilter, [s]: e.target.checked })} />
                            {s}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const types = [...new Set(issues.map(i => i.issue_type).filter(Boolean))].sort();
                return (
                  <div className="filter-section">
                    <label className="filter-section-label">Type</label>
                    <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                      <option value="">All</option>
                      {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                );
              })()}

              {(() => {
                const priorities = [...new Set(issues.map(i => i.priority).filter(Boolean))].sort();
                return (
                  <div className="filter-section">
                    <label className="filter-section-label">Priority</label>
                    <select className="filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                      <option value="">All</option>
                      {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                );
              })()}

              <div className="filter-actions">
                <button className="filter-undone-btn" onClick={resetToUndone}>Undone</button>
                <button className="filter-clear-btn" onClick={clearAllFilters}>Clear All</button>
              </div>
            </div>
          </div>
        )}
        <div className="app-content">
          {tab === 'tickets' ? (
            <Dashboard {...sharedFilterProps} issues={issues} onSelectIssue={setSelectedKey} selectedKey={selectedKey} />
          ) : tab === 'metrics' ? (
            <MetricsDashboard {...sharedFilterProps} issues={issues} onSelectIssue={setSelectedKey} />
          ) : tab === 'timeline' ? (
            <Timeline onSelectIssue={setSelectedKey} />
          ) : (
            <div className="setup">
              <div className="setup-section">
                <h3>Current JQL</h3>
                <textarea className="setup-jql-input" value={config.jql || ''} onChange={e => {
                  const newCfg = { ...config, jql: e.target.value };
                  localStorage.setItem('jira_config', JSON.stringify(newCfg));
                  setConfig(newCfg);
                }} rows={4} spellCheck={false} placeholder="Leave blank for default" />
                <p className="setup-hint" style={{ marginTop: 8 }}>Default: issues where you are assignee, reporter, or tester</p>
                <div style={{ marginTop: 12 }}>
                  <button className="setup-btn setup-sync" onClick={() => doSync(false)}>Save & Sync Now</button>
                  <button className="setup-btn setup-save" style={{ marginLeft: 8 }} onClick={() => { localStorage.removeItem('jira_config'); setConfig(null); }}>Disconnect</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {tab !== 'setup' && <DetailDrawerStatic issueKey={selectedKey} issues={issues} onClose={() => setSelectedKey(null)} addToast={addToast} />}
      {showCreate && (
        <CreateIssueModal issues={issues} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); doSync(true); }} />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
