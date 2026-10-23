const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createEventContentPersister } = require('./eventContentStorage');

const loadStorage = (publicDir) => {
  // Load the existing real filesystem helpers without opening the production SQLite DB.
  const filename = path.join(__dirname, 'storage.js');
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const load = (name) => name === '../models/db'
    ? { PUBLIC_DIR: publicDir, IMG_ROOT_DIR: path.join(publicDir, 'img') }
    : nativeRequire(name);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInThisContext(`(function(require, module, exports) { ${source}\n})`, { filename })(load, module, module.exports);
  return module.exports({ PUBLIC_DIR: publicDir, IMG_ROOT_DIR: path.join(publicDir, 'img') });
};

test('admin content images and thumbnails persist outside staging and survive its cleanup', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'guatswr-event-storage-'));
  t.after(async () => {
    const absolute = path.resolve(tempRoot);
    const relative = path.relative(path.resolve(os.tmpdir()), absolute);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.ok(path.basename(absolute).startsWith('guatswr-event-storage-'));
    await fs.promises.rm(absolute, { recursive: true, force: true });
  });
  const publicDir = path.join(tempRoot, 'public');
  const stagingDir = path.join(publicDir, 'upload');
  await fs.promises.mkdir(stagingDir, { recursive: true });
  await fs.promises.writeFile(path.join(stagingDir, 'cover.png'), 'original fixture');
  await fs.promises.writeFile(path.join(stagingDir, 'cover-thumb.webp'), 'thumbnail fixture');
  await fs.promises.writeFile(path.join(stagingDir, 'unused.png'), 'abandoned fixture');
  const storage = loadStorage(publicDir);
  const persist = createEventContentPersister({ imageRoot: path.join(publicDir, 'img'), moveStagedFile: storage.moveStagedFile });
  const input = {
    cover: '/uploads/upload/cover.png',
    thumbnail: '/uploads/upload/cover-thumb.webp',
    initiator: { avatar: '/uploads/upload/cover.png', id: '⑨', future: true },
    results: [{ rank: 1, avatar: '/uploads/img/events/12/avatars/player.png' }],
    external: 'https://example.com/uploads/upload/remote.png',
    visitorUpload: '/uploads/img/events/12/already-persistent.png',
    notes: 'A text reference /uploads/upload/example.png stays ordinary text',
    nested: [null, 9, false, { image: '/uploads/upload/cover.png' }]
  };
  const snapshot = JSON.stringify(input);
  const output = await persist(input, 12);
  const finalUrl = '/uploads/img/events/12/cover.png';
  assert.equal(output.cover, finalUrl);
  assert.equal(output.thumbnail, '/uploads/img/events/12/cover-thumb.webp');
  assert.equal(output.initiator.avatar, finalUrl, 'duplicate image references must share the moved URL');
  assert.equal(output.nested[3].image, finalUrl);
  assert.equal(output.external, input.external);
  assert.equal(output.visitorUpload, input.visitorUpload);
  assert.equal(output.notes, input.notes);
  assert.deepEqual(output.results, input.results);
  assert.deepEqual(output.nested.slice(0, 3), [null, 9, false]);
  assert.equal(JSON.stringify(input), snapshot, 'the caller content is not mutated');
  assert.equal(await fs.promises.readFile(path.join(publicDir, 'img/events/12/cover.png'), 'utf8'), 'original fixture');
  assert.equal(await fs.promises.readFile(path.join(publicDir, 'img/events/12/cover-thumb.webp'), 'utf8'), 'thumbnail fixture');
  await storage.cleanupStaging(-1);
  assert.deepEqual(await fs.promises.readdir(stagingDir), []);
  assert.ok(fs.existsSync(path.join(publicDir, 'img/events/12/cover.png')));
  assert.ok(fs.existsSync(path.join(publicDir, 'img/events/12/cover-thumb.webp')));
});

test('persistent and external content does not invoke staging moves; invalid EIDs fail before touching files', async () => {
  let moves = 0;
  const persist = createEventContentPersister({ imageRoot: os.tmpdir(), moveStagedFile: async () => { moves += 1; } });
  const content = {
    cover: 'https://example.com/a.png', avatar: '/uploads/img/events/5/a.png', results: [], future: { active: true },
    escaping: '/uploads/upload/../private.png', windowsPath: '/uploads/upload/..\\private.png', parent: '/uploads/upload/..'
  };
  assert.deepEqual(await persist(content, 5), content);
  for (const id of ['../outside', 0, -1, 1.5]) await assert.rejects(persist(content, id), /Invalid event id/);
  assert.equal(moves, 0);
});

const loadEventRoute = (moveStagedFile) => {
  const filename = path.join(__dirname, '../routes/event.js');
  const nativeRequire = createRequire(filename);
  const handlers = [];
  const writes = [];
  const notifications = [];
  const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (url, ...callbacks) => handlers.push({ method, url, handle: callbacks.at(-1) })]));
  const db = {
    run(sql, ...args) {
      const callback = args.at(-1);
      writes.push({ sql, params: Array.isArray(args[0]) ? args[0] : [] });
      if (typeof callback === 'function') callback.call({ lastID: 42, changes: 1 }, null);
    },
    get(sql, params, callback) { callback(null, { id: 42, status: 'ended' }); }
  };
  const mocks = {
    express: { Router: () => router },
    '../models/db': { db, addLog() {}, IMG_ROOT_DIR: path.join(os.tmpdir(), 'guatswr-test-images') },
    '../middlewares/auth': {},
    '../utils/botHooks': { callBotHook: async (...args) => { notifications.push(args); } },
    '../utils/storage': { moveStagedFile }
  };
  const module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInThisContext(`(function(require, module, exports) { ${source}\n})`, { filename })(
    (name) => mocks[name] || nativeRequire(name), module, module.exports
  );
  const { createGuestDraftProofGuard } = nativeRequire('../../dist/src/security/guest-draft-proof.js');
  module.exports({ ...mocks['../models/db'], auth: {}, storage: mocks['../utils/storage'],
    guestProof: createGuestDraftProofGuard({ secret: 'synthetic-content-proof-key-32-characters', mode: 'required' }) });
  writes.length = 0;
  return {
    writes, notifications,
    request: (method, url, body) => new Promise((resolve, reject) => {
      const handler = handlers.find((item) => item.method === method && item.url === url).handle;
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
      Promise.resolve(handler({ body, params: { id: 42 }, user: { id: 1, username: 'admin', role: 'admin' }, ip: '127.0.0.1' }, response)).catch(reject);
    })
  };
};

test('admin route publishes only after content URLs persist and notifies with final URLs', async () => {
  const route = loadEventRoute(async () => '/uploads/img/events/42/cover.png');
  const response = await route.request('post', '/admin', { type: 'STG', title: '比赛', content: { cover: '/uploads/upload/cover.png', results: [{ rank: 1 }] }, status: 'published' });
  assert.equal(response.status, 200);
  assert.equal(route.writes[0].params[3], 'draft', 'the event must not become public while files are being moved');
  assert.equal(route.writes[1].params[1], 'published');
  const content = JSON.parse(route.writes[1].params[0]);
  assert.equal(content.cover, '/uploads/img/events/42/cover.png');
  assert.deepEqual(content.results, [{ rank: 1 }]);
  assert.equal(route.notifications[0][1].content.cover, content.cover);
});

test('edit route stores final URLs and retains content without resetting event status', async () => {
  const route = loadEventRoute(async () => '/uploads/img/events/42/cover.png');
  const response = await route.request('put', '/:id', { type: 'STG', title: '修改', content: { cover: '/uploads/upload/cover.png', results: [{ rank: 1 }], future: { active: true } }, submit: false });
  assert.equal(response.status, 200);
  assert.equal(route.writes.length, 1);
  assert.ok(!route.writes[0].sql.includes('status = ?'));
  const content = JSON.parse(route.writes[0].params[2]);
  assert.equal(content.cover, '/uploads/img/events/42/cover.png');
  assert.deepEqual(content.results, [{ rank: 1 }]);
  assert.deepEqual(content.future, { active: true });
});

test('failed image persistence does not leave a publicly created activity', async () => {
  const route = loadEventRoute(async () => { throw new Error('disk unavailable'); });
  const response = await route.request('post', '/admin', { type: 'STG', title: '比赛', content: { cover: '/uploads/upload/cover.png' } });
  assert.equal(response.status, 500);
  assert.ok(route.writes[1].sql.startsWith('DELETE FROM events'));
  assert.equal(route.notifications.length, 0);
});
