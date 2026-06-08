import './FilterBar.css';

export default function FilterBar({ search, onSearchChange, filters, onFiltersChange }) {
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
    </div>
  );
}
