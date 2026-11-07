import { idBinding } from '../../database/sql.js'
import { utcTimestamp } from '../../database/sql.js'
import type { BackendV1Member } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor, SqlValue } from '../../database/contracts.js'

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
      if (school.enabled) { conditions.push('school = $1'); params.push(school.value) }
      return db.all<MemberRow>(`SELECT * FROM members${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY sort_order ASC NULLS FIRST, id ASC`, params)
    },
    schools: () => db.all<{ school: string | null; count: number }>(`SELECT school, COUNT(*) as count FROM members WHERE deleted_at IS NULL${syncSchema?' AND sync_hidden=0':''} GROUP BY school ORDER BY count DESC, school ASC NULLS FIRST`),
    create: async (input: BackendV1Member, avatar: MemberImage, tags: string, executor: SqlExecutor = db) => {
      const result = await executor.run("INSERT INTO members (name, role, avatar, school, tags, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [input.name, input.role, avatar ?? null, input.school || '', tags, input.sort_order || 0])
      return result.lastID
    },
    update: async (id: string, input: BackendV1Member, avatar: MemberImage, tags: string, executor: SqlExecutor = db) => {
      if(syncSchema) {
        await executor.run(`UPDATE members SET follow_group_name=CASE WHEN name IS DISTINCT FROM $1 THEN 0 ELSE follow_group_name END,
          follow_group_avatar=CASE WHEN avatar IS DISTINCT FROM $2 THEN 0 ELSE follow_group_avatar END WHERE id=$3`,[input.name,avatar ?? null,idBinding(id)])
      }
      await executor.run("UPDATE members SET name=$1, role=$2, avatar=$3, school=$4, tags=$5, sort_order=$6 WHERE id=$7",
        [input.name, input.role, avatar ?? null, input.school || '', tags, input.sort_order || 0, idBinding(id)])
    },
    name: async (id: string, withAvatar: boolean) => {
      const row = await db.get<{ name: string | null }>(withAvatar ? "SELECT name, avatar FROM members WHERE id = $1" : "SELECT name FROM members WHERE id = $1", [idBinding(id)])
      return row ? row.name : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run(`UPDATE members SET deleted_at = ${utcTimestamp(db)}, deleted_by = $1 WHERE id = $2`, [actorId, idBinding(id)]) },
    restore: async (id: string) => { await db.run("UPDATE members SET deleted_at = NULL, deleted_by = NULL WHERE id = $1", [idBinding(id)]) }
  }
}
export type MembersRepository = ReturnType<typeof createMembersRepository>
