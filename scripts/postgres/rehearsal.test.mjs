import {it} from 'node:test'
import assert from 'node:assert/strict'
import {runDualRehearsal} from './rehearsal.mjs'
it('cannot report verification without a real provisioner and verified source bundle',async()=>{
 await assert.rejects(runDualRehearsal({targetUrl1:'postgres://app@127.0.0.1:1/fake_test'}),/REAL_REHEARSAL_PROVISIONER_REQUIRED/)
})
// Actual normal cutover, rollback and post-write cold recovery live in
// backend/tests/postgres/release.test.mjs; no offline PASS simulation exists.
