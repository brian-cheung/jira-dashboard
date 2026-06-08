const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const {
  updateIssue,
  doTransition,
  getTransitions,
  addComment,
  addAttachment
} = require('./jira-client');
const {
  getAllIssues,
  getIssueByKey,
  updateIssueLocal
} = require('./cache');
const { triggerSync, getSyncStatus } = require('./sync');

// GET /api/issues — all cached issues
router.get('/issues', (req, res) => {
  try {
    const issues = getAllIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:key — single issue with comments
router.get('/issues/:key', (req, res) => {
  try {
    const issue = getIssueByKey(req.params.key);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
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

module.exports = router;
