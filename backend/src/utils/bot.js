const DEFAULT_TIMEOUT_MS = Number(process.env.ASTRBOT_TIMEOUT_MS || 5000);

const getFetch = () => {
  if (typeof fetch !== 'function') {
    throw new Error('当前 Node 版本不支持 fetch，请升级到 Node 18+');
  }
  return fetch;
};

const getWebhookConfig = () => {
  const url = process.env.ASTRBOT_WEBHOOK_URL || '';
  const token = process.env.ASTRBOT_TOKEN || '';
  return { url, token };
};

const buildHeaders = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const postWebhook = async (payload) => {
  const { url, token } = getWebhookConfig();
  if (!url) return { skipped: true, reason: 'ASTRBOT_WEBHOOK_URL 未配置' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await getFetch()(url, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Astrbot 通知失败: ${res.status} ${text}`);
    }
    return { ok: true };
  } finally {
    clearTimeout(timeout);
  }
};

const buildBasePayload = (event, data, actor) => ({
  event,
  data,
  actor: actor ? { id: actor.id, username: actor.username, role: actor.role } : null,
  source: 'guatswr_web',
  timestamp: new Date().toISOString()
});

const notifyActivityPublished = async (activity, actor) => postWebhook(
  buildBasePayload('activity.published', {
    id: activity.id,
    title: activity.title,
    tag: activity.tag,
    date: activity.date,
    description: activity.description || '',
    cover_image: activity.cover_image || ''
  }, actor)
);

const notifyHistoryUpdated = async (history, actor, action = 'update') => postWebhook(
  buildBasePayload('history.updated', {
    id: history.id,
    date: history.date,
    title: history.title,
    description: history.description || '',
    image: history.image || '',
    sort_order: history.sort_order || 0,
    action
  }, actor)
);

const notifyMemberAdded = async (member, actor) => postWebhook(
  buildBasePayload('member.added', {
    id: member.id,
    name: member.name,
    role: member.role,
    school: member.school || '',
    avatar: member.avatar || ''
  }, actor)
);

module.exports = {
  notifyActivityPublished,
  notifyHistoryUpdated,
  notifyMemberAdded
};
