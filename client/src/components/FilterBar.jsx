import { useMemo } from 'react';
import './FilterBar.css';

function ChipGroup({ label, items, selected, onChange }) {
  return (
    <div className="filter-section">
      <div className="filter-section-label">{label}</div>
      <div className="filter-chips">
        {items.map(item => (
          <label key={item} className={`filter-chip ${selected[item] ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={selected[item] || false}
              onChange={e => onChange({ ...selected, [item]: e.target.checked })}
            />
            {item}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FilterBar({
  search, onSearchChange,
  filters, onFiltersChange,
  statusFilter, onStatusFilterChange,
  sprintFilter, onSprintFilterChange,
  typeFilter, onTypeFilterChange,
  priorityFilter, onPriorityFilterChange,
  issues
}) {
  const { statuses, sprints, types, priorities } = useMemo(() => {
    const sSet = new Set();
    const spSet = new Set();
    const tSet = new Set();
    const pSet = new Set();
    for (const i of issues || []) {
      if (i.status) sSet.add(i.status);
      if (i.sprint) i.sprint.split(', ').forEach(x => x && spSet.add(x));
      if (i.issue_type) tSet.add(i.issue_type);
      if (i.priority) pSet.add(i.priority);
    }
    return {
      statuses: [...sSet].sort(),
      sprints: [...spSet].sort(),
      types: [...tSet].sort(),
      priorities: [...pSet].sort(),
    };
  }, [issues]);

  return (
    <div className="filter-bar">
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        className="filter-search"
      />

      <div className="filter-section">
        <div className="filter-section-label">Role</div>
        <div className="filter-toggles">
          {['assignee', 'reporter', 'tester'].map(role => (
            <label key={role} className="filter-toggle">
              <input
                type="checkbox"
                checked={filters[role]}
                onChange={e => onFiltersChange({ ...filters, [role]: e.target.checked })}
              />
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <ChipGroup label="Status" items={statuses} selected={statusFilter} onChange={onStatusFilterChange} />
      <ChipGroup label="Sprint" items={sprints} selected={sprintFilter} onChange={onSprintFilterChange} />
      <ChipGroup label="Type" items={types} selected={typeFilter} onChange={onTypeFilterChange} />
      <ChipGroup label="Priority" items={priorities} selected={priorityFilter} onChange={onPriorityFilterChange} />
    </div>
  );
}
