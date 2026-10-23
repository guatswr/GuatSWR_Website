module.exports = (context) => {
const express = require('express');
const { authenticateToken } = context.auth;
const { validate } = require('../utils');
const { activityNotifySchema, historyNotifySchema, memberNotifySchema } = context.schemas;
const { notifyActivityPublished, notifyHistoryUpdated, notifyMemberAdded } = context.bot;

const router = express.Router();

router.post('/notify/activity', authenticateToken, async (req, res) => {
  const validated = validate(activityNotifySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  try {
    await notifyActivityPublished(validated.data, req.user);
    res.json({ message: '已通知' });
  } catch (err) {
    res.status(502).json({ message: err.message || '通知失败' });
  }
});

router.post('/notify/history', authenticateToken, async (req, res) => {
  const validated = validate(historyNotifySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  try {
    const { action, ...data } = validated.data;
    await notifyHistoryUpdated(data, req.user, action);
    res.json({ message: '已通知' });
  } catch (err) {
    res.status(502).json({ message: err.message || '通知失败' });
  }
});

router.post('/notify/member', authenticateToken, async (req, res) => {
  const validated = validate(memberNotifySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  try {
    await notifyMemberAdded(validated.data, req.user);
    res.json({ message: '已通知' });
  } catch (err) {
    res.status(502).json({ message: err.message || '通知失败' });
  }
});

return router;

};
