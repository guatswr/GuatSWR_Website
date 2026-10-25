import type { BackendV1Member } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor, SqlValue } from '../../database/sqlite.js'

export type MemberImage = string | null | undefined
export type MemberRow = Row & {
  id: number; name: string | null; role: string | null; avatar: string | null; school: string | null
  tags: string | null; sort_order: number | null; deleted_at: string | null; deleted_by: number | null
}
export function createMembersRepository(db: SqlExecutor, syncSchema=false) {
  return {
    list: (includeDeleted: boolean, school: { enabled: boolean; value: SqlValue },privileged=false) => {
      const conditions: string[] = [], params: SqlValue[] = []
      if (!includeDeleted) conditions.push('deleted_at IS NULL')
      if(syncSchema && !privileged)conditions.push('sync_hidden=0')
      if (school.enabled) { conditions.push('school = ?'); params.push(school.value) }
      return db.all<MemberRow>(`SELECT * FROM members${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY sort_order ASC, id ASC`, params)
    },
    schools: () => db.all<{ school: string | null; count: number }>(`SELECT school, COUNT(*) as count FROM members WHERE deleted_at IS NULL${syncSchema?' AND sync_hidden=0':''} GROUP BY school ORDER BY count DESC, school ASC`),
    create: async (input: BackendV1Member, avatar: MemberImage, tags: string, executor: SqlExecutor = db) => {
      const result = await executor.run('INSERT INTO members (name, role, avatar, school, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [input.name, input.role, avatar ?? null, input.school || '', tags, input.sort_order || 0])
      return result.lastID
    },
    update: async (id: string, input: BackendV1Member, avatar: MemberImage, tags: string, executor: SqlExecutor = db) => {
      if(syncSchema) {
        await executor.run(`UPDATE members SET follow_group_name=CASE WHEN name IS NOT ? THEN 0 ELSE follow_group_name END,
          follow_group_avatar=CASE WHEN avatar IS NOT ? THEN 0 ELSE follow_group_avatar END WHERE id=?`,[input.name,avatar ?? null,id])
      }
      await executor.run('UPDATE members SET name=?, role=?, avatar=?, school=?, tags=?, sort_order=? WHERE id=?',
        [input.name, input.role, avatar ?? null, input.school || '', tags, input.sort_order || 0, id])
    },
    name: async (id: string, withAvatar: boolean) => {
      const row = await db.get<{ name: string | null }>(withAvatar ? 'SELECT name, avatar FROM members WHERE id = ?' : 'SELECT name FROM members WHERE id = ?', [id])
      return row ? row.name : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run('UPDATE members SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?', [actorId, id]) },
    restore: async (id: string) => { await db.run('UPDATE members SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]) }
  }
}
export type MembersRepository = ReturnType<typeof createMembersRepository>
