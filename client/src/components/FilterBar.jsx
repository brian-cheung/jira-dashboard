import { useMemo } from 'react';
import './FilterBar.css';

export default function FilterBar({ search, onSearchChange, filters, onFiltersChange, statusFilter, onStatusFilterChange, issues }) {
  const statuses = useMemo(() => {
    const set = new Set();
    for (const i of issues || []) {
      if (i.status) set.add(i.status);
    }
    return [...set].sort();
  }, [issues]);

  return (
    <div className="filter-bar">
      <input
        type="text"
        placeholder="Search issues..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        className="filter-search"
      />
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
      <div className="filter-status">
        {statuses.map(s => (
          <label key={s} className={`filter-status-chip ${statusFilter[s] ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={statusFilter[s] || false}
              onChange={e => onStatusFilterChange({ ...statusFilter, [s]: e.target.checked })}
            />
            {s}
          </label>
        ))}
      </div>
    </div>
  );
}
