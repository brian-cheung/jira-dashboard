import { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import './Dashboard.css';

const SORT_FIELDS = {
  key: 'Key',
  summary: 'Summary',
  status: 'Status',
  assignee_name: 'Assignee',
  reporter_name: 'Reporter',
  tester_name: 'Tester',
  due_date: 'Due Date',
  priority: 'Priority',
  issue_type: 'Type',
  sprint: 'Sprint',
  fix_versions: 'Fix Versions',
};

export default function Dashboard({ issues, filters, statusFilter, search, onSelectIssue, selectedKey }) {
  const [sortField, setSortField] = useState('key');
  const [sortDir, setSortDir] = useState('asc');

  const filtered = useMemo(() => {
    return issues.filter(i => {
      const matchesSearch = !search ||
        i.key.toLowerCase().includes(search.toLowerCase()) ||
        (i.summary || '').toLowerCase().includes(search.toLowerCase());

      const roleChecks = [];
      if (filters.assignee) roleChecks.push(i.assignee_name);
      if (filters.reporter) roleChecks.push(i.reporter_name);
      if (filters.tester) roleChecks.push(i.tester_name);
      const matchesRole = roleChecks.length === 0 || roleChecks.some(Boolean);

      // Status filter: if any statuses are checked, only show those
      const activeStatuses = Object.entries(statusFilter || {}).filter(([, v]) => v).map(([k]) => k);
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(i.status);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [issues, search, filters, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  return (
    <div className="dashboard">
      <div className="dash-count">{filtered.length} of {issues.length} tickets</div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              {Object.entries(SORT_FIELDS).map(([field, label]) => (
                <th key={field} onClick={() => handleSort(field)} className={sortField === field ? `sorted-${sortDir}` : ''}>
                  {label} {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(i => (
              <tr
                key={i.key}
                className={`dash-row ${selectedKey === i.key ? 'dash-row-selected' : ''}`}
                onClick={() => onSelectIssue(i.key)}
              >
                <td className="dash-key">
                  <a href={`https://executivecentre.atlassian.net/browse/${i.key}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    {i.key}
                  </a>
                </td>
                <td className="dash-summary">{i.summary}</td>
                <td><StatusBadge status={i.status} /></td>
                <td>{i.assignee_name || '-'}</td>
                <td>{i.reporter_name || '-'}</td>
                <td>{i.tester_name || '-'}</td>
                <td className="dash-date">{i.due_date ? i.due_date.split('T')[0] : '-'}</td>
                <td>{i.priority || '-'}</td>
                <td>{i.issue_type || '-'}</td>
                <td className="dash-sprint">{i.sprint || '-'}</td>
                <td>{i.fix_versions || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
