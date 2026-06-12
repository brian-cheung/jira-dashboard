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

function MultiSelectFilter({ label, items, selected, onChange }) {
  const activeCount = Object.values(selected).filter(Boolean).length;
  return (
    <div className="filter-section">
      <label className="filter-section-label">{label}</label>
      <div className="multi-select" tabIndex="0" onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('open');
      }}>
        <div className="multi-select-trigger" onClick={e => {
          e.currentTarget.parentElement.classList.toggle('open');
        }}>
          {activeCount > 0 ? `${activeCount} selected` : 'All ' + label.toLowerCase()}
        </div>
        <div className="multi-select-dropdown">
          {items.map(item => (
            <label key={item} className="multi-select-option">
              <input type="checkbox" checked={selected[item] || false}
                onChange={e => onChange({ ...selected, [item]: e.target.checked })} />
              {item}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function DropdownFilter({ label, items, selected, onChange }) {
  return (
    <div className="filter-section">
      <label className="filter-section-label">{label}</label>
      <select
        className="filter-select"
        value={selected}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">All</option>
        {items.map(item => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
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
  projectFilter, onProjectFilterChange,
  issues,
  onClearAll,
  onResetUndone
}) {
  const { statuses, sprints, types, priorities, projects } = useMemo(() => {
    const sSet = new Set();
    const spSet = new Set();
    const tSet = new Set();
    const pSet = new Set();
    const prSet = new Set();
    for (const i of issues || []) {
      if (i.status) sSet.add(i.status);
      if (i.sprint) i.sprint.split(', ').forEach(x => x && spSet.add(x));
      if (i.issue_type) tSet.add(i.issue_type);
      if (i.priority) pSet.add(i.priority);
      if (i.project_key) prSet.add(i.project_key);
    }
    return {
      statuses: [...sSet].sort(),
      sprints: [...spSet].sort(),
      types: [...tSet].sort(),
      priorities: [...pSet].sort(),
      projects: [...prSet].sort(),
    };
  }, [issues]);

  const roles = [
    { key: 'assignee', label: 'Assignee' },
    { key: 'reporter', label: 'Reporter' },
    { key: 'tester', label: 'Tester' },
  ];

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
        <div className="filter-chips-inline">
          {roles.map(({ key, label }) => (
            <button key={key} className={`filter-chip ${filters[key] ? 'active' : ''}`}
              onClick={() => onFiltersChange({ ...filters, [key]: !filters[key] })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ChipGroup label="Status" items={statuses} selected={statusFilter} onChange={onStatusFilterChange} />
      {projects.length > 0 && (
        <MultiSelectFilter label="Project" items={projects} selected={projectFilter} onChange={onProjectFilterChange} />
      )}
      <DropdownFilter label="Sprint" items={sprints} selected={sprintFilter} onChange={onSprintFilterChange} />
      <DropdownFilter label="Type" items={types} selected={typeFilter} onChange={onTypeFilterChange} />
      <DropdownFilter label="Priority" items={priorities} selected={priorityFilter} onChange={onPriorityFilterChange} />

      <div className="filter-actions">
        <button className="filter-undone-btn" onClick={onResetUndone}>Undone</button>
        <button className="filter-clear-btn" onClick={onClearAll}>Clear All</button>
      </div>
    </div>
  );
}
