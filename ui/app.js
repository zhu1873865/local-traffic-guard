const $=s=>document.querySelector(s),form=$('#settings');let initialized=false,history=[],lastSample;
const rate=n=>n>=1e6?`${(n/1e6).toFixed(2)} MB/s`:`${(n/1000).toFixed(1)} KB/s`;
const amount=n=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:`${(n/1e6).toFixed(2)} MB`;
function fill(c){for(const [k,v]of Object.entries(c)){const el=form.elements.namedItem(k);if(el){if(el.type==='checkbox')el.checked=v;else el.value=v;}}initialized=true;equivalent();}
function equivalent(){const n=Number(form.elements.threshold.value);$('#equivalent').textContent=`${n} MB/min 相当于 ${(n/60).toFixed(2)} MB/s；瞬时回落会重置持续计时。`;}
form.elements.threshold.addEventListener('input',equivalent);
function render(s){
 if(!initialized)fill(s.config);
 document.body.dataset.level=s.blocked?'danger':s.level;
 $('#total').textContent=s.connected?(s.total/1e6).toFixed(2):'--';$('#up').textContent=rate(s.up);$('#down').textContent=rate(s.down);
 for(const k of ['minute','hour','today'])$('#'+k).textContent=amount(s[k]);
 $('#badge').textContent=s.blocked?s.verified?'保护已锁定':'阻断待确认':!s.connected?'等待内核':s.config.autoBlock?'自动保护开启':'仅报警模式';
 $('#status').textContent=s.message;$('#endpoint').textContent=`当前接口：${s.endpoint} · ${s.source}`;
 $('#restore').disabled=!s.blocked||s.busy;$('#block').disabled=!s.connected||s.blocked||s.busy;
 const split=s.split;
 for(const [id,key]of [['all','total'],['proxy','proxy'],['direct','direct'],['unknown','unknown']])$('#'+id+'-rate').textContent=s.connected&&split?rate(split[key].up+split[key].down):'--';
 if(Date.now()-(lastSample||0)>800){history.push(s.total);if(history.length>60)history.shift();lastSample=Date.now();}
 const peak=Math.max(...history,0),max=Math.max(peak,1e5);$('#chart').setAttribute('points',history.map((n,i)=>`${i*340/Math.max(59,history.length-1)},${89-n/max*78}`).join(' '));$('#peak').textContent=rate(peak);
 $('#logs').replaceChildren(...s.logs.map(l=>{const d=document.createElement('div');d.textContent=`${l.time}  ${l.message}`;return d;}));
}
window.guard.subscribe(render);window.guard.state().then(render);
form.addEventListener('submit',async e=>{e.preventDefault();const c={};for(const el of form.elements){if(el.name)c[el.name]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}try{const s=await window.guard.save(c);fill(s.config);render(s);$('#feedback').textContent='设置已保存';}catch(e){$('#feedback').textContent=e.message;}});
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',async()=>{try{const s=await window.guard.action(b.dataset.action);render(s);$('#feedback').textContent=b.dataset.action==='restore'?'已恢复连接':b.dataset.action==='test'?'已触发测试报警':'操作已完成，请查看运行记录';}catch(e){$('#feedback').textContent=e.message;}});
