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

function buildTree(issues) {
  const map = {};
  const roots = [];

  for (const issue of issues) {
    map[issue.key] = { ...issue, children: [], depth: 0 };
  }

  for (const key in map) {
    const node = map[key];
    if (node.parent_key && map[node.parent_key]) {
      map[node.parent_key].children.push(node);
    } else if (node.epic_key && map[node.epic_key]) {
      map[node.epic_key].children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Assign depths
  function assignDepth(node, depth) {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    assignDepth(root, 0);
  }

  // Flatten in tree order
  const flat = [];
  function flatten(node) {
    flat.push(node);
    for (const child of node.children) {
      flatten(child);
    }
  }
  for (const root of roots) {
    flatten(root);
  }

  return flat;
}

function matchesChipFilter(value, filter) {
  const active = Object.entries(filter || {}).filter(([, v]) => v).map(([k]) => k);
  if (active.length === 0) return true;
  if (!value) return false;
  // Sprint can be comma-separated
  const values = value.split(', ');
  return values.some(v => active.includes(v));
}

export default function Dashboard({
  issues, filters, statusFilter, sprintFilter, typeFilter, priorityFilter,
  search, onSelectIssue, selectedKey
}) {
  const [sortField, setSortField] = useState('key');
  const [sortDir, setSortDir] = useState('asc');
  const [hierarchyView, setHierarchyView] = useState(true);

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

      const activeStatuses = Object.entries(statusFilter || {}).filter(([, v]) => v).map(([k]) => k);
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(i.status);

      const matchesSprint = matchesChipFilter(i.sprint, sprintFilter);
      const matchesType = matchesChipFilter(i.issue_type, typeFilter);
      const matchesPriority = matchesChipFilter(i.priority, priorityFilter);

      return matchesSearch && matchesRole && matchesStatus && matchesSprint && matchesType && matchesPriority;
    });
  }, [issues, search, filters, statusFilter, sprintFilter, typeFilter, priorityFilter]);

  const displayList = useMemo(() => {
    if (hierarchyView) {
      return buildTree(filtered);
    }
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr.map(i => ({ ...i, depth: 0 }));
  }, [filtered, hierarchyView, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setHierarchyView(false);
  }

  return (
    <div className="dashboard">
      <div className="dash-toolbar">
        <span className="dash-count">{filtered.length} of {issues.length} tickets</span>
        <label className="dash-hierarchy-toggle">
          <input type="checkbox" checked={hierarchyView} onChange={e => setHierarchyView(e.target.checked)} />
          Hierarchy
        </label>
      </div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              {Object.entries(SORT_FIELDS).map(([field, label]) => (
                <th key={field} onClick={() => handleSort(field)} className={!hierarchyView && sortField === field ? `sorted-${sortDir}` : ''}>
                  {label} {!hierarchyView && sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayList.map(i => (
              <tr
                key={i.key}
                className={`dash-row ${selectedKey === i.key ? 'dash-row-selected' : ''} ${i.issue_type === 'Epic' ? 'dash-row-epic' : ''}`}
                onClick={() => onSelectIssue(i.key)}
              >
                <td className="dash-key" style={{ paddingLeft: i.depth * 16 + 10 }}>
                  {i.depth > 0 && <span className="dash-tree-line">{'└ '.repeat(Math.min(i.depth, 3))}</span>}
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
