const { chromium } = require('/opt/npm-tools/node_modules/playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1600,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('phaser.min'))return r.fulfill({body:fs.readFileSync('vendor/phaser.min.js'),contentType:'text/javascript'});if(u.startsWith('file:'))return r.continue();return r.abort()});
await p.goto('file://'+process.cwd()+'/dist/index.html');await p.waitForFunction(()=>window.__ermo?.sim);await p.fill('#m-seed','7');await p.click('#m-new');await p.waitForTimeout(500);
const r=await p.evaluate(async()=>{const S=__ermo.scene,s=S.sim,W=s.world;S.speed=0;S.cameras.main.setZoom(.5);
let m=null,w=null;for(let y=0;y<W.h;y++)for(let x=0;x<W.w;x++){const t=W.terrain[W.idx(x,y)];if(t===4&&!m&&x>20&&y>20)m=[x,y];if(t===2&&!w)w=[x,y]}
S.camMgr.centerTile(W.w/2,W.h/2);S.camMgr.clamp();
const c=performance.now();S._bake('50,50');const bake=performance.now()-c;
const o=S.update.bind(S);let tot=0,n=0;S.update=(a,b)=>{const t=performance.now();o(a,b);tot+=performance.now()-t;n++};
await new Promise(r=>setTimeout(r,1500));return{m,w,bake,upd:tot/n,objs:S.children.list.length,visible:S.children.list.filter(o=>o.visible).length}});
console.log(JSON.stringify(r),errs);await p.screenshot({path:'/tmp/shots/v1.png'});
await p.evaluate(({w})=>{const S=__ermo.scene;S.cameras.main.setZoom(1.5);S.camMgr.centerTile(w[0],w[1])},r);await p.waitForTimeout(2500);await p.screenshot({path:'/tmp/shots/v2.png'});
await p.evaluate(({m})=>{const S=__ermo.scene;S.camMgr.centerTile(m[0],m[1])},r);await p.waitForTimeout(2500);await p.screenshot({path:'/tmp/shots/v3.png'});
await b.close()})();
