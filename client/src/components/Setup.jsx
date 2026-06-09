import { useState, useEffect } from 'react';
import { fetchSettings, saveSettings, triggerSync } from '../api';
import { useToast } from './Toast';
import './Setup.css';

export default function Setup() {
  const [customJql, setCustomJql] = useState('');
  const [defaultJql, setDefaultJql] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const addToast = useToast();

  useEffect(() => {
    fetchSettings().then(data => {
      setCustomJql(data.customJql || '');
      setDefaultJql(data.defaultJql || '');
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({ customJql: customJql.trim() });
      addToast('Settings saved', 'success');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    }
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      addToast('Sync triggered with new query', 'success');
    } catch (err) {
      addToast('Sync failed: ' + err.message, 'error');
    }
    setSyncing(false);
  }

  return (
    <div className="setup">
      <div className="setup-section">
        <h3>Current JQL Query</h3>
        <p className="setup-hint">
          This is the default query generated from your account. It finds all issues where you are the Assignee, Reporter, or Tester.
        </p>
        <div className="setup-jql-display">{defaultJql}</div>
      </div>

      <div className="setup-section">
        <h3>Custom JQL Query</h3>
        <p className="setup-hint">
          Enter your own JQL to override the default. Leave blank to use the default query above.
          Use <code>currentUser()</code> to reference yourself. Examples:
        </p>
        <ul className="setup-examples">
          <li><code>project = DEV1 AND assignee = currentUser() ORDER BY created DESC</code></li>
          <li><code>sprint in openSprints() AND assignee = currentUser()</code></li>
          <li><code>filter = "My Open Issues"</code></li>
        </ul>
        <textarea
          className="setup-jql-input"
          value={customJql}
          onChange={e => setCustomJql(e.target.value)}
          placeholder="Enter custom JQL..."
          rows={4}
          spellCheck={false}
        />
      </div>

      <div className="setup-actions">
        <button className="setup-btn setup-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save JQL'}
        </button>
        <button className="setup-btn setup-sync" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Save & Sync Now'}
        </button>
      </div>
    </div>
  );
}
