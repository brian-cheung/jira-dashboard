import { useState, useEffect, useCallback } from 'react';
import HierarchyTree from './components/HierarchyTree';
import Dashboard from './components/Dashboard';
import DetailDrawer from './components/DetailDrawer';
import FilterBar from './components/FilterBar';
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
  const [search, setSearch] = useState('');
  const addToast = useToast();

  const loadIssues = useCallback(async () => {
    try {
      const data = await fetchIssues();
      setIssues(data);
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
    loadIssues();
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
          <button className="sync-btn" onClick={handleManualSync}>Sync Now</button>
        </div>
      </header>
      <div className="app-main">
        <div className="app-sidebar">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            issues={issues}
          />
          <HierarchyTree
            issues={issues}
            filters={filters}
            onSelectIssue={setSelectedKey}
            selectedKey={selectedKey}
          />
        </div>
        <div className="app-content">
          <Dashboard
            issues={issues}
            filters={filters}
            statusFilter={statusFilter}
            search={search}
            onSelectIssue={setSelectedKey}
            selectedKey={selectedKey}
          />
        </div>
      </div>
      <DetailDrawer
        issueKey={selectedKey}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
