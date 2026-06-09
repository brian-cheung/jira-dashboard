import { useMemo } from 'react';
import StatusBadge, { getStatusColor } from './StatusBadge';
import './MetricsDashboard.css';

export default function MetricsDashboard({ issues, onSelectIssue }) {
  const metrics = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const byStatus = {};
    const byAssignee = {};
    const byType = {};
    const byPriority = {};
    let overdue = [];
    let noDueDate = [];
    let blocked = [];
    let recent = [];

    for (const i of issues) {
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
      const a = i.assignee_name || 'Unassigned';
      byAssignee[a] = (byAssignee[a] || 0) + 1;
      byType[i.issue_type] = (byType[i.issue_type] || 0) + 1;
      byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;

      if (i.due_date && i.due_date < today && i.status !== 'Done') {
        overdue.push(i);
      }
      if (!i.due_date && i.status !== 'Done') {
        noDueDate.push(i);
      }
      if (i.status === 'Blocked' || i.status === 'On Hold') {
        blocked.push(i);
      }
      if (i.updated) {
        const updated = new Date(i.updated);
        const daysSince = (now - updated) / (1000 * 60 * 60 * 24);
        if (daysSince <= 7 && i.status !== 'Done') {
          recent.push(i);
        }
      }
    }

    const statusKeys = Object.keys(byStatus).sort();
    const total = issues.length;
    const done = byStatus['Done'] || 0;
    const open = total - done;
    const assigneeSorted = Object.entries(byAssignee).sort((a, b) => b[1] - a[1]);
    const maxAssignee = assigneeSorted[0] ? assigneeSorted[0][1] : 1;

    return {
      total, open, done,
      overdue, noDueDate, blocked, recent,
      byStatus, statusKeys, byType, byPriority,
      assigneeSorted, maxAssignee,
    };
  }, [issues]);

  const needsAttention = useMemo(() => {
    const seen = new Set();
    const items = [];
    const add = (i, reason) => {
      if (!seen.has(i.key)) { seen.add(i.key); items.push({ ...i, _reason: reason }); }
    };
    for (const i of metrics.overdue) add(i, 'Overdue');
    for (const i of metrics.blocked) add(i, 'Blocked / On Hold');
    for (const i of metrics.noDueDate.slice(0, 10)) add(i, 'No due date');
    return items;
  }, [metrics]);

  const maxStatus = Math.max(...Object.values(metrics.byStatus), 1);

  return (
    <div className="metrics">
      {/* Summary cards */}
      <div className="metrics-cards">
        <div className="metric-card">
          <div className="metric-value">{metrics.total}</div>
          <div className="metric-label">Total Tickets</div>
        </div>
        <div className="metric-card metric-open">
          <div className="metric-value">{metrics.open}</div>
          <div className="metric-label">Open</div>
        </div>
        <div className="metric-card metric-done">
          <div className="metric-value">{metrics.done}</div>
          <div className="metric-label">Done</div>
        </div>
        <div className="metric-card metric-overdue">
          <div className="metric-value">{metrics.overdue.length}</div>
          <div className="metric-label">Overdue</div>
        </div>
        <div className="metric-card metric-blocked">
          <div className="metric-value">{metrics.blocked.length}</div>
          <div className="metric-label">Blocked / On Hold</div>
        </div>
      </div>

      <div className="metrics-grid">
        {/* Status breakdown */}
        <div className="metrics-panel">
          <h3>By Status</h3>
          <div className="metric-bars">
            {metrics.statusKeys.map(s => (
              <div key={s} className="metric-bar-row">
                <span className="metric-bar-label">{s}</span>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill" style={{
                    width: `${(metrics.byStatus[s] / maxStatus) * 100}%`,
                    backgroundColor: getStatusColor(s).border
                  }} />
                </div>
                <span className="metric-bar-val">{metrics.byStatus[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Assignee */}
        <div className="metrics-panel">
          <h3>By Assignee</h3>
          <div className="metric-bars">
            {metrics.assigneeSorted.slice(0, 10).map(([name, count]) => (
              <div key={name} className="metric-bar-row">
                <span className="metric-bar-label">{name}</span>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill" style={{
                    width: `${(count / metrics.maxAssignee) * 100}%`,
                    backgroundColor: '#0052CC'
                  }} />
                </div>
                <span className="metric-bar-val">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Type */}
        <div className="metrics-panel">
          <h3>By Type</h3>
          <div className="metric-bars">
            {Object.entries(metrics.byType).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} className="metric-bar-row">
                <span className="metric-bar-label">{name}</span>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill" style={{
                    width: `${(count / metrics.total) * 100}%`,
                    backgroundColor: '#6554C0'
                  }} />
                </div>
                <span className="metric-bar-val">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Priority */}
        <div className="metrics-panel">
          <h3>By Priority</h3>
          <div className="metric-bars">
            {Object.entries(metrics.byPriority).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} className="metric-bar-row">
                <span className="metric-bar-label">{name || 'None'}</span>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill" style={{
                    width: `${(count / metrics.total) * 100}%`,
                    backgroundColor: '#FF8B00'
                  }} />
                </div>
                <span className="metric-bar-val">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      <div className="metrics-panel metrics-attention">
        <h3>Needs Attention ({needsAttention.length})</h3>
        <div className="attention-list">
          {needsAttention.map(i => (
            <div key={i.key} className="attention-item" onClick={() => onSelectIssue(i.key)}>
              <span className="attention-reason">{i._reason}</span>
              <a href={`https://executivecentre.atlassian.net/browse/${i.key}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{i.key}</a>
              <span className="attention-summary">{i.summary}</span>
              <StatusBadge status={i.status} />
              <span className="attention-assignee">{i.assignee_name || '-'}</span>
              <span className="attention-date">{i.due_date ? i.due_date.split('T')[0] : '-'}</span>
            </div>
          ))}
          {needsAttention.length === 0 && <div className="attention-empty">Nothing needs attention right now.</div>}
        </div>
      </div>
    </div>
  );
}
