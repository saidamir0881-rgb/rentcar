const {test}=require('node:test');
const assert=require('node:assert/strict');
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'secret',SUPABASE_PUBLISHABLE_KEY:'public'};
const sample=require('./example-car.json');
const body={first_name:'Test',last_name:'User',email:'test@example.com',password:'test-password',birth_date:'2000-01-01',passport_number:'AA1234567'};
test('Age gate rejects underage, missing and invalid dates at exact birthday boundary',async()=>{
  const {isAdult}=await import('./rentcar-site/worker/api.mjs');
  const now=new Date('2026-11-05T10:00:00Z');
  assert.equal(isAdult('2008-11-05',now),true);
  assert.equal(isAdult('2008-11-06',now),false);
  assert.equal(isAdult('2000-02-30',now),false);
  assert.equal(isAdult('2030-01-01',now),false);
  assert.equal(isAdult('',now),false);
});
test('Car writes require verified server admin; user_metadata cannot grant admin',async()=>{
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  let writes=0;
  const fake=async(url,opts)=>{
    if(url.pathname==='/auth/v1/user')return Response.json({id:'test',app_metadata:{role:'user'},user_metadata:{role:'admin'}});
    writes++;return Response.json([]);
  };
  const req=(auth,origin)=>new Request('https://site.test/cars',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer token'}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(sample)});
  assert.equal((await handleApi(req(false),env,fake)).status,401);
  assert.equal((await handleApi(req(true),env,fake)).status,403);
  assert.equal((await handleApi(req(true,'https://evil.test'),env,fake)).status,403);
  assert.equal(writes,0);
});
async function registrationFixture({createError,profileError,loginError}={}){
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  const calls=[],state={created:false,profileSaved:false,deleted:false};
  const fake=async(url,opts)=>{
    const payload=opts.body?JSON.parse(opts.body):undefined;
    calls.push({url,opts,payload});
    if(url.pathname==='/rest/v1/userlar'&&opts.method==='GET')return Response.json([]);
    if(url.pathname==='/auth/v1/admin/users'&&opts.method==='POST'){
      if(createError)return Response.json(createError.data,{status:createError.status});
      state.created=true;
      return Response.json({id:'new-user',email:body.email,app_metadata:{role:'user'},email_confirmed_at:new Date().toISOString()});
    }
    if(url.pathname==='/rest/v1/userlar'&&opts.method==='POST'){
      if(profileError)return Response.json(profileError.data,{status:profileError.status});
      state.profileSaved=true;return Response.json([payload]);
    }
    if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
      if(loginError)return Response.json(loginError.data,{status:loginError.status});
      return Response.json({access_token:'new-access-token',refresh_token:'new-refresh-token',user:{id:'new-user',email:body.email,app_metadata:{role:'user'}}});
    }
    if(url.pathname==='/auth/v1/admin/users/new-user'&&opts.method==='DELETE'){
      state.deleted=true;state.created=false;return Response.json({id:'new-user'});
    }
    throw Error('Unexpected registration request '+opts.method+' '+url.pathname);
  };
  const register=(values=body)=>handleApi(new Request('https://site.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}),env,fake);
  return {calls,state,register};
}

test('Registration immediately signs in without sending email and cannot grant itself admin privileges',async()=>{
  const f=await registrationFixture();
  assert.equal((await f.register({...body,birth_date:'2020-01-01'})).status,400);assert.equal(f.calls.length,0);
  const response=await f.register({...body,role:'admin',app_metadata:{role:'admin'},user_metadata:{role:'admin'}});
  assert.equal(response.status,201);
  const data=await response.json();assert.equal(data.signedIn,true);
  assert.ok(!JSON.stringify(data).includes('new-access-token'));
  const create=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users'&&c.opts.method==='POST');
  assert.ok(create);
  assert.equal(new Headers(create.opts.headers).get('apikey'),env.SUPABASE_SECRET_KEY);
  assert.equal(create.payload.email,body.email);assert.equal(create.payload.password,body.password);
  assert.equal(create.payload.email_confirm,true);assert.deepEqual(create.payload.app_metadata,{role:'user'});
  assert.ok(!JSON.stringify(create.payload).includes(body.passport_number));
  assert.ok(!JSON.stringify(create.payload).includes('"role":"admin"'));
  const profile=f.calls.find(c=>c.url.pathname==='/rest/v1/userlar'&&c.opts.method==='POST');
  assert.equal(profile.payload.passport_number,body.passport_number);assert.equal(profile.payload.id,'new-user');assert.ok(!Object.hasOwn(profile.payload,'password'));
  const login=f.calls.find(c=>c.url.pathname==='/auth/v1/token');
  assert.equal(new Headers(login.opts.headers).get('apikey'),env.SUPABASE_PUBLISHABLE_KEY);
  assert.deepEqual(login.payload,{email:body.email,password:body.password});
  assert.ok(!f.calls.some(c=>['/auth/v1/signup','/auth/v1/invite','/auth/v1/otp','/auth/v1/recover','/auth/v1/resend'].includes(c.url.pathname)));
  const cookies=response.headers.getSetCookie();assert.equal(cookies.length,2);
  assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')&&c.includes('Secure')));
  assert.equal(f.state.deleted,false);
});

test('A profile save failure rolls back only the newly created auth user and never attempts login',async()=>{
  const f=await registrationFixture({profileError:{status:409,data:{code:'23505'}}});
  const response=await f.register();assert.equal(response.status,409);
  assert.equal(f.state.created,false);assert.equal(f.state.profileSaved,false);assert.equal(f.state.deleted,true);
  assert.ok(f.calls.some(c=>c.url.pathname==='/auth/v1/admin/users/new-user'&&c.opts.method==='DELETE'));
  assert.ok(!f.calls.some(c=>c.url.pathname==='/auth/v1/token'));
  assert.equal(response.headers.getSetCookie().length,0);
});

test('Duplicate-email registration preserves the existing account without deleting, updating its profile or logging it in',async()=>{
  for(const status of [409,422]){
    const f=await registrationFixture({createError:{status,data:{code:status,error_code:'email_exists',msg:'A user with this email address has already been registered'}}});
    const response=await f.register();assert.equal(response.status,409,JSON.stringify(await response.json()));
    assert.ok(!f.calls.some(c=>c.opts.method==='DELETE'));
    assert.ok(!f.calls.some(c=>c.url.pathname==='/rest/v1/userlar'&&c.opts.method==='POST'));
    assert.ok(!f.calls.some(c=>c.url.pathname==='/auth/v1/token'));
    assert.equal(f.state.deleted,false);assert.equal(response.headers.getSetCookie().length,0);
  }
});

test('A login failure after registration preserves the new account and profile and offers manual login without email confirmation',async()=>{
  const f=await registrationFixture({loginError:{status:503,data:{message:'Temporary authentication outage'}}});
  const response=await f.register();assert.equal(response.status,201);
  const data=await response.json();assert.equal(data.signedIn,false);assert.ok(typeof data.message==='string'&&data.message.length>0);
  assert.ok(!/confirm|tasdiql|gmail/i.test(data.message));
  assert.equal(f.state.created,true);assert.equal(f.state.profileSaved,true);assert.equal(f.state.deleted,false);
  assert.ok(!f.calls.some(c=>c.opts.method==='DELETE'));assert.equal(response.headers.getSetCookie().length,0);
});
test('Login returns HttpOnly cookies, not tokens in JSON; logout clears both cookies',async()=>{
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  const fake=async()=>Response.json({access_token:'secret-access',refresh_token:'secret-refresh'});
  const r=await handleApi(new Request('https://site.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:body.email,password:body.password})}),env,fake);
  assert.equal(r.status,200);assert.ok(!(await r.text()).includes('secret-access'));
  const cookies=r.headers.getSetCookie();assert.equal(cookies.length,2);assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')&&c.includes('Secure')));
  const logout=await handleApi(new Request('https://site.test/api/auth/logout',{method:'POST'}),env,fake);
  assert.ok(logout.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
});
test('Private profiles require login and users cannot enumerate profiles',async()=>{
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  const fake=async()=>Response.json({id:'user-id',app_metadata:{role:'user'}});
  assert.equal((await handleApi(new Request('https://site.test/api/me'),env,fake)).status,401);
  assert.equal((await handleApi(new Request('https://site.test/api/admin/users',{headers:{Authorization:'Bearer token'}}),env,fake)).status,403);
});
