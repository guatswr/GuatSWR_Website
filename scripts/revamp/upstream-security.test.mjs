import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)

// Upstream GHSA-m5mm-p8h7-m29v: a delimiter supplied by the surrounding
// serialization must not complete an unescaped end-of-function script tag.
test('serialized function source cannot close the surrounding script element', () => {
  const serialize = require('serialize-javascript')
  function first() {} first.toString = () => 'function first(){ return 1 }//</script'
  function second() {} second.toString = () => 'function second(x){ return x } > <img src=x onerror=alert(1)>'
  assert.doesNotMatch(serialize({ a: { first }, second }, { space: 2 }), /<\/script(?:\s|\/|>)/i)
})

// Upstream GHSA-w74x-v6f9-j3xg: RFC schemes cannot contain percent escapes.
test('URI normalization does not turn percent-encoded schemes into executable schemes', () => {
  const uri = require('fast-uri')
  for (const value of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    assert.notEqual(uri.parse(value).scheme, 'javascript')
    assert.doesNotMatch(uri.normalize(value), /^javascript:/i)
    assert.throws(() => uri.resolve('https://a.example/', value), /malformed/)
  }
  assert.equal(uri.equal('%68ttp://a/', 'http://a/'), false)
})

// Upstream GHSA-27r3-jxmh-p828. A separate process proves the parser survives
// a complete compressed frame followed by a delayed trailing chunk.
test('compressed request trailing bytes cannot crash the HTTP process', async () => {
  const code = String.raw`
    const http=require('node:http'),zlib=require('node:zlib'),bodyParser=require('body-parser');
    const parse=bodyParser.json(),first=Buffer.concat([zlib.deflateSync(Buffer.from('{}')),Buffer.from([0])]),trailing=Buffer.alloc(1024);
    let client;
    const server=http.createServer((req,res)=>parse(req,res,error=>{
      if(error)throw error;
      req.once('end',()=>res.end('ok'));
      client.end(trailing);
    }));
    server.listen(0,'127.0.0.1',()=>{
      const req=client=http.request({host:'127.0.0.1',port:server.address().port,agent:false,method:'POST',headers:{'content-type':'application/json','content-encoding':'deflate','content-length':first.length+trailing.length}},res=>{
        res.resume();res.on('end',()=>setTimeout(()=>server.close(()=>process.stdout.write('survived')),50));
      });
      req.on('error',error=>{if(error.code!=='EPIPE'&&error.code!=='ECONNRESET')throw error});
      req.write(first);
    });`
  const { stdout } = await promisify(execFile)(process.execPath, ['-e', code], { cwd: new URL('../..', import.meta.url), timeout: 5000, maxBuffer: 16384 })
  assert.equal(stdout, 'survived')
})
