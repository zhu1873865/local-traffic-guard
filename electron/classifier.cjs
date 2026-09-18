const transports=new Set(['Shadowsocks','ShadowsocksR','Snell','Socks5','Http','Vmess','Vless','Trojan','Hysteria','Hysteria2','WireGuard','Tuic','Ssh','Mieru','AnyTLS','Sudoku','Masque','TrustTunnel','ShadowQuic','OpenVPN','Tailscale','ZeroTier','EasyTier','GostRelay']);
function classify(chains,proxies) {
  if(!Array.isArray(chains)||!chains.length)return 'unknown';
  // Check all hops: a dialer/relay can have a direct hop AND a proxy transport.
  const types=chains.map(name=>proxies[name]?.type || (name==='DIRECT'?'Direct':name==='REJECT'?'Reject':''));
  if(types.some(t=>transports.has(t)))return 'proxy';
  if(types[0]==='Direct')return 'direct';
  return 'unknown';
}
class ConnectionMeter {
  constructor(){this.reset();}
  reset(){this.previous=null;this.time=null;this.totals=null;}
  sample(snapshot,proxies,now=Date.now()) {
    if(!snapshot||!Number.isFinite(snapshot.uploadTotal)||!Number.isFinite(snapshot.downloadTotal)||!(snapshot.connections===null||Array.isArray(snapshot.connections)))throw Error('连接统计格式无效');
    const list=snapshot.connections || [],current=new Map(),dt=this.time===null?0:(now-this.time)/1000;
    const valid=!!this.previous&&dt>0&&dt<=2.5&&snapshot.uploadTotal>=this.totals.up&&snapshot.downloadTotal>=this.totals.down;
    const bytes={proxy:{up:0,down:0},direct:{up:0,down:0},unknown:{up:0,down:0}};
    for(const c of list){
      if(!c.id||![c.upload,c.download].every(n=>Number.isFinite(n)&&n>=0))continue;
      current.set(c.id,{up:c.upload,down:c.download});
      if(!valid)continue;
      const old=this.previous.get(c.id);
      // Never charge an old connection's lifetime traffic on startup/reconnection.
      if(!old&&!(Date.parse(c.start)>=this.time))continue;
      const kind=classify(c.chains,proxies);
      bytes[kind].up+=Math.max(0,c.upload-(old?.up||0));bytes[kind].down+=Math.max(0,c.download-(old?.down||0));
    }
    const total=valid?{up:(snapshot.uploadTotal-this.totals.up)/dt,down:(snapshot.downloadTotal-this.totals.down)/dt}:{up:0,down:0};
    const result={valid,total,proxy:{up:0,down:0},direct:{up:0,down:0},unknown:{up:0,down:0},count:list.length};
    if(valid)for(const kind of ['proxy','direct','unknown'])for(const d of ['up','down'])result[kind][d]=bytes[kind][d]/dt;
    // Closed-between-samples connections cannot be attributed; never call them PROXY.
    for(const d of ['up','down'])result.unknown[d]=Math.max(result.unknown[d],total[d]-result.proxy[d]-result.direct[d],0);
    this.previous=current;this.time=now;this.totals={up:snapshot.uploadTotal,down:snapshot.downloadTotal};
    result.proxyBytes=bytes.proxy.up+bytes.proxy.down;
    return result;
  }
}
module.exports={classify,ConnectionMeter};
