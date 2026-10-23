import path from 'node:path'
import type { Row, SqliteStore } from '../../database/sqlite.js'
import { captureCleanupTargets, enqueueCleanup, processCleanupJob, type CleanupTarget } from '../../storage/cleanup.js'

export class RecycleError extends Error { constructor(readonly status: number, message: string) { super(message) } }
export function createRecycleService(store: SqliteStore, root: string, quarantine: string) {
  return {
    purge: async () => {
      const definitions = [
        { table: 'activities', columns: ['cover_image', 'images', 'content'], directory: 'activity' },
        { table: 'members', columns: ['avatar'], directory: undefined },
        { table: 'history', columns: ['image'], directory: undefined }
      ] as const
      const prepared: { definition: (typeof definitions)[number]; row: Row; targets: CleanupTarget[] }[] = []
      for (const definition of definitions) {
        const rows = await store.all(`SELECT id,${definition.columns.join(',')} FROM ${definition.table} WHERE deleted_at IS NOT NULL`)
        for (const row of rows) {
          const directories = definition.directory ? [path.join(root, 'img', definition.directory, String(row.id))] : []
          prepared.push({ definition, row, targets: await captureCleanupTargets(root, Object.values(row), directories) })
        }
      }
      const committed = await store.transaction(async tx => {
        const result = { activities: 0, members: 0, history: 0 }
        const jobs: string[] = []
        for (const { definition, row, targets } of prepared) {
          const columns = definition.columns
          const deleted = await tx.run(`DELETE FROM ${definition.table} WHERE id=? AND deleted_at IS NOT NULL AND ${columns.map(column => `${column} IS ?`).join(' AND ')}`,
            [row.id as number, ...columns.map(column => row[column] as string | null)])
          result[definition.table] += deleted.changes
          if (deleted.changes) { await enqueueCleanup(tx, targets); jobs.push(...targets.map(target => target.id)) }
        }
        return { result, jobs }
      })
      // Commit succeeded: cleanup failures remain durable and must not invite the
      // client to retry the database mutation. Keep the synchronous legacy reply.
      for (const id of committed.jobs.slice(0, 20)) await processCleanupJob(store, root, quarantine, id).catch(() => {})
      return committed.result
    },
    removeEvent: async (id: string) => {
      // The legacy endpoint binds raw IDs; select the canonical row ID before paths.
      const event = await store.get('SELECT id,content FROM events WHERE id=?', [id])
      if (!event) throw new RecycleError(404, 'Event not found')
      const participants = await store.all('SELECT avatar FROM event_participants WHERE event_id=?', [event.id as number])
      const targets = await captureCleanupTargets(root, [event.content, ...participants.map(row => row.avatar)], [path.join(root, 'img', 'events', String(event.id))])
      await store.transaction(async tx => {
        const result = await tx.run('DELETE FROM events WHERE id=? AND content IS ?', [event.id as number, event.content as string | null])
        if (!result.changes) {
          const exists = await tx.get<Row>('SELECT id FROM events WHERE id=?', [event.id as number])
          throw new RecycleError(exists ? 409 : 404, exists ? '事件已变化，请重试' : 'Event not found')
        }
        await enqueueCleanup(tx, targets)
      })
      let failures = 0
      for (const target of targets.slice(0, 20)) {
        try { await processCleanupJob(store, root, quarantine, target.id) } catch { failures++ }
      }
      return { incomplete: failures > 0 || targets.length > 20 }
    }
  }
}
