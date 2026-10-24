const deadline=setTimeout(()=>{console.error('UPLOAD_WORK_PROBE_TIMEOUT');process.exit(1)},8000);deadline.unref();
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {createMultipartParser}=require('../dist/src/storage/multipart');
const defer=()=>Promise.withResolvers();
(async()=>{
 const parent=path.resolve(require('node:os').tmpdir()),root=await fs.mkdtemp(path.join(parent,'guatswr-multipart-abort-'));
 const parser=createMultipartParser(root),release=defer(),extra=defer(),starts=Array.from({length:9},defer),closed=Array.from({length:9},defer),jobs=[],clients=[];
 const bytes=Buffer.from('--guatswr\r\nContent-Disposition: form-data; name="file"; filename="safe.png"\r\nContent-Type: image/png\r\n\r\nsynthetic\r\n--guatswr--\r\n');
 const server=http.createServer((req,res)=>{
  const slot=Number(req.headers['x-slot']);res.once('close',()=>closed[slot].resolve());
  res.status=function(code){this.statusCode=code;return this};res.json=function(body){this.end(JSON.stringify(body));return this};
  parser.upload.single('file')(req,res,error=>{
   if(error){res.status(400).json({error:true});return}
   jobs.push(release.promise.then(()=>{if(!res.destroyed)res.json({ok:true})}).finally(async()=>{if(req.file)await fs.unlink(req.file.path).catch(()=>{});parser.upload.complete?.(req)}));
   starts[slot].resolve();if(slot===8)extra.resolve();
  });
 });
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const send=slot=>{const result=defer(),req=http.request({host:'127.0.0.1',port:server.address().port,method:'POST',agent:false,headers:{'content-type':'multipart/form-data; boundary=guatswr','content-length':bytes.length,'x-slot':String(slot)}},res=>{res.resume();res.once('end',()=>result.resolve(res.statusCode))});req.on('error',()=>{});req.end(bytes);clients.push(req);return result.promise};
 try{
  for(let i=0;i<8;i++){void send(i);await starts[i].promise;clients[i].destroy();await closed[i].promise}
  const status=await Promise.race([send(8),extra.promise.then(()=>0)]);
  console.log(JSON.stringify({status,activeWork:jobs.length,heldLimit:status===429}));
  if(status!==429)process.exitCode=1;
 }finally{
  release.resolve();for(const client of clients)client.destroy();await Promise.all(jobs);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  if(path.dirname(path.resolve(root))!==parent||!path.basename(root).startsWith('guatswr-multipart-abort-'))throw Error('Unsafe cleanup');await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
