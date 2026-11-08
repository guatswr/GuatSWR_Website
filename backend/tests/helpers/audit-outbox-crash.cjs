const { createSecurityAuditDispatcher } = require('../../dist/src/security/audit-outbox');
const create = (_filename, schema) => require('../../dist/src/database/postgres.js').createPostgresStore({ connectionString: process.env.POSTGRES_URL, schema });
const [mainFile, auditFile] = process.argv.slice(2);
const main = create(mainFile, 'main'), audit = create(auditFile, 'audit'), run = main.run;
main.run = (sql, params) => {
  if (/^UPDATE security_audit_outbox SET delivered_at/.test(sql)) {
    process.stdout.write('AUDIT_COMMITTED_BEFORE_ACK', () => process.kill(process.pid, 'SIGKILL'));
    return new Promise(() => {});
  }
  return run(sql, params);
};
createSecurityAuditDispatcher(main, audit, () => {}).flush().then(() => { process.exitCode = 2; }).catch(() => { process.exitCode = 3; });
