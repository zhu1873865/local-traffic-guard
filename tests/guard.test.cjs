const {test}=require('node:test'),assert=require('node:assert/strict');
const {Guard,defaults,validate}=require('../electron/guard.cjs');
const {ConnectionMeter,classify}=require('../electron/classifier.cjs');
const {block,enforce,restore}=require('../electron/protection.cjs');
test('60 MB/min = 1 MB/s; spikes reset; alarm 3 s and trip 5 s exactly once',()=>{
 const g=new Guard({...defaults,autoBlock:true});let s;
 for(let i=0;i<=5;i++){s=g.sample(100001,1000000,i*1000);assert.equal(s.alarm,i===3);assert.equal(s.trip,i===5);}
 assert.equal(g.sample(0,2000000,6000).trip,false);
 const h=new Guard({...defaults,autoBlock:true});h.sample(0,2000000,0);h.sample(0,0,1000);assert.equal(h.sample(0,2000000,2000).seconds,0);
 assert.equal(h.sample(0,2000000,9000).trip,false);
 assert.equal(new Guard(defaults).sample(0,1000000,0).level,'warn');
});
test('quotas, midnight and restart persistence; offline gaps do not add traffic',()=>{
 const g=new Guard({...defaults,minuteMB:1,autoBlock:true}),t=new Date(2026,8,18,23,59,58).getTime();
 g.sample(0,600000,t);assert.equal(g.sample(0,600000,t+1000).trip,false);
 const s=g.sample(0,600000,t+2000);assert.equal(s.trip,true);assert.equal(s.today,600000);
 const saved=g.persist();assert.equal(new Guard(defaults,saved).today,600000);
 assert.equal(g.sample(0,600000,t+20000).today,600000);
});
test('settings validation rejects remote endpoints and invalid thresholds',()=>{
 assert.throws(()=>validate({...defaults,threshold:NaN}));assert.throws(()=>validate({...defaults,stopSeconds:2}));
 assert.throws(()=>validate({...defaults,endpoint:'http://example.com:9090'}));
 assert.equal(validate({...defaults,endpoint:'\\\\.\\pipe\\verge-mihomo'}).threshold,60);
});
const proxies={'DIRECT':{type:'Direct'},'Custom direct':{type:'Direct'},'Node':{type:'Shadowsocks'},'Group':{type:'Selector'}};
const conn=(id,download,chains,start=0)=>({id,upload:0,download,chains,start:new Date(start).toISOString()});
const snap=(downloadTotal,connections)=>({uploadTotal:0,downloadTotal,connections});
test('classifies actual chain: DIRECT inside selector is not proxy, custom direct recognized',()=>{
 assert.equal(classify(['DIRECT','Group'],proxies),'direct');assert.equal(classify(['Custom direct','Group'],proxies),'direct');
 assert.equal(classify(['Node','Group'],proxies),'proxy');assert.equal(classify(['DIRECT','Node','Group'],proxies),'proxy');
 assert.equal(classify(['missing'],proxies),'unknown');assert.equal(classify([],proxies),'unknown');
});
test('1 GB DIRECT download never triggers PROXY protection; proxy sustained does',()=>{
 const m=new ConnectionMeter(),g=new Guard({...defaults,autoBlock:true});
 for(let i=0;i<=12;i++){
  const s=m.sample(snap(i*100000000,[conn('d',i*100000000,['DIRECT','Group'])]),proxies,i*1000);
  assert.equal(s.proxy.down,0);assert.equal(g.sample(s.proxy.up,s.proxy.down,i*1000).trip,false);
 }
 const n=new ConnectionMeter(),h=new Guard({...defaults,autoBlock:true});let tripped=false;
 for(let i=0;i<=7;i++){const s=n.sample(snap(i*2000000,[conn('p',i*2000000,['Node','Group'])]),proxies,i*1000);if(h.sample(s.proxy.up,s.proxy.down,i*1000).trip)tripped=true;}
 assert.equal(tripped,true);
});
test('startup baseline, short connections, counter resets and reconnect do not invent PROXY traffic',()=>{
 const m=new ConnectionMeter();assert.equal(m.sample(snap(900000000,[conn('old',900000000,['Node'])]),proxies,1000).proxy.down,0);
 const s=m.sample(snap(902000000,[]),proxies,2000);assert.equal(s.proxy.down,0);assert.equal(s.unknown.down,2000000);
 assert.equal(m.sample(snap(100,[]),proxies,3000).valid,false);
 assert.equal(m.sample(snap(5000000,[conn('new',4900000,['Node'])]),proxies,9000).proxy.down,0);
});
test('new connections count only traffic created after previous snapshot',()=>{
 const m=new ConnectionMeter();m.sample(snap(0,[]),proxies,1000);
 const s=m.sample(snap(3000,[conn('new',2000,['Node'],1100),conn('old',1000,['Node'],0)]),proxies,2000);
 assert.equal(s.proxy.down,2000);assert.equal(s.unknown.down,1000);
});
test('block persists recovery before changing core, verifies REJECT and restores mode',async()=>{
 let mode='rule',now='Node',saved=null,closed=0;
 const api=async(route,method,body)=>{
  if(method){assert.ok(saved);if(route==='/configs')mode=body.mode;else if(route==='/proxies/GLOBAL')now=body.name;else if(route==='/connections')closed++;return {};}
  return route==='/configs'?{mode}:{all:['Node','REJECT'],now};
 };
 await block(api,s=>saved=s);assert.equal(mode,'global');assert.equal(now,'REJECT');assert.equal(closed,1);
 mode='rule';await enforce(api);assert.equal(mode,'global');await restore(api,saved);assert.equal(mode,'rule');assert.equal(now,'Node');
});
test('missing REJECT never mutates core; partial failures retain recovery',async()=>{
 let mutations=0,saved;
 await assert.rejects(block(async(route,method)=>{if(method)mutations++;return route==='/configs'?{mode:'rule'}:{all:['DIRECT'],now:'DIRECT'};},()=>{}));assert.equal(mutations,0);
 await assert.rejects(block(async(route,method)=>{if(method)throw Error('denied');return route==='/configs'?{mode:'rule'}:{all:['REJECT'],now:'DIRECT'};},s=>saved=s));assert.equal(saved.mode,'rule');
});
