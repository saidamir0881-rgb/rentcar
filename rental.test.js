const {test}=require('node:test');
const assert=require('node:assert/strict');
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'secret',SUPABASE_PUBLISHABLE_KEY:'public'};
test('CRC import has 49 exact photo mappings, positive UZS daily tariffs, and no invented years',()=>{
  const cars=require('./rentcar-site/worker/rental-catalog.json');
  const images=require('./rentcar-site/worker/car-images.json');
  assert.equal(cars.length,49);assert.equal(new Set(cars.map(c=>c.id)).size,49);
  for(const car of cars){assert.equal(car.currency,'UZS');assert.equal(car.price_unit,'day');assert.ok(car.price>0);assert.equal(car.year,null);assert.ok(car.source_url.startsWith('https://crc.uz/'));assert.ok(images[car.image_url].base64.length>500);}
  assert.equal(cars.find(c=>c.model==='COBALT').price,260000);
});
test('Private rental catalog CRUD checks admin access and persists through Supabase Storage',async()=>{
  const {handleApi}=await import('./rentcar-site/worker/api.mjs');
  let rows=[{id:293,brand:'LEXUS',model:'LX570 RS',price:2275000,year:null,is_new:null,class:'premium'}];
  let role='user',writes=0;
  const fake=async(url,opts)=>{
    if(url.pathname==='/auth/v1/user')return Response.json({id:'user-id',app_metadata:{role}});
    assert.equal(url.pathname,'/storage/v1/object/rentcar-catalog/catalog.json');
    if(opts.method==='POST'){writes++;rows=JSON.parse(opts.body);return Response.json({Key:'catalog.json'});}
    return Response.json(rows);
  };
  const call=(path,method='GET',body,auth=true)=>handleApi(new Request('https://site.test'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer token'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,fake);
  assert.equal((await call('/api/rentals','GET',undefined,false)).status,200);
  const body={brand:'Test',model:'Rental',price:300000,year:null,is_new:null,image_url:'https://example.com/car.png',class:'ekonom'};
  assert.equal((await call('/api/rentals','POST',body,false)).status,401);
  assert.equal((await call('/api/rentals','POST',body)).status,403);assert.equal(writes,0);
  role='admin';const added=await call('/api/rentals','POST',body);assert.equal(added.status,201);const car=await added.json();assert.equal(rows.length,2);assert.equal(car.year,null);
  const updated=await call('/api/rentals/'+car.id,'PUT',{...body,price:400000});assert.equal(updated.status,200);assert.equal((await updated.json()).price,400000);
  assert.equal((await call('/api/rentals','POST',{...body,price:-1})).status,400);
  assert.equal((await call('/api/rentals','POST',{...body,image_url:'javascript:alert(1)'})).status,400);
  assert.equal((await call('/api/rentals/'+car.id,'DELETE')).status,200);assert.equal(rows.length,1);
  assert.equal((await call('/api/rentals/'+car.id)).status,404);
});
