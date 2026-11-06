const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {spawnSync}=require('node:child_process');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {request:httpRequest}=require('node:http');
const exported=require('./server');
const {createApp}=exported;
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test-secret',SUPABASE_PUBLISHABLE_KEY:'test-public'};

async function serve(t,options){
  const server=createApp(options).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await once(server,'listening');
  return 'http://127.0.0.1:'+server.address().port;
}

function loginRequest(base,origin){
  return new Promise((resolve,reject)=>{
    const target=new URL(base+'/api/auth/login');
    const req=httpRequest(target,{method:'POST',headers:{Host:'site.test',Origin:origin,'X-Forwarded-Proto':'https','Content-Type':'application/json'}},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('error',reject);
      res.on('end',()=>{
        const headers=new Headers();
        for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
      });
    });
    req.on('error',reject);
    req.end(JSON.stringify({email:'test@example.com',password:'test-password'}));
  });
}

test('The Vercel entrypoint exports a callable Express app and preserves the test factory',()=>{
  assert.equal(typeof exported,'function');
  assert.equal(typeof exported.handle,'function');
  assert.equal(typeof exported.listen,'function');
  assert.equal(typeof exported.createApp,'function');
  assert.equal(typeof exported.validate,'function');
});

test('A Vercel cold import neither reads a missing .env file nor starts a listener',()=>{
  const script=`
    process.loadEnvFile=()=>{throw Error('Deployment must use runtime environment, not .env');};
    require('node:net').Server.prototype.listen=()=>{throw Error('Import must not start an HTTP listener');};
    const app=require(${JSON.stringify(join(__dirname,'server.js'))});
    if(typeof app!=='function'||typeof app.createApp!=='function')throw Error('Invalid Vercel entrypoint');
    process.stdout.write('cold-import-ok');
  `;
  const result=spawnSync(process.execPath,['-e',script],{cwd:tmpdir(),env:{...process.env,VERCEL:'1'},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'cold-import-ok');
});

test('A trusted Vercel HTTPS request passes same-origin login and receives Secure HttpOnly cookies',async(t)=>{
  let upstreamRequests=0;
  const base=await serve(t,{env:{...env,VERCEL:'1'},fetchImpl:async()=>{
    upstreamRequests++;
    return Response.json({access_token:'test-access',refresh_token:'test-refresh'});
  }});
  const response=await loginRequest(base,'https://site.test');
  assert.equal(response.status,200,await response.text());
  assert.equal(upstreamRequests,1);
  const cookies=response.headers.getSetCookie();
  assert.equal(cookies.length,2);
  assert.ok(cookies.every(cookie=>cookie.includes('Secure')&&cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax')));
});

test('A local HTTP server does not trust a spoofed forwarded HTTPS header',async(t)=>{
  let upstreamRequests=0;
  const base=await serve(t,{env,fetchImpl:async()=>{
    upstreamRequests++;
    return Response.json({access_token:'test-access',refresh_token:'test-refresh'});
  }});
  const request=origin=>loginRequest(base,origin);
  assert.equal((await request('https://site.test')).status,403);
  assert.equal(upstreamRequests,0);
  const local=await request('http://site.test');assert.equal(local.status,200,await local.text());
  assert.ok(local.headers.getSetCookie().every(cookie=>cookie.includes('HttpOnly')&&!cookie.includes('; Secure')));
});

test('The server can serve its HTML, JavaScript, CSS and real model images from the repository package',async(t)=>{
  const base=await serve(t,{env:{}});
  for(const path of ['/','/admin']){
    const response=await fetch(base+path);assert.equal(response.status,200,path);
    assert.match(response.headers.get('content-type'),/text\/html/);
    assert.match(await response.text(),/<html\b/i);
  }
  for(const [path,type] of [['/app.js',/javascript/],['/rental.css',/text\/css/]]){
    const response=await fetch(base+path);assert.equal(response.status,200,path);
    assert.match(response.headers.get('content-type'),type);
    assert.ok((await response.text()).length>100);
  }
  const image=await fetch(base+'/images/crc-238.png');assert.equal(image.status,200);
  assert.match(image.headers.get('content-type'),/image\/png/);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
});
