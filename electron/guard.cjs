const MB = 1000000;
const defaults = { threshold: 60, alarmSeconds: 3, stopSeconds: 5, autoBlock: false, quitClash: false, sound: true, notification: true, startup: false, minuteMB: 0, hourMB: 0, dayMB: 0, endpoint: '', secret: '' };
function validate(input) {
  const out = { ...defaults };
  for (const k of ['threshold', 'alarmSeconds', 'stopSeconds', 'minuteMB', 'hourMB', 'dayMB']) {
    const n = Number(input[k]);
    if (!Number.isFinite(n) || n < (['threshold','alarmSeconds','stopSeconds'].includes(k) ? 1 : 0) || n > 100000000) throw Error('阈值或时间无效');
    out[k] = n;
  }
  if (out.stopSeconds < out.alarmSeconds) throw Error('阻断时间不能短于报警时间');
  for (const k of ['autoBlock','quitClash','sound','notification','startup']) out[k] = input[k] === true;
  out.endpoint = String(input.endpoint || '').trim();
  out.secret = String(input.secret || '');
  if (out.endpoint && !/^\\\\\.\\pipe\\[\w.-]+$/.test(out.endpoint)) {
    let u; try { u = new URL(out.endpoint); } catch { throw Error('请输入 http://127.0.0.1:端口 或 Windows 命名管道'); }
    if (u.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('接口仅允许本机 HTTP 地址或命名管道');
  }
  return out;
}
function dayKey(now) { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
class Guard {
  constructor(config, saved = {}) {
    this.config = config; this.day = saved.day; this.today = saved.today || 0;
    this.samples = (saved.samples || []).filter(s => s.t > Date.now() - 3600000);
    this.reset();
  }
  reset() { this.last = null; this.overSince = null; this.alarmed = false; this.tripped = false; this.quotaAlarmed = false; }
  sample(up, down, now = Date.now(), measuredBytes) {
    if (![up,down].every(n => Number.isFinite(n) && n >= 0)) throw Error('流量数据无效');
    const gap = this.last === null ? 0 : now - this.last;
    if (gap > 2500 || gap < 0) { this.overSince = null; this.alarmed = false; }
    const dt = gap > 0 && gap <= 2500 ? gap / 1000 : 0;
    this.last = now;
    if (this.day !== dayKey(now)) { this.day = dayKey(now); this.today = 0; }
    const total = up + down, bytes = measuredBytes ?? total * dt;
    this.today += bytes; this.samples.push({t:now,b:bytes});
    this.samples = this.samples.filter(s => s.t > now - 3600000);
    const minute = this.samples.reduce((v,s) => v + (s.t > now-60000 ? s.b : 0), 0);
    const hour = this.samples.reduce((v,s) => v+s.b, 0);
    const c = this.config, limit = c.threshold * MB / 60;
    if (total > limit) this.overSince ??= now;
    else { this.overSince = null; this.alarmed = false; }
    const seconds = this.overSince === null ? 0 : (now-this.overSince)/1000;
    const quota = [[c.minuteMB,minute,'最近一分钟'],[c.hourMB,hour,'最近一小时'],[c.dayMB,this.today,'今日']].find(([l,v]) => l > 0 && v > l*MB);
    if (!quota) this.quotaAlarmed = false;
    const alarm = (seconds >= c.alarmSeconds && !this.alarmed) || (!!quota && !this.quotaAlarmed);
    if (seconds >= c.alarmSeconds) this.alarmed = true;
    if (quota) this.quotaAlarmed = true;
    const trip = c.autoBlock && !this.tripped && (seconds >= c.stopSeconds || !!quota);
    if (trip) this.tripped = true;
    return {up,down,total,minute,hour,today:this.today,seconds,alarm,trip,reason:quota ? `${quota[2]}累计流量超过 ${quota[0]} MB` : `流速超过 ${c.threshold} MB/min，已持续 ${Math.floor(seconds)} 秒`,level: quota || seconds >= c.alarmSeconds ? 'danger' : total >= limit*.8 ? 'warn' : 'normal'};
  }
  persist() { return {day:this.day,today:this.today,samples:this.samples}; }
}
module.exports = {Guard,defaults,validate,MB};
