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
  password: z.string().min(6, '密码至少 6 位').max(100).optional(),
  avatar: z.string().max(500).optional(),
  twofa_password: z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable(),
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
  bio: z.string().max(2000).optional().nullable(),
  avatar: z.string().max(500).optional().nullable(),
  school: z.string().max(50).optional().nullable(),
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
