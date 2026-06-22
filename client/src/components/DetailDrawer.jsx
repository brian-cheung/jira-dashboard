import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { fetchIssue, addComment, uploadAttachment } from '../api';
import { useToast } from './Toast';
import { adfToHtml } from '../adf';
import './DetailDrawer.css';

export default function DetailDrawer({ issueKey, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const addToast = useToast();

  useEffect(() => {
    if (!issueKey) return;
    setLoading(true);
    fetchIssue(issueKey).then(data => {
      setIssue(data);
      setLoading(false);
    }).catch(err => {
      addToast('Failed to load issue: ' + err.message, 'error');
      setLoading(false);
    });
  }, [issueKey]);

  const handleAddComment = useCallback(async () => {
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
  }, [commentText, issueKey, addToast]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadAttachment(issueKey, file);
      addToast('Attachment uploaded', 'success');
    } catch (err) {
      addToast('Upload failed: ' + err.message, 'error');
    }
  }, [issueKey, addToast]);

  const onOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const commentsList = useMemo(() => {
    if (!issue || !issue.comments) return null;
    return issue.comments.map(c => (
      <div key={c.id} className="drawer-comment">
        <span className="comment-author">{c.author}</span>
        <span className="comment-date">{new Date(c.created).toLocaleString()}</span>
        <div className="comment-body" dangerouslySetInnerHTML={{ __html: adfToHtml(c.body) }} />
      </div>
    ));
  }, [issue]);

  if (!issueKey) return null;

  return (
    <div className="drawer-overlay" onClick={onOverlayClick}>
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
              <StatusBadge status={issue.status} />
            </div>

            <div className="drawer-field">
              <label>Summary</label>
              <div className="drawer-field-value">{issue.summary || '-'}</div>
            </div>

            <div className="drawer-field">
              <label>Description</label>
              <div className="drawer-desc-rendered" dangerouslySetInnerHTML={{ __html: adfToHtml(issue.description) || '<em>No description</em>' }} />
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

            <div className="drawer-section">
              <h3>Comments</h3>
              <div className="drawer-comments">
                {commentsList || <div className="drawer-comment" style={{color:'#6B778C',fontStyle:'italic'}}>No comments yet</div>}
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
