const {test}=require('node:test');
const assert=require('node:assert/strict');
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test-secret',SUPABASE_PUBLISHABLE_KEY:'test-public'};
const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const ADMIN='33333333-3333-4333-8333-333333333333';
const YOUNG='44444444-4444-4444-8444-444444444444';
const key=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const today=new Date(Date.now()+5*3600000).toISOString().slice(0,10);
const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const birth=years=>`${Number(today.slice(0,4))-years}-01-01`;
const catalog=[{id:293,brand:'LEXUS',model:'LX570 RS',price:2275000,currency:'UZS',price_unit:'day',minimum_age:23}];

async function fixture(){
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  const objects=new Map([['catalog.json',structuredClone(catalog)]]);
  const users={user:{id:USER,email:'user@example.test',app_metadata:{role:'user'}},other:{id:OTHER,email:'other@example.test',app_metadata:{role:'user'}},admin:{id:ADMIN,email:'admin@example.test',app_metadata:{role:'admin'}},young:{id:YOUNG,email:'young@example.test',app_metadata:{role:'user'}},forged:{id:USER,email:'user@example.test',app_metadata:{role:'user'},user_metadata:{role:'admin'}}};
  const profiles={};
  for(const user of Object.values(users))profiles[user.id]={id:user.id,first_name:'Test',last_name:'Driver',email:user.email,birth_date:birth(user.id===YOUNG?20:30),passport_number:'AA1234567'};
  const faults=new Map();
  const afterCommitFaults=new Map();
  const hooks=new Map();
  const calls=[];
  const objectPrefix='/storage/v1/object/rentcar-catalog/';
  const response=(data,status=200)=>Response.json(data,{status});
  const fake=async(input,options={})=>{
    const url=new URL(input),method=options.method||'GET';
    const headers=new Headers(options.headers);
    let body;try{body=options.body?JSON.parse(options.body):undefined;}catch{}
    calls.push({path:url.pathname,method,body});
    const hook=hooks.get(method+' '+url.pathname);if(hook)await hook({url,method,body,headers});
    const fault=faults.get(method+' '+url.pathname);if(fault)return response(fault.data||{message:'Injected Storage failure'},fault.status||500);
    if(url.pathname==='/auth/v1/user'){
      const user=users[headers.get('authorization')?.replace(/^Bearer /i,'')];
      return user?response(user):response({message:'Unauthorized'},401);
    }
    if(url.pathname==='/rest/v1/userlar'){
      const id=url.searchParams.get('id')?.replace(/^eq\./,'');
      return response(id&&profiles[id]?[profiles[id]]:[]);
    }
    if(url.pathname==='/storage/v1/object/list/rentcar-catalog'){
      const prefix=(body?.prefix||'').replace(/\/$/,'')+'/';
      const list=[...objects.keys()].filter(name=>name.startsWith(prefix)&&!name.slice(prefix.length).includes('/')).sort().map((name,i)=>({name:name.slice(prefix.length),id:key(i+9000),created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z',metadata:{mimetype:'application/json'}}));
      return response(list.slice(body?.offset||0,(body?.offset||0)+(body?.limit||100)));
    }
    if(url.pathname==='/storage/v1/object/rentcar-catalog'&&method==='DELETE'){
      for(const prefix of body?.prefixes||[])objects.delete(prefix);
      return response((body?.prefixes||[]).map(name=>({name})));
    }
    if(url.pathname.startsWith(objectPrefix)){
      const path=decodeURIComponent(url.pathname.slice(objectPrefix.length));
      if(method==='GET')return objects.has(path)?response(structuredClone(objects.get(path))):response({statusCode:'404',error:'not_found',message:'Object not found'},404);
      if(method==='POST'||method==='PUT'){
        if(method==='POST'&&headers.get('x-upsert')!=='true'&&objects.has(path))return response({statusCode:'409',error:'Duplicate',message:'The resource already exists'},409);
        objects.set(path,structuredClone(body));
        const committedFault=afterCommitFaults.get(method+' '+url.pathname);if(committedFault)return response(committedFault.data||{message:'Response lost after committed write'},committedFault.status||500);
        return response({Key:'rentcar-catalog/'+path,Id:key(9999)});
      }
      if(method==='DELETE'){objects.delete(path);return response({message:'Deleted'});}
    }
    throw Error('Unexpected upstream request '+method+' '+url.pathname);
  };
  const request=async(path,{method='GET',body,token='user',origin}={})=>{
    const headers={'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})};
    const r=await handleApi(new Request('https://site.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env,fake);
    return {status:r.status,data:await r.json()};
  };
  const payload=(id=1,extra={})=>({car_id:293,start_date:day(2),end_date:day(5),phone:'+998 90 123 45 67',pickup_location:'Toshkent aeroporti',notes:'Arrival at 10:00',idempotency_key:key(id),...extra});
  const create=(id=1,extra={},token='user')=>request('/api/bookings',{method:'POST',token,body:payload(id,extra)});
  const action=(id,status,extra={})=>request('/api/admin/bookings/'+id,{method:'PUT',token:'admin',body:{status,...extra}});
  return {objects,profiles,faults,afterCommitFaults,hooks,calls,request,payload,create,action};
}

test('Booking requires verified login and is quoted using the stored car rate, not client totals',async()=>{
  const f=await fixture();
  assert.equal((await f.request('/api/bookings',{method:'POST',body:f.payload(),token:null})).status,401);
  const result=await f.create(1,{user_id:OTHER,price:1,daily_price:1,estimated_total:1,status:'confirmed'});
  assert.equal(result.status,201,JSON.stringify(result.data));
  assert.equal(result.data.user_id,USER);
  assert.equal(result.data.status,'pending');
  assert.equal(result.data.days,3);
  assert.equal(result.data.daily_price,2275000);
  assert.equal(result.data.estimated_total,6825000);
  assert.equal(result.data.currency,'UZS');
  const saved=f.objects.get('bookings/'+key(1)+'.json');
  assert.ok(saved);
  assert.equal(saved.customer_name,'Test Driver');
  assert.ok(!JSON.stringify(saved).includes('AA1234567'));
  assert.ok(!Object.hasOwn(saved,'passport_number'));
});

test('Booking validates calendar dates, duration, phone, pickup and model age before saving',async()=>{
  const f=await fixture();
  const bad=[{start_date:day(-1)},{end_date:day(2)},{end_date:day(1)},{end_date:day(368)},{start_date:'2030-02-30',end_date:'2030-03-05'},{start_date:'2027-2-01'},{phone:'123'},{phone:'+998'+('1'.repeat(20))},{pickup_location:' '},{pickup_location:'a'.repeat(201)},{notes:'a'.repeat(1001)},{idempotency_key:'../catalog'},{car_id:'293'},{car_id:999999}];
  for(let i=0;i<bad.length;i++){
    const result=await f.create(i+100,bad[i]);
    assert.ok([400,404].includes(result.status),JSON.stringify({case:bad[i],result}));
  }
  const age=await f.create(200,{},'young');assert.equal(age.status,400,JSON.stringify(age.data));
  assert.equal([...f.objects.keys()].filter(k=>k.startsWith('bookings/')).length,0);
});

test('Booking retries are idempotent, while reusing a key for different data conflicts',async()=>{
  const f=await fixture();
  const first=await f.create();assert.equal(first.status,201);
  const retry=await f.create();assert.equal(retry.status,200);assert.equal(retry.data.id,first.data.id);
  assert.equal([...f.objects.keys()].filter(k=>k.startsWith('bookings/')).length,1);
  assert.equal((await f.create(1,{phone:'+998901234568'})).status,409);
  assert.equal((await f.create(1,{},'other')).status,409);
});

test('Customers see and cancel only their own bookings; admin access cannot come from user metadata',async()=>{
  const f=await fixture();await f.create(1);await f.create(2,{},'other');
  const own=await f.request('/api/bookings');assert.equal(own.status,200);assert.equal(own.data.length,1);assert.equal(own.data[0].user_id,USER);
  const other=await f.request('/api/bookings',{token:'other'});assert.equal(other.data.length,1);assert.equal(other.data[0].user_id,OTHER);
  const cancel=await f.request('/api/bookings/'+key(1)+'/cancel',{method:'POST',token:'other'});assert.ok([403,404].includes(cancel.status));
  for(const token of ['user','forged']){
    assert.equal((await f.request('/api/admin/bookings',{token})).status,403);
    assert.equal((await f.request('/api/admin/bookings/'+key(1),{method:'PUT',token,body:{status:'confirmed'}})).status,403);
  }
  const all=await f.request('/api/admin/bookings',{token:'admin'});assert.equal(all.status,200);assert.equal(all.data.length,2);
});

test('Admin confirmation reserves each day, rejects overlaps, and rolls back partial locks',async()=>{
  const f=await fixture();
  await f.create(1,{start_date:day(3),end_date:day(5)});
  await f.create(2,{start_date:day(2),end_date:day(4)});
  await f.create(3,{start_date:day(5),end_date:day(7)});
  assert.equal((await f.action(key(1),'confirmed')).status,200);
  assert.equal(f.objects.get('bookings/'+key(1)+'.json').status,'confirmed');
  const conflict=await f.action(key(2),'confirmed');assert.equal(conflict.status,409,JSON.stringify(conflict.data));
  assert.equal(f.objects.get('bookings/'+key(2)+'.json').status,'pending');
  assert.ok(!f.objects.has('booking-locks/293/'+day(2)+'.json'));
  assert.equal(f.objects.get('booking-locks/293/'+day(3)+'.json').booking_id,key(1));
  assert.equal((await f.action(key(3),'confirmed')).status,200,'checkout date is exclusive');
  assert.equal(f.objects.get('booking-locks/293/'+day(5)+'.json').booking_id,key(3));
});

test('Cancelling a confirmed booking frees only its dates and terminal bookings cannot be confirmed again',async()=>{
  const f=await fixture();
  await f.create(1,{start_date:day(2),end_date:day(4)});await f.create(2,{start_date:day(4),end_date:day(6)});
  assert.equal((await f.action(key(1),'confirmed')).status,200);assert.equal((await f.action(key(2),'confirmed')).status,200);
  const cancel=await f.request('/api/bookings/'+key(1)+'/cancel',{method:'POST'});assert.equal(cancel.status,200);
  assert.equal(cancel.data.status,'cancelled');
  assert.ok(!f.objects.has('booking-locks/293/'+day(2)+'.json'));
  assert.ok(!f.objects.has('booking-locks/293/'+day(3)+'.json'));
  assert.equal(f.objects.get('booking-locks/293/'+day(4)+'.json').booking_id,key(2));
  assert.equal((await f.action(key(1),'confirmed')).status,409);
  await f.create(3,{start_date:day(7),end_date:day(8)});assert.equal((await f.action(key(3),'rejected',{admin_note:'Unavailable from partner'})).status,200);
  assert.equal((await f.action(key(3),'confirmed')).status,409);
});

test('A failed confirmation save does not leave dates reserved or a misleading confirmed status',async()=>{
  const f=await fixture();await f.create(1);
  f.faults.set('POST /storage/v1/object/rentcar-catalog/bookings/'+key(1)+'.json',{status:500});
  f.faults.set('PUT /storage/v1/object/rentcar-catalog/bookings/'+key(1)+'.json',{status:500});
  const result=await f.action(key(1),'confirmed');assert.equal(result.status,502);
  assert.equal(f.objects.get('bookings/'+key(1)+'.json').status,'pending');
  assert.equal([...f.objects.keys()].filter(k=>k.startsWith('booking-locks/')).length,0);
});

test('Same-booking confirm and cancel cannot run concurrently or leave confirmed dates unlocked',async()=>{
  const f=await fixture();await f.create(1);
  let markEntered,release;
  const entered=new Promise(resolve=>markEntered=resolve);
  const barrier=new Promise(resolve=>release=resolve);
  f.hooks.set('POST /storage/v1/object/rentcar-catalog/bookings/'+key(1)+'.json',async({body})=>{
    if(body.status==='confirmed'){markEntered();await barrier;}
  });
  const confirming=f.action(key(1),'confirmed');
  await entered;
  const cancel=await f.request('/api/bookings/'+key(1)+'/cancel',{method:'POST'});
  assert.equal(cancel.status,409);
  release();
  assert.equal((await confirming).status,200);
  assert.equal(f.objects.get('bookings/'+key(1)+'.json').status,'confirmed');
  for(let offset=2;offset<5;offset++)assert.equal(f.objects.get('booking-locks/293/'+day(offset)+'.json').booking_id,key(1));
  const retry=await f.request('/api/bookings/'+key(1)+'/cancel',{method:'POST'});assert.equal(retry.status,200);
  assert.equal([...f.objects.keys()].filter(k=>k.startsWith('booking-locks/')).length,0);
});

test('Concurrent confirmations for different bookings cannot reserve the same car dates twice',async()=>{
  const f=await fixture();await f.create(1);await f.create(2,{},'other');
  const results=await Promise.all([f.action(key(1),'confirmed'),f.action(key(2),'confirmed')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=results.find(r=>r.status===200).data.id;
  for(let offset=2;offset<5;offset++)assert.equal(f.objects.get('booking-locks/293/'+day(offset)+'.json').booking_id,winner);
  assert.equal([...f.objects.entries()].filter(([path,record])=>path.startsWith('bookings/')&&record.status==='confirmed').length,1);
});

test('A response failure after confirmation was committed keeps the confirmed record and its date locks',async()=>{
  const f=await fixture();await f.create(1);
  f.afterCommitFaults.set('POST /storage/v1/object/rentcar-catalog/bookings/'+key(1)+'.json',{status:500});
  const result=await f.action(key(1),'confirmed');assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.status,'confirmed');
  assert.equal(f.objects.get('bookings/'+key(1)+'.json').status,'confirmed');
  for(let offset=2;offset<5;offset++)assert.equal(f.objects.get('booking-locks/293/'+day(offset)+'.json').booking_id,key(1));
});
