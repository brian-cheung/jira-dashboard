import { useState, useMemo } from 'react';
import { createIssue } from '../api';
import { useToast } from './Toast';
import './CreateIssueModal.css';

export default function CreateIssueModal({ issues, onClose, onCreated }) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState('Story');
  const [projectKey, setProjectKey] = useState('');
  const [parentKey, setParentKey] = useState('');
  const [creating, setCreating] = useState(false);
  const addToast = useToast();

  const projects = useMemo(() => {
    const set = new Set();
    for (const i of issues || []) {
      const m = i.key.match(/^([A-Z][A-Z0-9]*?)-/);
      if (m) set.add(m[1]);
    }
    return [...set].sort();
  }, [issues]);

  const parents = useMemo(() => {
    return (issues || [])
      .filter(i => i.issue_type === 'Epic' || i.issue_type === 'Story')
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [issues]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!summary.trim() || !projectKey) {
      addToast('Summary and Project are required', 'error');
      return;
    }
    setCreating(true);
    try {
      const result = await createIssue({
        projectKey,
        summary: summary.trim(),
        description: description.trim(),
        issueType,
        parentKey: parentKey || undefined
      });
      addToast(`Created ${result.key}`, 'success');
      onCreated(result);
    } catch (err) {
      addToast('Failed: ' + err.message, 'error');
    }
    setCreating(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Issue</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label>Project *</label>
            <select value={projectKey} onChange={e => setProjectKey(e.target.value)} required>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label>Type *</label>
            <select value={issueType} onChange={e => setIssueType(e.target.value)}>
              <option value="Epic">Epic</option>
              <option value="Story">Story</option>
              <option value="Task">Task</option>
              <option value="Subtask">Subtask</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Parent (optional)</label>
            <select value={parentKey} onChange={e => setParentKey(e.target.value)}>
              <option value="">None</option>
              {parents.map(p => <option key={p.key} value={p.key}>{p.key}: {p.summary}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label>Summary *</label>
            <input
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Issue title..."
              required
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={5}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
