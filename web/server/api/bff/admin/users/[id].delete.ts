import { bffProtectedHandler, parseAdminId, requireBffBodylessMutation, requireBffSession } from '~~/server/utils/bff-protected'
import { adminDeleteUser, adminListUsers } from '~~/server/utils/bff-admin-resources'
import { withAdminUserLock } from '~~/server/utils/bff-admin-user-lock'
import { BffError } from '~~/server/utils/bff-errors'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  await requireBffBodylessMutation(event, session.runtime)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return withAdminUserLock(session.runtime.store, async () => {
    const current = await requireBffSession(event, { superAdmin: true })
    if (id === current.identity.id) throw new BffError(400, 'invalid_request', '无法删除自己')
    const users = await adminListUsers(current.admin)
    const target = users.find(user => user.id === id)
    if (!target) throw new BffError(404, 'not_found', '目标不存在')
    if (target.role === 'super_admin' && users.filter(user => user.role === 'super_admin').length <= 1)
      throw new BffError(409, 'conflict', '不能删除最后一位超级管理员')
    const result = await adminDeleteUser(current.admin, id)
    current.runtime.auth.revokeForUser(id)
    return result
  })
})
