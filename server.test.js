const {test} = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {createApp,validate,fields} = require('./server');
const sample = require('./example-car.json');

test('Five required fields plus two generated fields',()=>{
  assert.equal(Object.keys(fields).length+2,7);
  assert.deepEqual(validate(sample),[]);
  for(const key of Object.keys(sample)) {
    const body={...sample}; delete body[key];
    assert.ok(validate(body).some(e=>e.startsWith(key+':')),key);
    assert.ok(validate({...sample,[key]:null}).length,key);
  }
  assert.deepEqual(validate({...sample,is_new:false,price:0}),[]);
  for(const body of [null,[],{...sample,year:'2023'},{...sample,price:-1},{...sample,brand:' '},{...sample,id:4},{...sample,color:'Oq'}]) assert.ok(validate(body).length);
});
test('HTTP CRUD, validation, not-found and database failure',async(t)=>{
  let rows=[], counter=0, fail=false;
  const fetchImpl=async(url,options)=>{
    if(url.pathname==='/auth/v1/user') return new Response(JSON.stringify({id:'admin-id',app_metadata:{role:'admin'}}));
    if(fail) return new Response(JSON.stringify({code:'TEST'}),{status:500});
    const id=url.searchParams.get('id')?.slice(3);
    let result;
    if(options.method==='POST') {result=[{id:++counter,created_at:new Date().toISOString(),...JSON.parse(options.body)}];rows.push(result[0]);}
    else if(options.method==='PATCH') {result=rows.filter(r=>String(r.id)===id).map(r=>Object.assign(r,JSON.parse(options.body)));}
    else {result=rows.filter(r=>!id||String(r.id)===id);if(options.method==='DELETE') rows=rows.filter(r=>String(r.id)!==id);}
    return new Response(JSON.stringify(result));
  };
  const server=createApp({fetchImpl,env:{SUPABASE_URL:'https://example.com',SUPABASE_SECRET_KEY:'test',SUPABASE_PUBLISHABLE_KEY:'test'}}).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer test-admin'},body:body?JSON.stringify(body):undefined});
  let r=await call('/cars','POST',sample);assert.equal(r.status,201);const car=await r.json();assert.equal(Object.keys(car).length,7);
  r=await call('/cars');assert.equal((await r.json())[0].brand,sample.brand);
  r=await call('/cars/1');assert.equal((await r.json()).year,sample.year);
  r=await call('/cars/1','PUT',{...sample,price:20000});assert.equal((await r.json()).price,20000);
  assert.equal((await call('/cars','POST',{brand:'BMW'})).status,400);
  assert.equal((await call('/cars/0')).status,400);
  assert.equal((await call('/cars?limit=-1')).status,400);
  assert.equal((await fetch(base+'/cars',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await call('/cars/1','DELETE')).status,200);
  for(const method of ['GET','DELETE']) assert.equal((await call('/cars/1',method)).status,404);
  assert.equal((await call('/cars/1','PUT',sample)).status,404);
  fail=true;assert.equal((await call('/cars')).status,502);
});
