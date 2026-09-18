// API mutations are isolated here so protection can be tested against a fake core.
async function block(api, save) {
  const config = await api('/configs');
  const group = await api('/proxies/GLOBAL');
  if (!group.all?.includes('REJECT')) throw Error('内核 GLOBAL 组没有 REJECT，无法安全阻断');
  const original = {mode:config.mode,selected:group.now};
  // Persist BEFORE changing the core, so restart can recover a partial operation.
  save(original);
  await enforce(api);
  return original;
}
async function enforce(api) {
  await api('/proxies/GLOBAL','PUT',{name:'REJECT'});
  await api('/configs','PATCH',{mode:'global'});
  await api('/connections','DELETE');
  const config=await api('/configs'), group=await api('/proxies/GLOBAL');
  if(config.mode!=='global'||group.now!=='REJECT')throw Error('阻断配置校验失败');
}
async function restore(api,original) {
  // Restore mode first: rule/direct routing no longer depends on GLOBAL.
  await api('/configs','PATCH',{mode:original.mode});
  if(original.selected)await api('/proxies/GLOBAL','PUT',{name:original.selected});
  const config=await api('/configs'),group=await api('/proxies/GLOBAL');
  if(config.mode!==original.mode||(original.selected&&group.now!==original.selected))throw Error('恢复配置校验失败');
}
module.exports={block,enforce,restore};
