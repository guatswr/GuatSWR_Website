import type { botScopes } from '@guatswr/shared/bot'

export const botScopeLabels: Record<typeof botScopes[number], string> = {
  'query:read': '查询公开内容（含历史上的今天）', 'subscriptions:write': '管理群消息订阅',
  'identity:write': '绑定 QQ 与网站身份', 'signup:write': '提交和取消活动报名', 'signup:read': '查看个人报名信息',
  'review:read': '查看待审活动', 'review:write': '审核活动', 'deliveries:read': '查看消息投递记录',
  'deliveries:retry': '重试消息投递', 'members:sync': '回传群成员和头像', 'deliveries:ack': '确认私信投递结果',
}
