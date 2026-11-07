const { createSqliteStore } = require('../../dist/src/database/sqlite');
const { createSecurityAuditDispatcher } = require('../../dist/src/security/audit-outbox');
const [mainFile, auditFile] = process.argv.slice(2);
const create = (filename, schema) => process.env.DATABASE_DRIVER === 'postgres'
  ? require('../../dist/src/database/postgres.js').createPostgresStore({ connectionString: process.env.POSTGRES_URL, schema })
  : createSqliteStore(filename);
const main = create(mainFile, 'main'), audit = create(auditFile, 'audit'), run = main.run;
main.run = (sql, params) => {
  if (/^UPDATE security_audit_outbox SET delivered_at/.test(sql)) {
    process.stdout.write('AUDIT_COMMITTED_BEFORE_ACK', () => process.kill(process.pid, 'SIGKILL'));
    return new Promise(() => {});
  }
  return run(sql, params);
};
createSecurityAuditDispatcher(main, audit, () => {}).flush().then(() => { process.exitCode = 2; }).catch(() => { process.exitCode = 3; });
