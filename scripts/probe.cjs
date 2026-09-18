const {discover,request}=require('../electron/api.cjs');
const {ConnectionMeter}=require('../electron/classifier.cjs');
(async()=>{
 const t=discover(),version=await request(t,'/version'),group=await request(t,'/proxies/GLOBAL'),proxies=(await request(t,'/proxies')).proxies;
 const meter=new ConnectionMeter();meter.sample(await request(t,'/connections'),proxies);
 await new Promise(r=>setTimeout(r,1100));
 const s=meter.sample(await request(t,'/connections'),proxies);
 // Never print secrets, node names, remote destinations, or individual connections.
 console.log(JSON.stringify({endpoint:t.endpoint,version:version.version,canReject:group.all?.includes('REJECT'),connectionCount:s.count,total:s.total,proxy:s.proxy,direct:s.direct,unknown:s.unknown},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
