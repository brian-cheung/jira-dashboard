import { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import './HierarchyTree.css';

function buildTree(issues) {
  const map = {};
  const epics = [];

  for (const issue of issues) {
    map[issue.key] = { ...issue, children: [] };
  }

  for (const key in map) {
    const node = map[key];
    if (node.parent_key && map[node.parent_key]) {
      map[node.parent_key].children.push(node);
    } else if (node.epic_key && map[node.epic_key]) {
      map[node.epic_key].children.push(node);
    } else if (node.issue_type === 'Epic') {
      epics.push(node);
    } else {
      epics.push(node);
    }
  }

  return epics;
}

function TreeNode({ node, depth, selectedKey, onSelect }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${selectedKey === node.key ? 'tree-row-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => onSelect(node.key)}
      >
        <span className="tree-expand" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
          {hasChildren ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span className="tree-key">{node.key}</span>
        <span className="tree-summary">{node.summary}</span>
        <StatusBadge status={node.status} />
        {node.sprint && <span className="tree-sprint-tag">{node.sprint}</span>}
      </div>
      {expanded && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default function HierarchyTree({ issues, filters, onSelectIssue, selectedKey }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return issues.filter(i => {
      const matchesSearch = !search ||
        i.key.toLowerCase().includes(search.toLowerCase()) ||
        i.summary.toLowerCase().includes(search.toLowerCase());

      const roleChecks = [];
      if (filters.assignee) roleChecks.push(i.assignee_name);
      if (filters.reporter) roleChecks.push(i.reporter_name);
      if (filters.tester) roleChecks.push(i.tester_name);

      const matchesRole = roleChecks.length === 0 || roleChecks.some(Boolean);

      return matchesSearch && matchesRole;
    });
  }, [issues, search, filters]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  return (
    <div className="hierarchy-tree">
      <div className="tree-filter-bar">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="tree-search"
        />
      </div>
      <div className="tree-list">
        {tree.map(node => (
          <TreeNode
            key={node.key}
            node={node}
            depth={0}
            selectedKey={selectedKey}
            onSelect={onSelectIssue}
          />
        ))}
        {tree.length === 0 && (
          <div className="tree-empty">No issues found</div>
        )}
      </div>
    </div>
  );
}
