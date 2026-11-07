import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../', import.meta.url))
const pattern = /contracts\.js|SqlExecutor|DatabaseStore|createSecurityService|sqlite|PRAGMA|sqlite_master|sqlite_schema|strftime|last_insert_rowid|lastID|INSERT OR|AUTOINCREMENT|BEGIN IMMEDIATE|CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX|CREATE TRIGGER|createSqliteStore|\b(?:context\.)?(?:db|logDb)\.(?:get|all|run|exec|prepare)|\.db\b/i
const excluded = new Set(['node_modules', '.git', '.tools', 'dist', '.nuxt', '.output', '__pycache__', '.pytest_cache', 'performance'])
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
async function sources() {
  const result = []
  const walk = async relative => {
    const stat = await fs.lstat(path.join(root, relative))
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(path.join(root, relative))) {
        if (!excluded.has(entry)) await walk(path.posix.join(relative, entry))
      }
    } else if (/\.(?:ts|js|cjs|mjs|py|sh|ps1|sql|json|ya?ml)$/.test(relative) || relative.endsWith('Dockerfile')) {
      if (!/\.test\.|\/tests\/|manifest\.json$|pnpm-lock\.yaml$/.test(relative)) {
        result.push({ file: relative, text: await fs.readFile(path.join(root, relative), 'utf8') })
      }
    }
  }
  for (const directory of ['backend/src', 'backend/scripts', 'web/server', 'scripts', 'deploy']) await walk(directory)
  for (const file of ['backend/Dockerfile', 'web/Dockerfile', 'docker-compose.yml']) {
    result.push({ file, text: await fs.readFile(path.join(root, file), 'utf8') })
  }
  return result.sort((a, b) => a.file.localeCompare(b.file, 'en'))
}

function classify(file, text) {
  const validation = /(?:^|\/)(?:test[-_]|candidate-|runtime-smoke|create_observed_fixture|.*_test\.)|\/revamp\/|\/ci\//.test(file)
  const database = file.startsWith('web/') ? 'bff（独立加密记录）'
    : /logs\/|audit-|audit\.sqlite|logDb|LOG_DB/.test(file + text) ? 'main / audit（见命中明细）' : 'main'
  if (file === 'scripts/googlebot_simulator.py') return { consumer: '爬虫测试报告时间', database: '无', replacement: '保留 Python time.strftime；不是 SQLite 日期 SQL', tests: 'scripts/googlebot_simulator_test.py', status: '已核对：无需迁移' }
  if (file === 'web/server/utils/bff-auth-context.ts') return { consumer: 'HTTP 响应缓存头', database: '无', replacement: '保留 Pragma: no-cache；不是 SQL PRAGMA', tests: 'web/tests/auth-api-integration.test.ts', status: '已核对：无需迁移' }
  if (file.startsWith('scripts/postgres/')) return { consumer: '迁移盘点/隔离验证工具', database: '内存 SQLite / 独立测试 PG', replacement: '保留内存模式盘点；只连接隔离测试库', tests: 'pnpm test:database', status: 'PG-00/01 验证工具' }
  if (file === 'backend/src/diagnostics.ts') return { consumer: '脱敏诊断错误码白名单', database: '不执行 SQL', replacement: '保留 SQLite 错误码并新增 PG 通用错误分类', tests: 'unit/diagnostics.test.mjs + unit/database-config.test.mjs', status: 'PG-01 已适配' }
  if (validation) return { consumer: '隔离测试/演练夹具', database, replacement: '保留 SQLite 基线；添加 PG 等价验证；禁止接入生产', tests: '现有同名脚本及 test:database', status: 'PG-02/04/05 验证入口' }
  if (file === 'backend/src/database/sqlite.ts') return { consumer: '默认后端及旧库回退', database, replacement: '保留 SQLite 适配器；共享契约由 contracts.ts 导出', tests: 'tests/database/store-contract + integration/transactions', status: 'PG-01 已验证' }
  if (file.startsWith('backend/src/database/')) return { consumer: '仓储与数据库工厂', database, replacement: '原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者', tests: 'tests/database + unit/database-config', status: /application|sql\.ts|legacy-json/.test(file) ? 'PG-02 已适配' : 'PG-01 已验证' }
  if (file === 'backend/src/models/db.js' || file === 'backend/src/models/security.js') return { consumer: 'lifecycle / addLog / 安全兼容桥', database, replacement: 'PG 分支使用异步 main/audit store 并校验版本、结构和权限；SQLite 直连仅保留旧驱动分支', tests: 'lifecycle / auth-security / security-bridge / startup-version', status: 'PG-02 已适配；禁止自动 DDL/回退' }
  if (file.startsWith('web/server/')) return { consumer: '登录会话、访客草稿与资源管理', database, replacement: 'PG-03 显式异步存储、AAD 密文、版本条件撤销；资源管理中的 .db 文件规则保留', tests: 'web/tests/durable-records / auth-session / guest-drafts / real-bff', status: 'PG-03 待迁移（本轮未切换 BFF）' }
  if (file.startsWith('backend/src/migrations/postgres/')) return { consumer: 'PG 显式初始化 / 只读启动校验', database: 'main / audit', replacement: '原生 PG 基线、独立 schema_version、结构指纹与最小权限', tests: 'tests/postgres/migration.test.mjs + pnpm test:postgres', status: 'PG-02 已适配' }
  if (file.includes('/migrations/') || file.includes('legacy-schema')) return { consumer: '显式迁移/旧库结构验证', database, replacement: 'SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色', tests: 'integration/migrations / startup-version', status: 'SQLite 源模式保留；PG 独立 DDL 已建立' }
  if (/backup|retention|ops_monitor|ops_backup|Dockerfile|compose/.test(file)) return { consumer: '备份、恢复、调度与容器', database, replacement: 'PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更', tests: 'backup_bundle_test / test_ops / test_deployment_boundaries', status: 'PG-05 待迁移；SQLite 基线保留' }
  if (file.startsWith('backend/scripts/')) return { consumer: '管理员/离线迁移/数据核验 CLI', database, replacement: '只读 SQLite 源副本；PG 专用目标、全量校验及序列校准', tests: 'PG-04 导入验证 + 当前脚本用例', status: 'PG-04 待实现' }
  const family = /modules\/([^/]+)/.exec(file)?.[1]?.replace(/\.ts$/, '') || (/security/.test(file) ? 'auth-security / security-revocation' : /integrations/.test(file) ? 'bot-platform / member-sync' : /storage/.test(file) ? 'asset-publication / asset-inventory' : 'health')
  return { consumer: /integrations/.test(file) ? 'Bot HTTP/通知任务/成员同步' : /storage/.test(file) ? '上传发布/引用/清理事务' : /security/.test(file) ? '鉴权/封禁/撤销/审计 outbox' : `HTTP ${family} / 仓储`, database,
    replacement: 'PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO',
    tests: `backend/tests/integration/${family} 相关测试 + contracts / real-bff`, status: 'PG-02 原生 SQL 已适配，业务回归见 PG-02.md' }
}

export async function buildInventory() {
  const files = []
  for (const { file, text } of await sources()) {
    const matches = text.split(/\r?\n/).flatMap((line, index) => pattern.test(line) ? [{ line: index + 1, text: line.trim() }] : [])
    if (!matches.length) continue
    const ddl = /CREATE TABLE|ALTER TABLE|CREATE INDEX|PRAGMA|\.exec\(/i.test(text)
    const writes = /INSERT|UPDATE|DELETE|REPLACE|\.run\(/i.test(text)
    files.push({ file, ...classify(file, text), access: [ddl ? 'DDL/元数据' : '', writes ? '写' : '', '读'].filter(Boolean).join('/'), matches })
  }
  const schemas = []
  const directory = path.join(root, 'backend/src/migrations')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  for (const kind of ['main', 'audit']) {
    const db = new DatabaseSync(':memory:')
    try {
      const base = manifest[kind]
      const migrations = [base, ...(base.upgrades || []), ...(base.compatibleUpgrades || [])]
      for (const migration of migrations) {
        const sql = await fs.readFile(path.join(directory, migration.file), 'utf8')
        if (createHash('sha256').update(sql).digest('hex') !== migration.sha256) throw Error('Migration checksum mismatch')
        db.exec(sql)
      }
      for (const table of db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
        const columns = db.prepare('SELECT * FROM pragma_table_xinfo(?)').all(table.name)
        const indexes = db.prepare('SELECT * FROM pragma_index_list(?)').all(table.name).map(index => ({ ...index,
          sql: db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(index.name)?.sql ?? null,
          columns: db.prepare('SELECT * FROM pragma_index_xinfo(?)').all(index.name) }))
        schemas.push({ database: kind, table: table.name, sql: table.sql, columns,
          foreignKeys: db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(table.name), indexes,
          sources: migrations.filter(m => files.find(f => f.file.endsWith('/' + m.file))?.matches.some(match => match.text.includes(table.name))).map(m => m.file),
          sequence: /AUTOINCREMENT/i.test(table.sql) ? 'BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数' : '保留现有主键；不新增序列',
        })
      }
    } finally { db.close() }
  }
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files, schemas }
}

export function renderInventory(inventory) {
  const prefix = inventory.reportPrefix || 'PG-00'
  const lines = [`# ${prefix} 依赖清单与目标契约`, '', `源码基线：\`${inventory.revision}\`；报告按当前工作区生成。由 \`node scripts/postgres/inventory.mjs${prefix === 'PG-02' ? ' --pg02' : ''}\` 重建；仅读取仓库源码，在内存生成模式，未读取生产数据库。`, '',
    '2026-11-06 用户明确要求继续推进数据库迁移并保留未提交改动，授权本地 PG-00/01 实施。生产切换属于 PG-07，需另行验收。', '',
    '## 固定目标', '',
    '- PostgreSQL 18.6，测试镜像 postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5；pg 8.23.1 / @types/pg 8.23.1，Node 24.16.0。生产镜像沿用此候选前需通过 PG-06 资源和恢复演练。',
    '- 网站独立 guatswr 数据库，main/audit/bff 模式；目标角色 guatswr_migrator（DDL）、guatswr_backend（main/audit DML）、guatswr_bff（bff DML）。运行角色无 CREATE。测试使用独立 guatswr_pg_contract_test 与合成角色，不接触 Umami。',
    '- 默认 DATABASE_DRIVER=sqlite；显式 postgres 必须提供私有 POSTGRES_URL，配置值不写日志。后端已支持显式 PostgreSQL，启动只读校验既有完整模式及运行角色；BFF 状态仍待 PG-03。SQL 源码使用原生编号参数，不做运行时 SQL 自动翻译或回退。',
    '- 适配器默认 4 个连接；后端实际 main=3/audit=1，等待预算 main=96/audit=32，总上限分别为 4/128；获取 1000ms、停机宽限 1000ms；超限/超时拒绝。每事务独占 client；取消只销毁自己的 client。',
    '- 验证目标为 Linux PostgreSQL 18.6；每会话 client_connection_check_interval=100ms，确保取消长查询后服务端锁释放。原生 Windows PostgreSQL 未纳入此候选验证。',
    '- 不自动重放任何事务；序列化/死锁错误标记可重试但由业务确认重放安全。COMMIT 响应丢失是 outcome_unknown，须按操作 ID 查询确认。', '',
    '## 类型、时间与异常数据策略', '',
    '| SQLite | PostgreSQL 初次映射 | 校验/兼容语义 |', '| --- | --- | --- |',
    '| INTEGER 主键/毫秒/计数 | BIGINT；自增仅对原 AUTOINCREMENT 使用 identity | 驱动按安全整数返回 number；越界拒绝；保留 ID 后校准序列 |',
    '| INTEGER 布尔标志 | SMALLINT（0/1，保留 API number） | 导入发现其他值失败；有历史允许范围的字段保持原约束 |',
    '| TEXT / DATETIME / JSON 文本 | TEXT | 字节/Unicode、空字符串、NULL、非法历史 JSON 保持原样；业务原本要求 JSON 时才校验，不转 jsonb 吞错 |',
    '| BLOB | BYTEA | 逐字节摘要；BFF 密文继续 AES-GCM 与原 AAD |',
    '| UTC CURRENT_TIMESTAMP 字符串 | TEXT + 显式 UTC 格式默认值 | 保留 YYYY-MM-DD HH:mm:ss；日志仍显式输出 +08:00，不在适配器统一加 8 小时 |',
    '| 原生 PG timestamp/date/numeric | 驱动返回 text | 避免本地时区偏移和精度截断；业务 DTO 在 PG-02 显式格式化 |', '',
    '唯一性、外键、CHECK、部分索引见下面每表和配套 JSON。缺失的旧外键不擅自添加；PG-04 报告孤立关系/类型漂移并停止导入。旧表字段排序/大小写、NULL 排序、LIKE、COALESCE 和隐式数值转换需逐查询对照测试；排序采用显式 NULLS FIRST/LAST 和必要的 COLLATE "C"，不依赖 PG 默认值。', '',
    '## 文件与消费者', '', '| 文件 | 消费者 | 读/写/DDL | 数据库归属 | SQLite 语义 | PG 替代方案 | 测试入口 | 状态 |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
  for (const file of inventory.files) {
    const features = [...new Set(file.matches.flatMap(match => match.text.match(/sqlite\w*|PRAGMA|strftime|lastID|INSERT OR \w+|AUTOINCREMENT|BEGIN IMMEDIATE|\.db\b|\b(?:db|logDb)\.(?:run|get|all|exec|prepare)/gi) || ['SQL 参数/存储契约']))].join(', ')
    lines.push('| ' + [file.file, file.consumer, file.access, file.database, features, file.replacement, file.tests, file.status].map(cell).join(' | ') + ' |')
  }
  lines.push('', '## 表级映射', '', '下面列出 SQLite 来源模式的每表主键/序列、字段表示、外键和索引；原生 PG 基线见 backend/src/migrations/postgres/001-baseline.sql。完整来源列属性、默认值、CHECK 原文、索引顺序/唯一性/部分条件及源码行号见配套机器清单。SQLite 自身迁移账本不复制；PG-02 使用独立 schema_version。', '')
  for (const schema of inventory.schemas) {
    lines.push(`### ${schema.database}.${schema.table}`, '', `来源：${schema.sources.join(', ') || '当前迁移链'}。主键：${schema.columns.filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name).join(', ')}。序列：${schema.sequence}。`, '',
      `字段：${schema.columns.map(c => `${c.name}(${c.type || '无声明类型'}${c.notnull ? ',NOT NULL' : ''}${c.dflt_value !== null ? ',default=' + c.dflt_value : ''})`).join('；')}。`, '',
      `外键：${schema.foreignKeys.map(f => `${f.from}→${schema.database}.${f.table}.${f.to} ON DELETE ${f.on_delete}`).join('；') || '无；保持原语义'}。`, '',
      `约束/索引：${schema.indexes.map(i => `${i.name}${i.unique ? '[UNIQUE]' : ''}${i.partial ? '[PARTIAL]' : ''}(${i.columns.filter(c => c.key).map(c => `${c.name}${c.desc ? ' DESC' : ''}`).join(',')})`).join('；') || '见主键'}。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。`, '')
  }
  lines.push('## 必须继续迁移的直连与边界', '',
    '- models/db.js 根据显式驱动分支创建上下文；PG 分支不打开任何 SQLite，addLog 异步持久化；models/security.js 已移除 context.db 后备。SQLite 分支保留原生启动校验与兼容工具。',
    '- web/server/utils/durable-records.ts 使用 node:sqlite DatabaseSync、同步 Map 和 AES-GCM；全部会话/草稿调用者需在 PG-03 改为 Promise 与数据库条件撤销。',
    '- migrations/engine.ts、迁移/初始化/管理员/只读启动 CLI、Python inspect_data.py、备份脚本直接打开 SQLite；保留为源导出/旧库验证路径，新增 PG 入口。',
    '- asset_references 仅报名头像同步完整；PG-02 迁移时必须保留当前权威扫描回退，索引未命中不得授权删除。',
    '- PG-04 冻结副本导入、PG-05 网站独立备份恢复、PG-06 两次演练、PG-07 生产切换尚未执行。无反向迁移时，PG 放写后不能无损切回旧 SQLite。', '',
    '参考：[pg Node 24 兼容性](https://node-postgres.com/)、[事务独占 client](https://node-postgres.com/features/transactions)、[PostgreSQL SQLSTATE](https://www.postgresql.org/docs/18/errcodes-appendix.html)。', '')
  return lines.join('\n')
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const inventory = await buildInventory()
  inventory.reportPrefix = process.argv.includes('--pg02') ? 'PG-02' : 'PG-00'
  const output = path.join(root, 'docs/ops/evidence/stability')
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, inventory.reportPrefix + '-inventory.json'), JSON.stringify(inventory, null, 2) + '\n')
  await fs.writeFile(path.join(output, inventory.reportPrefix + '-inventory.md'), renderInventory(inventory))
  console.log(JSON.stringify({ files: inventory.files.length, tables: inventory.schemas.length, productionConnections: false }))
}
