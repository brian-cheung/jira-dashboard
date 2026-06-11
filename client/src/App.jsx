import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import MetricsDashboard from './components/MetricsDashboard';
import DetailDrawer from './components/DetailDrawer';
import FilterBar from './components/FilterBar';
import CreateIssueModal from './components/CreateIssueModal';
import Setup from './components/Setup';
import { fetchIssues, fetchSyncStatus, triggerSync } from './api';
import socket from './socket';
import { useToast } from './components/Toast';
import './App.css';

export default function App() {
  const [issues, setIssues] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ lastSync: null });
  const [filters, setFilters] = useState({ assignee: true, reporter: true, tester: true });
  const [statusFilter, setStatusFilter] = useState({});
  const [sprintFilter, setSprintFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('tickets');
  const [filtersReady, setFiltersReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const addToast = useToast();

  const loadIssues = useCallback(async () => {
    try {
      const data = await fetchIssues();
      setIssues(data);
      return data;
    } catch (err) {
      addToast('Failed to load issues: ' + err.message, 'error');
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await fetchSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    loadIssues().then(data => {
      // Set default status filter: all except "Done"
      if (data && !filtersReady) {
        const defaults = {};
        for (const i of data) {
          if (i.status && i.status !== 'Done') defaults[i.status] = true;
        }
        setStatusFilter(defaults);
        setFiltersReady(true);
      }
    });
    loadSyncStatus();
  }, []);

  useEffect(() => {
    socket.on('sync:complete', (data) => {
      addToast(`Sync complete: ${data.count} issues`, 'info');
      loadIssues();
      loadSyncStatus();
    });

    socket.on('sync:updated', (data) => {
      loadIssues();
      loadSyncStatus();
    });

    return () => {
      socket.off('sync:complete');
      socket.off('sync:updated');
    };
  }, []);

  async function handleManualSync() {
    try {
      addToast('Syncing...', 'info');
      await triggerSync();
      await loadIssues();
      await loadSyncStatus();
    } catch (err) {
      addToast('Sync failed: ' + err.message, 'error');
    }
  }

  function clearAllFilters() {
    setFilters({ assignee: false, reporter: false, tester: false });
    setStatusFilter({});
    setSprintFilter('');
    setTypeFilter('');
    setPriorityFilter('');
    setProjectFilter({});
    setSearch('');
  }

  function resetToUndone() {
    const undone = {};
    for (const i of issues) {
      if (i.status && i.status !== 'Done') undone[i.status] = true;
    }
    setStatusFilter(undone);
  }

  const sharedFilterProps = {
    search, onSearchChange: setSearch,
    filters, onFiltersChange: setFilters,
    statusFilter, onStatusFilterChange: setStatusFilter,
    sprintFilter, onSprintFilterChange: setSprintFilter,
    typeFilter, onTypeFilterChange: setTypeFilter,
    priorityFilter, onPriorityFilterChange: setPriorityFilter,
    projectFilter, onProjectFilterChange: setProjectFilter,
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>JIRA Dashboard</h1>
        <div className="header-actions">
          <span className="sync-status">
            {syncStatus.lastSync
              ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleTimeString()}`
              : 'Not synced yet'}
          </span>
          <button className="sync-btn" onClick={() => setShowCreate(true)}>+ New Issue</button>
          <button className="sync-btn" onClick={handleManualSync}>Sync Now</button>
        </div>
      </header>
      <div className="app-tabs">
        <button className={`app-tab ${tab === 'tickets' ? 'active' : ''}`} onClick={() => setTab('tickets')}>Tickets</button>
        <button className={`app-tab ${tab === 'metrics' ? 'active' : ''}`} onClick={() => setTab('metrics')}>Metrics</button>
        <button className={`app-tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>Setup</button>
      </div>
      <div className="app-main">
        <div className="app-sidebar">
          <FilterBar {...sharedFilterProps} issues={issues} onClearAll={clearAllFilters} onResetUndone={resetToUndone} />
        </div>
        <div className="app-content">
          {tab === 'tickets' ? (
            <Dashboard {...sharedFilterProps} issues={issues} onSelectIssue={setSelectedKey} selectedKey={selectedKey} />
          ) : tab === 'metrics' ? (
            <MetricsDashboard issues={issues} onSelectIssue={setSelectedKey} />
          ) : (
            <Setup />
          )}
        </div>
      </div>
      <DetailDrawer
        issueKey={selectedKey}
        onClose={() => setSelectedKey(null)}
      />
      {showCreate && (
        <CreateIssueModal
          issues={issues}
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            loadIssues();
          }}
        />
      )}
    </div>
  );
}
