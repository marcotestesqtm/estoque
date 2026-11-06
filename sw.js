const V="estoque-v1",LOCAL=["./","index.html","shim.js","firebase-config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"];
const CDN=["www.gstatic.com","cdnjs.cloudflare.com","cdn.jsdelivr.net","fonts.googleapis.com","fonts.gstatic.com"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(LOCAL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  const mesmo=u.origin===location.origin,cdn=CDN.includes(u.host);
  if(!mesmo&&!cdn)return; // Firebase (dados/login) e Google Sheets passam direto
  e.respondWith(caches.open(V).then(async c=>{
    const guardado=await c.match(r);
    const rede=fetch(r).then(resp=>{if(resp&&(resp.ok||resp.type==="opaque"))c.put(r,resp.clone());return resp;}).catch(()=>guardado);
    return mesmo?(rede.then(x=>x||guardado)):(guardado||rede);
  }));
});
