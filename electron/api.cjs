const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
function scalar(text, key) {
  const line = text.split(/\r?\n/).find(l => l.startsWith(`${key}:`));
  if (!line) return '';
  const s = line.slice(key.length + 1).trim();
  if (s.startsWith('"')) { try { return JSON.parse(s); } catch { return ''; } }
  if (s.startsWith("'")) return s.slice(1,s.lastIndexOf("'")).replace(/''/g,"'");
  return s.replace(/\s+#.*$/, '').trim();
}
function discover(config = {}) {
  if (config.endpoint) return { endpoint:config.endpoint,secret:config.secret || '',source:'手动配置' };
  const base = process.env.APPDATA || '';
  for (const folder of ['io.github.clash-verge-rev.clash-verge-rev','io.github.clash-verge-rev.clash-verge','clash-verge']) {
    for (const name of ['clash-verge.yaml','config.yaml']) {
      const file = path.join(base,folder,name);
      try {
        const t = fs.readFileSync(file,'utf8');
        const pipe = scalar(t,'external-controller-pipe'), address = scalar(t,'external-controller');
        const endpoint = pipe || (address ? `http://${address.replace(/^0\.0\.0\.0:/,'127.0.0.1:')}` : '');
        if (endpoint) return { endpoint, secret:scalar(t,'secret'), source:`自动发现 · ${name}` };
      } catch {}
    }
  }
  return {endpoint:'http://127.0.0.1:9090',secret:'',source:'默认本机接口'};
}
function options(target, route, method='GET') {
  const base = target.endpoint.startsWith('\\\\') ? {socketPath:target.endpoint} : (() => {const u = new URL(target.endpoint); return {hostname:u.hostname.replace(/^\[|\]$/g,''),port:u.port || 80};})();
  return {...base,path:route,method,agent:false,headers:{...(target.secret ? {Authorization:`Bearer ${target.secret}`} : {}),'Content-Type':'application/json'}};
}
function request(target, route, method='GET', body) {
  return new Promise((resolve,reject) => {
    const req = http.request(options(target,route,method), res => {
      let data=''; res.setEncoding('utf8');
      res.on('data',chunk => {data+=chunk; if(data.length>8000000) req.destroy(Error('响应过大'));});
      res.on('error',reject);
      res.on('end',()=> {if(res.statusCode>=300) return reject(Error(`API ${res.statusCode}：${route}`)); try {resolve(data ? JSON.parse(data) : {});} catch {reject(Error('API 返回格式异常'));}});
    });
    const timeout=setTimeout(()=>req.destroy(Error('接口请求超时')),4000);
    req.on('close',()=>clearTimeout(timeout)); req.on('error',reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
function stream(target,onSample,onError) {
  let closed=false, buffer='', response;
  const req = http.request(options(target,'/traffic'),res=> {
    response=res;
    if(res.statusCode!==200) { fail(Error(`流量接口 ${res.statusCode}${res.statusCode===401 ? '，请检查密钥' : ''}`));return; }
    res.setEncoding('utf8');
    res.on('data',chunk=> {
      buffer+=chunk;
      if(buffer.length>65536) return fail(Error('流量响应异常'));
      let i;
      while((i=buffer.indexOf('\n'))>=0) {
        const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;
        try {const s=JSON.parse(line);if(![s.up,s.down].every(n=>Number.isFinite(n)&&n>=0))throw Error('流量数据无效');onSample(s);}catch(e){fail(e);return;}
      }
    });
    res.on('end',()=>fail(Error('内核已断开')));res.on('error',fail);
  });
  function fail(e) {if(closed)return;closed=true;req.destroy();response?.destroy();onError(e);}
  req.setTimeout(4500,()=>fail(Error('内核未响应（超过 4.5 秒）')));req.on('error',fail);req.end();
  return ()=> {closed=true;req.destroy();response?.destroy();};
}
module.exports={scalar,discover,request,stream};
