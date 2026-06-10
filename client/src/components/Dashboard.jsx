import { useState, useMemo, useCallback } from 'react';
import StatusBadge from './StatusBadge';

const TYPE_COLORS = {
  'Epic':     '#6554C0',
  'Story':    '#00875A',
  'Task':     '#0052CC',
  'Subtask':  '#0052CC',
  'Bug':      '#DE350B',
};
import './Dashboard.css';

const SORT_FIELDS = {
  key: 'Key',
  summary: 'Summary',
  status: 'Status',
  assignee_name: 'Assignee',
  reporter_name: 'Reporter',
  tester_name: 'Tester',
  due_date: 'Due Date',
  created: 'Created',
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

const ALL_COLUMNS = [
  { key: 'key', label: 'Key' },
  { key: 'summary', label: 'Summary' },
  { key: 'status', label: 'Status' },
  { key: 'assignee_name', label: 'Assignee' },
  { key: 'reporter_name', label: 'Reporter' },
  { key: 'tester_name', label: 'Tester' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'created', label: 'Created' },
  { key: 'priority', label: 'Priority' },
  { key: 'issue_type', label: 'Type' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'fix_versions', label: 'Fix Versions' },
];

function loadColumnPrefs() {
  try {
    return JSON.parse(localStorage.getItem('visibleColumns') || 'null');
  } catch { return null; }
}

function saveColumnPrefs(cols) {
  localStorage.setItem('visibleColumns', JSON.stringify(cols));
}

export default function Dashboard({
  issues, filters, statusFilter, sprintFilter, typeFilter, priorityFilter,
  search, onSelectIssue, selectedKey
}) {
  const [sortField, setSortField] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [hierarchyView, setHierarchyView] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = loadColumnPrefs();
    if (saved) return saved;
    const defaults = {};
    ALL_COLUMNS.forEach(c => { defaults[c.key] = true; });
    return defaults;
  });

  function toggleColumn(key) {
    const next = { ...visibleColumns, [key]: !visibleColumns[key] };
    setVisibleColumns(next);
    saveColumnPrefs(next);
  }

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

      const activeStatuses = Object.entries(statusFilter || {}).filter(([, v]) => v).map(([k]) => k.toLowerCase());
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes((i.status || '').toLowerCase());

      const activeSprints = Object.entries(sprintFilter || {}).filter(([, v]) => v).map(([k]) => k);
      const matchesSprint = activeSprints.length === 0 || (i.sprint && activeSprints.some(s => i.sprint.includes(s)));
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
          <div className="dash-col-picker" style={{ position: 'relative' }}>
            <button className="dash-btn" onClick={() => setColPickerOpen(!colPickerOpen)}>Columns</button>
            {colPickerOpen && (
              <div className="col-picker-dropdown" onMouseLeave={() => setColPickerOpen(false)}>
                {ALL_COLUMNS.map(c => (
                  <label key={c.key} className="col-picker-option">
                    <input
                      type="checkbox"
                      checked={visibleColumns[c.key]}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              {ALL_COLUMNS.filter(c => visibleColumns[c.key]).map(c => (
                <th key={c.key} onClick={() => handleSort(c.key)} className={!hierarchyView && sortField === c.key ? `sorted-${sortDir}` : ''}>
                  {c.label} {!hierarchyView && sortField === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayList.map(i => {
              const typeColor = TYPE_COLORS[i.issue_type] || '#DFE1E6';
              return (
                <tr
                  key={i.key}
                  className={`dash-row ${selectedKey === i.key ? 'dash-row-selected' : ''} ${i.issue_type === 'Epic' ? 'dash-row-epic' : ''}`}
                  style={{ borderLeft: `3px solid ${typeColor}` }}
                  onClick={() => onSelectIssue(i.key)}
                >
                  {visibleColumns.key && (
                    <td className="dash-key" style={{ paddingLeft: i.depth * 16 + 8 }}>
                      <span className="dash-expand" onClick={e => i.hasChildren && toggleCollapse(i.key, e)}>
                        {i.hasChildren ? (collapsed[i.key] ? '▶' : '▼') : ''}
                      </span>
                      <a href={`https://executivecentre.atlassian.net/browse/${i.key}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        {i.key}
                      </a>
                    </td>
                  )}
                  {visibleColumns.summary && <td className="dash-summary">{i.summary}</td>}
                  {visibleColumns.status && <td><StatusBadge status={i.status} /></td>}
                  {visibleColumns.assignee_name && <td>{i.assignee_name || '-'}</td>}
                  {visibleColumns.reporter_name && <td>{i.reporter_name || '-'}</td>}
                  {visibleColumns.tester_name && <td>{i.tester_name || '-'}</td>}
                  {visibleColumns.due_date && <td className="dash-date">{i.due_date ? i.due_date.split('T')[0] : '-'}</td>}
                  {visibleColumns.created && <td className="dash-date">{i.created ? i.created.split('T')[0] : '-'}</td>}
                  {visibleColumns.priority && <td>{i.priority || '-'}</td>}
                  {visibleColumns.issue_type && <td>{i.issue_type || '-'}</td>}
                  {visibleColumns.sprint && <td className="dash-sprint">{i.sprint || '-'}</td>}
                  {visibleColumns.fix_versions && <td>{i.fix_versions || '-'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
