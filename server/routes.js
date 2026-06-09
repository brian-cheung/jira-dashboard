const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const {
  getIssue,
  createIssue,
  updateIssue,
  doTransition,
  getTransitions,
  addComment,
  addAttachment
} = require('./jira-client');
const {
  getAllIssues,
  getIssueByKey,
  updateIssueLocal,
  upsertIssue,
  getSyncLog,
  getCustomJql,
  setCustomJql
} = require('./cache');
const { triggerSync, getSyncStatus } = require('./sync');

// POST /api/issues — create a new issue in JIRA
router.post('/issues', async (req, res) => {
  try {
    const { projectKey, summary, description, issueType, parentKey } = req.body;
    if (!projectKey || !summary || !issueType) {
      return res.status(400).json({ error: 'projectKey, summary, and issueType are required' });
    }

    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType }
    };

    if (description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
      };
    }

    if (parentKey) {
      fields.parent = { key: parentKey };
    }

    const result = await createIssue(fields);

    // Fetch the full issue and cache it immediately
    try {
      const fullIssue = await getIssue(result.key);
      const log = getSyncLog();
      upsertIssue(
        fullIssue,
        log ? log.custom_field_tester : null,
        log ? log.custom_field_requested_by : null,
        log ? log.custom_field_start_date : null,
        log ? log.custom_field_sprint : null
      );
    } catch (e) {
      console.error('Failed to cache new issue:', e.message);
    }

    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [result.key], lastSync: new Date().toISOString() });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues — all cached issues
router.get('/issues', (req, res) => {
  try {
    const issues = getAllIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:key — single issue with comments (fetches live description from JIRA for rendered HTML)
router.get('/issues/:key', async (req, res) => {
  try {
    const issue = getIssueByKey(req.params.key);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Fetch live issue from JIRA to get rendered (HTML) description
    try {
      const live = await getIssue(req.params.key);
      if (live && live.fields) {
        const renderedDesc = (live.fields.renderedFields && live.fields.renderedFields.description)
          || (typeof live.fields.description === 'string' ? live.fields.description : '');
        if (renderedDesc) {
          issue.description = renderedDesc;
        }
      }
    } catch (e) {
      // If JIRA fetch fails, keep cached description
      console.error(`Failed to fetch live issue ${req.params.key}:`, e.message);
    }

    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/issues/:key — update summary, description, or transition status
router.put('/issues/:key', async (req, res) => {
  try {
    const { summary, description, transitionId } = req.body;
    const fields = {};

    if (summary !== undefined) fields.summary = summary;
    if (description !== undefined) fields.description = description;

    if (Object.keys(fields).length > 0) {
      await updateIssue(req.params.key, fields);
      updateIssueLocal(req.params.key, { summary, description });
    }

    if (transitionId) {
      await doTransition(req.params.key, transitionId);
      const transitions = await getTransitions(req.params.key);
      const newTransition = transitions.find(t => t.id === transitionId);
      if (newTransition && newTransition.to) {
        updateIssueLocal(req.params.key, { status: newTransition.to.name });
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:key/transitions — available status transitions
router.get('/issues/:key/transitions', async (req, res) => {
  try {
    const transitions = await getTransitions(req.params.key);
    res.json(transitions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:key/comments — add comment
router.post('/issues/:key/comments', async (req, res) => {
  try {
    const result = await addComment(req.params.key, req.body.body);
    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:key/attachments — upload attachment
router.post('/issues/:key/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await addAttachment(req.params.key, req.file.buffer, req.file.originalname);
    const io = req.app.get('io');
    if (io) io.emit('sync:updated', { keys: [req.params.key], lastSync: new Date().toISOString() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — trigger immediate sync
router.post('/sync', async (req, res) => {
  try {
    const io = req.app.get('io');
    await triggerSync(io);
    res.json({ success: true, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — sync status
router.get('/sync/status', (req, res) => {
  res.json(getSyncStatus());
});

// GET /api/settings — current configuration
router.get('/settings', (req, res) => {
  const status = getSyncStatus();
  const customJql = getCustomJql();

  // Build the default JQL for display (not account-specific without sync running, approximate)
  res.json({
    customJql,
    defaultJql: '(assignee = currentUser() OR reporter = currentUser() OR "Tester[User Picker]" = currentUser()) ORDER BY updated DESC',
    testerField: status.testerField,
    requestedByField: status.requestedByField,
    lastSync: status.lastSync
  });
});

// PUT /api/settings — save custom JQL
router.put('/settings', (req, res) => {
  try {
    const { customJql } = req.body;
    setCustomJql(customJql || '');
    res.json({ success: true, customJql: customJql || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
