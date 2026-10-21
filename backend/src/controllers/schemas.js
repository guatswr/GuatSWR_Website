const { z } = require('zod');

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50).regex(USERNAME_REGEX, '用户名仅允许字母、数字、下划线和连字符'),
  password: z.string().min(1, '密码不能为空').max(100),
  twofa: z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable()
});

const registerSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50).regex(USERNAME_REGEX, '用户名仅允许字母、数字、下划线和连字符'),
  password: z.string().min(6, '密码至少 6 位').max(100)
});

const profileSchema = z.object({
  password: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(6, '密码至少 6 位').max(100).optional()),
  avatar: z.string().max(500).optional(),
  twofa_password: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable()),
  twofa_enabled: z.boolean().optional()
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(100)
});

const activitySchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  tag: z.string().trim().min(1, '标签不能为空').max(50),
  date: z.string().trim().min(1, '日期不能为空').max(50),
  description: z.string().max(2000).optional().nullable(),
  content: z.string().optional().nullable(),
  cover_image: z.string().max(500).optional().nullable(),
  images: z.array(z.string().max(500)).optional()
});

const memberSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  role: z.string().trim().min(1, '角色不能为空').max(50),
  /* bio removed */
  avatar: z.string().max(500).optional().nullable(),
  school: z.string().max(50).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).optional().default([]),
  sort_order: z.coerce.number().int().optional().default(0)
});

const historySchema = z.object({
  date: z.string().trim().min(1, '日期不能为空').max(50),
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  sort_order: z.coerce.number().int().optional().default(0)
});

const configSchema = z.object({
  key: z.string().trim().min(1, '配置键不能为空').max(100),
  value: z.string().max(5000).optional().default('')
}).superRefine(({ key, value }, ctx) => {
  const text = value.trim();
  const invalid = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });
  if (key === 'qq_group_number' && text && !/^\d{5,12}$/.test(text)) {
    invalid('QQ群号须为 5 至 12 位数字，或留空');
  }
  if (key === 'join_question' && text.length > 200) {
    invalid('入群问题不能超过 200 字');
  }
  if (key === 'qq_join_url' && text) {
    try {
      const url = new URL(text);
      if (text.length > 1000 || !/^https?:\/\//i.test(text) || !['http:', 'https:'].includes(url.protocol)) {
        invalid('入群链接仅支持完整的 http:// 或 https:// 地址，且不能超过 1000 字');
      }
    } catch {
      invalid('请输入有效的 http:// 或 https:// 入群链接');
    }
  }
}).transform((data) => {
  const joinKeys = ['qq_group_number', 'qq_join_url', 'join_question'];
  return joinKeys.includes(data.key) ? { ...data, value: data.value.trim() } : data;
});

module.exports = {
  loginSchema,
  registerSchema,
  profileSchema,
  resetPasswordSchema,
  activitySchema,
  memberSchema,
  historySchema,
  configSchema
};
