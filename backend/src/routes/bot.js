const express = require('express');
const { authenticateToken } = require('../middlewares/auth');
const { validate } = require('../utils');
const { z } = require('zod');
const { notifyActivityPublished, notifyHistoryUpdated, notifyMemberAdded } = require('../utils/bot');

const router = express.Router();

const activityNotifySchema = z.object({
  id: z.coerce.number().int(),
  title: z.string().trim().min(1).max(200),
  tag: z.string().trim().min(1).max(50),
  date: z.string().trim().min(1).max(50),
  description: z.string().max(2000).optional().nullable(),
  cover_image: z.string().max(500).optional().nullable()
});

const historyNotifySchema = z.object({
  id: z.coerce.number().int(),
  date: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  sort_order: z.coerce.number().int().optional().default(0),
  action: z.enum(['create', 'update', 'delete']).optional().default('update')
});

const memberNotifySchema = z.object({
  id: z.coerce.number().int(),
  name: z.string().trim().min(1).max(50),
  role: z.string().trim().min(1).max(50),
  school: z.string().max(50).optional().nullable(),
  avatar: z.string().max(500).optional().nullable()
});

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

module.exports = router;
