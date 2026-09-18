const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'release','Clash Traffic Guard');
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,'runtime'),out,{recursive:true});
const target=path.join(out,'resources','app');fs.mkdirSync(target,{recursive:true});
for(const entry of ['electron','ui','package.json','README.md'])fs.cpSync(path.join(root,entry),path.join(target,entry),{recursive:true});
// Keep Electron's licenses and resources next to the executable.
fs.copyFileSync(path.join(out,'electron.exe'),path.join(out,'Clash Traffic Guard.exe'));fs.unlinkSync(path.join(out,'electron.exe'));
console.log(out);
