import {handleBookingApi} from './bookings.mjs';
import {publicRentalCatalog} from './public-catalog.mjs';
export const carFields = {brand:'string',is_new:'boolean',price:'number',year:'integer',model:'string'};
export function isAdult(value, today = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value) return false;
  const now = new Date(today.getTime()+5*3600000);
  const cutoff = new Date(Date.UTC(now.getUTCFullYear()-18,now.getUTCMonth(),now.getUTCDate()));
  return date<=cutoff && date.getUTCFullYear()>=1900;
}
export function validateCar(body) {
  if(!body || typeof body!=='object' || Array.isArray(body)) return ['JSON obyekt yuboring'];
  const errors=[];
  for(const [k,t] of Object.entries(carFields)) {
    const v=body[k];
    if(v===undefined || v===null || (typeof v==='string'&&!v.trim())) errors.push(k+': majburiy maydon');
    else if(t==='integer' ? !Number.isSafeInteger(v) : typeof v!==t) errors.push(k+': noto‘g‘ri tur');
  }
  if(typeof body.price==='number'&&(!Number.isFinite(body.price)||body.price<0)) errors.push('price: 0 yoki musbat son');
  if(typeof body.year==='number'&&(body.year<1886||body.year>new Date().getFullYear()+1)) errors.push('year: yil noto‘g‘ri');
  if(Object.keys(body).some(k=>!Object.hasOwn(carFields,k))) errors.push('Ortiqcha maydon yuborilgan');
  return errors;
}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function handleApi(request,env,fetchImpl=fetch) {
  const url=new URL(request.url), path=url.pathname, method=request.method;
  const secret=env.SUPABASE_SECRET_KEY, key=env.SUPABASE_PUBLISHABLE_KEY;
  try {
    if(path==='/api/contact'&&method==='GET') return json({email:env.CONTACT_EMAIL||null});
    // The public CRC snapshot remains browseable before deployment secrets are set.
    // Only missing configuration enables preview; a valid empty live catalog is respected.
    if((!env.SUPABASE_URL||!secret||!key)&&method==='GET'&&/^\/api\/rentals(?:\/[1-9]\d*)?$/.test(path)){
      const id=path.split('/')[3];
      const car=id?publicRentalCatalog.find(c=>String(c.id)===id):null;
      return json(id?(car||{error:'Avtomobil topilmadi'}):publicRentalCatalog,id&&!car?404:200,{'X-Catalog-Mode':'preview'});
    }
    if(!env.SUPABASE_URL||!secret||!key) fail('Serverning Supabase sozlamalari to‘liq emas',503);
    if(['POST','PUT','DELETE'].includes(method)&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin) fail('Boshqa saytdan so‘rov rad etildi',403);
    async function upstream(path,{method='GET',body,token,admin=true,prefer='return=representation'}={}) {
      const response=await fetchImpl(new URL(path,env.SUPABASE_URL),{method,headers:{apikey:admin?secret:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',Prefer:prefer},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
      const text=await response.text(); let data;try{data=text?JSON.parse(text):null;}catch{fail('Supabase javobida xato',502);}
      if(!response.ok) {
        const code=data?.error_code||data?.code;
        if(code==='PGRST205'||code==='42P01') fail('Database sozlanmagan: website-schema.sql ni Supabase SQL Editor’da bajaring',503);
        if(response.status===401||response.status===403) fail('Email yoki parol noto‘g‘ri, yoxud email tasdiqlanmagan',401);
        if(code==='email_not_confirmed') fail('Avval emailingizni tasdiqlang',401);
        if(code==='23505') fail('Bu ma’lumot avval ro‘yxatdan o‘tgan',409);
        if(code==='email_exists'||code==='user_already_exists') fail('Bu email avval ro‘yxatdan o‘tgan. Kirish tugmasidan foydalaning',409);
        if(response.status===429) fail('Urinishlar ko‘payib ketdi. Keyinroq qayta urinib ko‘ring',429);
        fail(admin?'Database so‘rovida xato':(data?.msg||data?.message||data?.error_description||'Kirish yoki ro‘yxatdan o‘tishda xato'),admin?502:400);
      }
      return data;
    }
    const cookies=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(s=>s.trim().split('=')));
    let access=request.headers.get('authorization')?.replace(/^Bearer /i,'')||cookies.rc_access;
    let refresh=cookies.rc_refresh, renewed=false;
    const secure=url.protocol==='https:'?'; Secure':'';
    function cookieHeaders(result,clear=false) {
      const headers=new Headers();
      for(const [name,value,age] of [['rc_access',result?.access_token,3600],['rc_refresh',result?.refresh_token,604800]]) headers.append('Set-Cookie',`${name}=${clear?'':value||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:age}${secure}`);
      return headers;
    }
    let user;
    async function currentUser(admin=false) {
      if(!user) {
        if(!access&&!refresh) fail('Avval tizimga kiring',401);
        try { if(!access) throw Error(); user=await upstream('/auth/v1/user',{token:access,admin:false}); }
        catch(e) {
          if(!refresh) fail('Sessiya tugagan. Qayta kiring',401);
          const result=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh},admin:false});
          access=result.access_token;refresh=result.refresh_token;user=result.user;renewed=true;
        }
      }
      if(admin&&user.app_metadata?.role!=='admin') fail('Bu amal faqat admin uchun',403);
      return user;
    }
    async function body() { try {const b=await request.json();if(!b||typeof b!=='object'||Array.isArray(b)) throw Error();return b;}catch{fail('JSON obyekt yuboring');} }
    function finish(data,status=200) {
      const response=json(data,status);
      if(renewed) for(const cookie of cookieHeaders({access_token:access,refresh_token:refresh}).getSetCookie()) response.headers.append('Set-Cookie',cookie);
      return response;
    }
    async function profile(id) { return (await upstream('/rest/v1/userlar?id=eq.'+encodeURIComponent(id)+'&select=id,first_name,last_name,email,birth_date,passport_number,created_at'))[0]; }
    if(path.startsWith('/api/bookings')||path.startsWith('/api/admin/bookings')) return await handleBookingApi(request,{env,fetchImpl,currentUser,profile,upstream,body,finish,fail});
    if(path==='/api/auth/register'&&method==='POST') {
      const b=await body();
      for(const k of ['first_name','last_name','email','password','birth_date','passport_number']) if(typeof b[k]!=='string'||!b[k].trim()) fail(k+': majburiy maydon');
      if(b.first_name.trim().length>80||b.last_name.trim().length>80) fail('Ism va familiya 80 belgidan oshmasin');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)||b.email.length>254) fail('Email noto‘g‘ri');
      if(b.password.length<8||b.password.length>128) fail('Parol 8–128 belgidan iborat bo‘lsin');
      const passport=b.passport_number.trim().toUpperCase().replace(/\s/g,'');
      if(!/^[A-Z]{2}\d{7}$/.test(passport)) fail('Pasport: 2 ta harf va 7 ta raqam kiriting');
      if(!isAdult(b.birth_date)) fail('Ro‘yxatdan o‘tish uchun 18 yoshga to‘lgan bo‘lishingiz kerak');
      await upstream('/rest/v1/userlar?select=id&limit=0');
      const email=b.email.trim().toLowerCase();
      // This website intentionally does not require an email confirmation step.
      // The privileged key stays on the server, and the role is never client-controlled.
      const result=await upstream('/auth/v1/admin/users',{method:'POST',body:{email,password:b.password,email_confirm:true,app_metadata:{role:'user'}}});
      const created=result.user||result;
      if(!created.id) fail('Hisob yaratish javobida xato',502);
      try { await upstream('/rest/v1/userlar',{method:'POST',body:{id:created.id,first_name:b.first_name.trim(),last_name:b.last_name.trim(),email,birth_date:b.birth_date,passport_number:passport}}); }
      catch(e) {
        // Roll back only the freshly created account; never leave a partial registration.
        try {await upstream('/auth/v1/admin/users/'+encodeURIComponent(created.id),{method:'DELETE'});}catch{}
        throw e;
      }
      let session;
      try{session=await upstream('/auth/v1/token?grant_type=password',{method:'POST',admin:false,body:{email,password:b.password}});}
      catch{
        // The account and profile already exist. A temporary sign-in error must
        // not delete a successful registration or ask the user to verify email.
        return json({message:'Hisobingiz yaratildi. Email va parolingiz bilan Kirish tugmasidan foydalaning.',signedIn:false},201);
      }
      const response=json({message:'Ro‘yxatdan o‘tdingiz',signedIn:true},201);
      for(const c of cookieHeaders(session).getSetCookie()) response.headers.append('Set-Cookie',c);
      return response;
    }
    if(path==='/api/auth/login'&&method==='POST') {
      const b=await body();if(typeof b.email!=='string'||typeof b.password!=='string') fail('Email va parol yuboring');
      const result=await upstream('/auth/v1/token?grant_type=password',{method:'POST',admin:false,body:{email:b.email.trim(),password:b.password}});
      const response=json({message:'Tizimga kirdingiz'});
      for(const c of cookieHeaders(result).getSetCookie()) response.headers.append('Set-Cookie',c);
      return response;
    }
    if(path==='/api/auth/logout'&&method==='POST') {
      if(access) try{await upstream('/auth/v1/logout',{method:'POST',token:access,admin:false});}catch{}
      const response=json({message:'Tizimdan chiqdingiz'});for(const c of cookieHeaders(null,true).getSetCookie()) response.headers.append('Set-Cookie',c);return response;
    }
    if(path==='/api/me'&&method==='GET') {const u=await currentUser();const p=await profile(u.id);return finish({user:{id:u.id,email:u.email,role:u.app_metadata?.role==='admin'?'admin':'user'},profile:p||null});}
    if(path==='/api/admin/users'&&method==='GET') {await currentUser(true);return finish(await upstream('/rest/v1/userlar?select=id,first_name,last_name,email,birth_date,created_at&order=created_at.desc&limit=500'));}
    const carsPath=path.replace(/^\/api/,'');
    if(/^\/api\/rentals(?:\/[1-9]\d*)?$/.test(path)) {
      const id=path.split('/')[3];
      if(!['GET','POST','PUT','DELETE'].includes(method)||(!id&&['PUT','DELETE'].includes(method))||(id&&method==='POST')) fail('Method mavjud emas',405);
      if(method!=='GET') await currentUser(true);
      const storagePath='/storage/v1/object/rentcar-catalog/catalog.json';
      const rows=await upstream(storagePath);
      if(!Array.isArray(rows)) fail('Ijara katalogi javobida xato',502);
      if(method==='GET') {
        if(id){const car=rows.find(c=>String(c.id)===id);if(!car)fail('Avtomobil topilmadi',404);const response=finish(car);response.headers.set('X-Catalog-Mode','live');return response;}
        const response=finish(rows);response.headers.set('X-Catalog-Mode','live');return response;
      }
      const index=id?rows.findIndex(c=>String(c.id)===id):-1;
      if(id&&index<0)fail('Avtomobil topilmadi',404);
      let result;
      if(method==='DELETE') result=rows.splice(index,1)[0];
      else {
        const b=await body();
        for(const k of ['brand','model'])if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>100)fail(k+': matn kiriting');
        if(typeof b.price!=='number'||!Number.isFinite(b.price)||b.price<=0||b.price>1000000000)fail('Kunlik narx musbat son bo‘lishi kerak');
        if(b.year!=null&&(!Number.isInteger(b.year)||b.year<1886||b.year>new Date().getFullYear()+1))fail('Yil noto‘g‘ri');
        if(b.is_new!=null&&typeof b.is_new!=='boolean')fail('Holat noto‘g‘ri');
        const image=typeof b.image_url==='string'?b.image_url.trim():'';
        if(image&&!/^\/images\/crc-\d+\.png$/.test(image)){try{if(new URL(image).protocol!=='https:')throw Error();}catch{fail('Rasm uchun HTTPS manzil kiriting');}}
        const category=['ekonom','standart','comfort','biznes','premium'].includes(b.class)?b.class:'standart';
        const old=index>=0?rows[index]:{};
        result={...old,id:index>=0?old.id:Math.max(100000,...rows.map(c=>Number(c.id)||0))+1,brand:b.brand.trim(),model:b.model.trim(),price:b.price,tariff_source:old.price===b.price?(old.tariff_source||'crc'):'admin',currency:'UZS',price_unit:'day',price_from:true,year:b.year??null,is_new:b.is_new??null,image_url:image,class:category,updated_at:new Date().toISOString()};
        if(index>=0)rows[index]=result;else rows.push(result);
      }
      // Private Supabase Storage persists the rental catalog independently of the legacy API table.
      const upload=await fetchImpl(new URL(storagePath,env.SUPABASE_URL),{method:'POST',headers:{apikey:secret,'Content-Type':'application/json','x-upsert':'true'},body:JSON.stringify(rows),signal:AbortSignal.timeout(15000)});
      if(!upload.ok)fail('Ijara katalogini saqlashda xato',502);
      return finish(method==='DELETE'?{message:'Avtomobil o‘chirildi',data:result}:result,method==='POST'?201:200);
    }
    if(carsPath.startsWith('/cars/')&&!/^\/cars\/[1-9]\d*$/.test(carsPath)) fail('ID musbat butun son bo‘lishi kerak');
    if(/^\/cars(?:\/[1-9]\d*)?$/.test(carsPath)) {
      const id=carsPath.split('/')[2];
      if(!['GET','POST','PUT','DELETE'].includes(method)||(!id&&['PUT','DELETE'].includes(method))||(id&&method==='POST')) fail('Method mavjud emas',405);
      if(method!=='GET') await currentUser(true);
      let payload;
      if(['POST','PUT'].includes(method)) {payload=await body();const errors=validateCar(payload);if(errors.length) return json({error:'Ma’lumotlar noto‘g‘ri',details:errors},400);payload=Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,typeof v==='string'?v.trim():v]));}
      const query=new URLSearchParams({select:'id,created_at,brand,is_new,price,year,model'});
      if(id) query.set('id','eq.'+id);
      else {const limit=Number(url.searchParams.get('limit')??100),offset=Number(url.searchParams.get('offset')??0);if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isSafeInteger(offset)||offset<0) fail('limit yoki offset noto‘g‘ri');query.set('order','id.asc');query.set('limit',String(limit));query.set('offset',String(offset));}
      const rows=await upstream('/rest/v1/'+encodeURIComponent(env.CARS_TABLE||'cars')+'?'+query,{method:method==='PUT'?'PATCH':method,body:payload});
      if(id&&!rows.length) fail('Avtomobil topilmadi',404);
      return finish(method==='DELETE'?{message:'Avtomobil o‘chirildi',data:rows[0]}:id||method==='POST'?rows[0]:rows,method==='POST'?201:200);
    }
    return json({error:'Endpoint topilmadi'},404);
  } catch(e) {return json({error:e.status?e.message:'Server bilan ulanishda xato'},e.status||502);}
}
