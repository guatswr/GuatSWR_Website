const { createSqliteStore } = require('../../dist/src/database/sqlite');
const { createSecurityAuditDispatcher } = require('../../dist/src/security/audit-outbox');
const [mainFile, auditFile] = process.argv.slice(2);
const main = createSqliteStore(mainFile), audit = createSqliteStore(auditFile), run = main.run;
main.run = (sql, params) => {
  if (/^UPDATE security_audit_outbox SET delivered_at/.test(sql)) {
    process.stdout.write('AUDIT_COMMITTED_BEFORE_ACK', () => process.kill(process.pid, 'SIGKILL'));
    return new Promise(() => {});
  }
  return run(sql, params);
};
createSecurityAuditDispatcher(main, audit, () => {}).flush().then(() => { process.exitCode = 2; }).catch(() => { process.exitCode = 3; });
