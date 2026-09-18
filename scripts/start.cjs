const {spawn}=require('node:child_process'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(path.join(__dirname,'../runtime/electron.exe'),[path.join(__dirname,'..'),...process.argv.slice(2)],{env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exit(code||0));child.on('error',e=>{console.error(e.message);process.exit(1);});
