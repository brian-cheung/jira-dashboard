import { useState, useMemo, useCallback } from 'react';
import StatusBadge, { getStatusColor } from './StatusBadge';
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
    map[issue.key] = { ...issue, children: [], depth: 0, parentKey: null };
  }

  for (const key in map) {
    const node = map[key];
    if (node.parent_key && map[node.parent_key]) {
      map[node.parent_key].children.push(node);
      node.parentKey = node.parent_key;
    } else if (node.epic_key && map[node.epic_key]) {
      map[node.epic_key].children.push(node);
      node.parentKey = node.epic_key;
    } else {
      roots.push(node);
    }
  }

  function assignDepth(node, depth) {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    assignDepth(root, 0);
  }

  return { roots, map };
}

export default function Dashboard({
  issues, filters, statusFilter, sprintFilter, typeFilter, priorityFilter,
  search, onSelectIssue, selectedKey
}) {
  const [sortField, setSortField] = useState('key');
  const [sortDir, setSortDir] = useState('asc');
  const [hierarchyView, setHierarchyView] = useState(true);
  const [collapsed, setCollapsed] = useState({});

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

      const matchesSprint = !sprintFilter || (i.sprint && i.sprint.includes(sprintFilter));
      const matchesType = !typeFilter || i.issue_type === typeFilter;
      const matchesPriority = !priorityFilter || i.priority === priorityFilter;

      return matchesSearch && matchesRole && matchesStatus && matchesSprint && matchesType && matchesPriority;
    });
  }, [issues, search, filters, statusFilter, sprintFilter, typeFilter, priorityFilter]);

  const displayList = useMemo(() => {
    if (!hierarchyView) {
      const arr = [...filtered];
      arr.sort((a, b) => {
        const aVal = (a[sortField] || '').toString().toLowerCase();
        const bVal = (b[sortField] || '').toString().toLowerCase();
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      return arr.map(i => ({ ...i, depth: 0, hasChildren: false, hidden: false }));
    }

    const { roots, map } = buildTree(filtered);
    const flat = [];
    function flatten(node) {
      flat.push(node);
      if (!collapsed[node.key]) {
        for (const child of node.children) {
          flatten(child);
        }
      }
    }
    for (const root of roots) {
      flatten(root);
    }
    return flat.map(n => ({
      ...n,
      hasChildren: n.children && n.children.length > 0,
    }));
  }, [filtered, hierarchyView, sortField, sortDir, collapsed]);

  const toggleCollapse = useCallback((key, e) => {
    e.stopPropagation();
    setCollapsed(c => ({ ...c, [key]: !c[key] }));
  }, []);

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
        <div className="dash-toolbar-actions">
          {hierarchyView && <button className="dash-btn" onClick={() => setCollapsed({})}>Expand All</button>}
          {hierarchyView && <button className="dash-btn" onClick={() => {
            const all = {};
            displayList.forEach(i => { if (i.hasChildren) all[i.key] = true; });
            setCollapsed(all);
          }}>Collapse All</button>}
          <label className="dash-hierarchy-toggle">
            <input type="checkbox" checked={hierarchyView} onChange={e => setHierarchyView(e.target.checked)} />
            Hierarchy
          </label>
        </div>
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
            {displayList.map(i => {
              const statusColor = getStatusColor(i.status);
              return (
                <tr
                  key={i.key}
                  className={`dash-row ${selectedKey === i.key ? 'dash-row-selected' : ''} ${i.issue_type === 'Epic' ? 'dash-row-epic' : ''}`}
                  style={{ borderLeft: `3px solid ${statusColor.border}` }}
                  onClick={() => onSelectIssue(i.key)}
                >
                  <td className="dash-key" style={{ paddingLeft: i.depth * 16 + 8 }}>
                    <span className="dash-expand" onClick={e => i.hasChildren && toggleCollapse(i.key, e)}>
                      {i.hasChildren ? (collapsed[i.key] ? '▶' : '▼') : ''}
                    </span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
