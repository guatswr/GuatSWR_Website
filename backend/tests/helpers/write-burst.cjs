const { createSqliteStore } = require(process.argv[2]);
const store = createSqliteStore(process.argv[3]);
(async () => {
  let callbacks = 0;
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => store.transaction(async tx => {
      callbacks++;
      const result = await tx.run('INSERT INTO items(label) VALUES (?)', [`burst-${index}`]);
      await tx.get('SELECT id FROM items WHERE id=?', [result.lastID]);
    })));
    console.log(JSON.stringify({ callbacks, fulfilled: results.filter(item => item.status === 'fulfilled').length,
      rejected: results.filter(item => item.status === 'rejected').map(item => item.reason.kind || 'unexpected') }));
  } finally { await store.close(); }
})().catch(() => { process.exitCode = 1; });
