const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {request,scalar}=require('../electron/api.cjs');
const {block,restore}=require('../electron/protection.cjs');
test('HTTP integration: auth, block ordering, verification, restore and rejected request',async t=>{
 let mode='rule',selected='DIRECT',closed=false;const calls=[];
 const server=http.createServer((req,res)=>{
  if(req.headers.authorization!=='Bearer test-secret'){res.writeHead(401);res.end('{}');return;}
  let text='';req.on('data',c=>text+=c);req.on('end',()=>{
   calls.push(req.method+' '+req.url);const b=text?JSON.parse(text):{};
   res.setHeader('content-type','application/json');
   if(req.method==='GET')res.end(JSON.stringify(req.url==='/configs'?{mode}:{now:selected,all:['DIRECT','REJECT']}));
   else{if(req.url==='/configs')mode=b.mode;if(req.url==='/proxies/GLOBAL')selected=b.name;if(req.url==='/connections')closed=true;res.writeHead(204);res.end();}
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const target={endpoint:`http://127.0.0.1:${server.address().port}`,secret:'test-secret'};
 let saved;await block((...args)=>request(target,...args),s=>saved=s);
 assert.equal(mode,'global');assert.equal(selected,'REJECT');assert.equal(closed,true);
 assert.deepEqual(calls.slice(2,5),['PUT /proxies/GLOBAL','PATCH /configs','DELETE /connections']);
 await restore((...args)=>request(target,...args),saved);assert.equal(mode,'rule');assert.equal(selected,'DIRECT');
 await assert.rejects(request({...target,secret:'wrong'},'/configs'),/401/);
});
test('config discovery scalar handles empty, quoted and comment values',()=>{
 assert.equal(scalar("external-controller: ''",'external-controller'),'');
 assert.equal(scalar('external-controller-pipe: \\\\.\\pipe\\verge-mihomo','external-controller-pipe'),'\\\\.\\pipe\\verge-mihomo');
 assert.equal(scalar('secret: "a#b"','secret'),'a#b');assert.equal(scalar('secret: abc # comment','secret'),'abc');
});
