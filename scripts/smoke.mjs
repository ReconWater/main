#!/usr/bin/env node
/**
 * Read-only smoke verification against a deployed Netlify site.
 * Usage: SITE_URL=https://your-test--site.netlify.app npm run smoke
 * This does not authenticate, submit orders, or change inventory.
 */
const base = process.env.SITE_URL?.trim().replace(/\/$/,'');
if (!base || !/^https:\/\/[\w.-]+(?::\d+)?$/i.test(base)) {
  console.error('Supply SITE_URL as an HTTPS origin (no path), e.g. https://test--example.netlify.app');
  process.exit(2);
}
const failures=[];
const results=[];
const check = (title, success, info='') => {
  results.push({title,success,info});
  if(!success) failures.push(title);
};
const request = async (path,options={}) => {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {return await fetch(`${base}${path}`,{...options,signal:controller.signal,redirect:'follow'});}
  finally {clearTimeout(timeout);}
};
try {
  const [home, admin, api] = await Promise.all([
    request('/'), request('/admin'), request('/.netlify/functions/api?action=dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  ]);
  const homeHtml=await home.text();
  const adminHtml=await admin.text();
  check('Homepage responds successfully',home.ok,`HTTP ${home.status}`);
  check('HTML entry is a React app',homeHtml.includes('id="root"') && /<script[^>]+(?:\/assets\/|\/src\/main)/.test(homeHtml) && !/node_modules\/\s*dist\/\s*\.netlify\//.test(homeHtml),'Rejects the prior .gitignore-as-index.html failure');
  check('Admin route serves HTML shell',admin.ok && adminHtml.includes('id="root"'),`HTTP ${admin.status}`);
  check('Dashboard API rejects unauthenticated requests',api.status===401,`HTTP ${api.status}; 503 suggests missing server-side environment variables`);
  check('Homepage HTML has correct content type',(home.headers.get('content-type')||'').includes('text/html'),home.headers.get('content-type')||'none');
  const match=homeHtml.match(/<script[^>]*\bsrc=["']([^"']+\.js)["']/i);
  if(match){
    const src=match[1].startsWith('/')?match[1]:`/${match[1]}`;
    const asset=await request(src);
    check('Versioned JS bundle loads successfully',asset.ok && /(javascript|ecmascript)/i.test(asset.headers.get('content-type')||''),`HTTP ${asset.status}`);
  } else check('JavaScript bundle found in HTML',false,'No script src ending in .js');
} catch(err) {
  check('HTTPS connection and response',false,err?.message||String(err));
}
for (const r of results) console.log(`${r.success?'PASS':'FAIL'}  ${r.title}${r.info?` — ${r.info}`:''}`);
console.log(`\n${results.length-failures.length}/${results.length} checks passed`);
if(failures.length)process.exitCode=1;
