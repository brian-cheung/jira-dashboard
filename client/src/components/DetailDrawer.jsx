import { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import { fetchIssue, updateIssue, fetchTransitions, addComment, uploadAttachment } from '../api';
import { useToast } from './Toast';
import { adfToHtml } from '../adf';
import './DetailDrawer.css';

export default function DetailDrawer({ issueKey, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [transitions, setTransitions] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const addToast = useToast();

  useEffect(() => {
    if (!issueKey) return;
    setLoading(true);
    fetchIssue(issueKey).then(data => {
      setIssue(data);
      setSummary(data.summary);
      setDescription(data.description);
      setLoading(false);
    }).catch(err => {
      addToast('Failed to load issue: ' + err.message, 'error');
      setLoading(false);
    });

    fetchTransitions(issueKey).then(setTransitions).catch(() => {});
  }, [issueKey]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateIssue(issueKey, { summary, description });
      addToast('Issue updated', 'success');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    }
    setSaving(false);
  }

  async function handleTransition(transitionId) {
    try {
      await updateIssue(issueKey, { transitionId });
      addToast('Status updated', 'success');
      const updated = await fetchIssue(issueKey);
      setIssue(updated);
      const newTransitions = await fetchTransitions(issueKey);
      setTransitions(newTransitions);
    } catch (err) {
      addToast('Transition failed: ' + err.message, 'error');
    }
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    try {
      await addComment(issueKey, commentText);
      setCommentText('');
      addToast('Comment added', 'success');
      const updated = await fetchIssue(issueKey);
      setIssue(updated);
    } catch (err) {
      addToast('Comment failed: ' + err.message, 'error');
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadAttachment(issueKey, file);
      addToast('Attachment uploaded', 'success');
    } catch (err) {
      addToast('Upload failed: ' + err.message, 'error');
    }
  }

  if (!issueKey) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{issueKey}</h2>
          <div className="drawer-header-actions">
            <a href={`https://executivecentre.atlassian.net/browse/${issueKey}`} target="_blank" rel="noopener noreferrer" className="drawer-jira-link">Open in JIRA ↗</a>
            <button className="drawer-close" onClick={onClose}>×</button>
          </div>
        </div>

        {loading ? (
          <div className="drawer-loading">Loading...</div>
        ) : issue ? (
          <div className="drawer-body">
            <div className="drawer-field">
              <label>Status</label>
              <div className="drawer-status-row">
                <StatusBadge status={issue.status} />
                {transitions.length > 0 && (
                  <select
                    className="drawer-transition-select"
                    onChange={e => e.target.value && handleTransition(e.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>Transition...</option>
                    {transitions.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="drawer-field">
              <label>Summary</label>
              <input value={summary} onChange={e => setSummary(e.target.value)} />
            </div>

            <div className="drawer-field">
              <label>Description
                <button className="drawer-edit-toggle" onClick={() => setEditingDesc(!editingDesc)}>
                  {editingDesc ? 'View' : 'Edit'}
                </button>
              </label>
              {editingDesc ? (
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={12}
                />
              ) : (
                <div className="drawer-desc-rendered" dangerouslySetInnerHTML={{ __html: adfToHtml(description) || '<em>No description</em>' }} />
              )}
            </div>

            <div className="drawer-meta">
              <div><strong>Assignee:</strong> {issue.assignee_name || '-'}</div>
              <div><strong>Reporter:</strong> {issue.reporter_name || '-'}</div>
              <div><strong>Tester:</strong> {issue.tester_name || '-'}</div>
              <div><strong>Fix versions:</strong> {issue.fix_versions || '-'}</div>
              <div><strong>Sprint:</strong> {issue.sprint || '-'}</div>
              <div><strong>Requested by:</strong> {issue.requested_by || '-'}</div>
              <div><strong>Issue type:</strong> {issue.issue_type || '-'}</div>
              <div><strong>Priority:</strong> {issue.priority || '-'}</div>
              <div><strong>Due date:</strong> {issue.due_date || '-'}</div>
            </div>

            <button
              className="drawer-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div className="drawer-section">
              <h3>Comments</h3>
              <div className="drawer-comments">
                {(issue.comments || []).map(c => (
                  <div key={c.id} className="drawer-comment">
                    <span className="comment-author">{c.author}</span>
                    <span className="comment-date">{new Date(c.created).toLocaleString()}</span>
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: c.body }} />
                  </div>
                ))}
              </div>
              <div className="drawer-comment-form">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                />
                <button onClick={handleAddComment}>Add Comment</button>
              </div>
            </div>

            <div className="drawer-section">
              <h3>Attachments</h3>
              <input type="file" onChange={handleFileUpload} />
            </div>
          </div>
        ) : (
          <div className="drawer-loading">Issue not found</div>
        )}
      </div>
    </div>
  );
}
