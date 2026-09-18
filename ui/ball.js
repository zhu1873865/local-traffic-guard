const ball=document.querySelector('#ball');
function render(s){ball.className=s.blocked?'danger':s.level;document.querySelector('#speed').textContent=s.blocked?s.verified?'锁定':'待确认':s.connected?(s.total/1e6).toFixed(2):'--';document.querySelector('#detail').textContent=s.connected?'PROXY': '等待内核';ball.title=`${s.message}\nPROXY ↑ ${(s.up/1000).toFixed(1)} KB/s  ↓ ${(s.down/1000).toFixed(1)} KB/s\n双击设置 · 右键退出`;}
window.guard.subscribe(render);window.guard.state().then(render);
ball.addEventListener('dblclick',()=>window.guard.action('settings'));
ball.addEventListener('contextmenu',e=>{e.preventDefault();window.guard.action('menu');});
let dragging=false;
ball.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;ball.setPointerCapture(e.pointerId);window.guard.drag('start');});
ball.addEventListener('pointermove',()=>{if(dragging)window.guard.drag('move');});
function end(){if(dragging){dragging=false;window.guard.drag('end');}}
ball.addEventListener('pointerup',end);ball.addEventListener('pointercancel',end);
