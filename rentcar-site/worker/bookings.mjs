const bookingUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bookingToday=()=>new Date(Date.now()+5*3600000).toISOString().slice(0,10);
function bookingDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
}
function bookingAge(birth){
  const date=bookingDate(birth),now=bookingDate(bookingToday());
  if(!date||date>now)return -1;
  let years=now.getUTCFullYear()-date.getUTCFullYear();
  if(now.getUTCMonth()<date.getUTCMonth()||(now.getUTCMonth()===date.getUTCMonth()&&now.getUTCDate()<date.getUTCDate()))years--;
  return years;
}
function bookingDays(record){
  const dates=[];let at=Date.parse(record.start_date+'T00:00:00Z');const end=Date.parse(record.end_date+'T00:00:00Z');
  while(at<end){dates.push(new Date(at).toISOString().slice(0,10));at+=86400000;}
  return dates;
}

export async function handleBookingApi(request,context){
  const {env,fetchImpl,currentUser,profile,upstream,body,finish,fail}=context;
  const path=new URL(request.url).pathname,method=request.method;
  const objectRoot='/storage/v1/object/rentcar-catalog';
  async function storage(relative,method='GET',data,{optional=false,create=false}={}){
    const response=await fetchImpl(new URL(objectRoot+(relative?'/'+relative:''),env.SUPABASE_URL),{
      method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json','Cache-Control':'no-cache',...(method==='POST'?{'x-upsert':create?'false':'true'}:{})},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(15000),cache:'no-store',
    });
    let result;try{const text=await response.text();result=text?JSON.parse(text):null;}catch{fail('Bron ma’lumotlari javobida xato',502);}
    const code=String(result?.statusCode||result?.code||'');
    if(optional&&(response.status===404||code==='404'))return null;
    if(response.status===409||code==='409'||result?.error==='Duplicate')return {storageConflict:true};
    if(!response.ok)fail('Bron ma’lumotlarini saqlash yoki o‘qishda xato',502);
    return result;
  }
  const objectName=id=>'bookings/'+id.toLowerCase()+'.json';
  async function listBookings(){
    const names=[];
    for(let offset=0;offset<10000;offset+=100){
      const response=await fetchImpl(new URL('/storage/v1/object/list/rentcar-catalog',env.SUPABASE_URL),{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefix:'bookings',limit:100,offset,sortBy:{column:'name',order:'desc'}}),signal:AbortSignal.timeout(15000)});
      const rows=await response.json();if(!response.ok||!Array.isArray(rows))fail('Bronlar ro‘yxatini olishda xato',502);
      for(const row of rows)if(typeof row.name==='string'&&bookingUUID.test(row.name.replace(/\.json$/,''))&&row.name.endsWith('.json'))names.push(row.name);
      if(rows.length<100)break;
      if(offset===9900)fail('Bronlar ro‘yxati katta. Operator bilan bog‘laning',503);
    }
    const records=[];
    for(let index=0;index<names.length;index+=6){
      const batch=await Promise.all(names.slice(index,index+6).map(name=>storage('bookings/'+name,'GET',undefined,{optional:true})));
      for(const row of batch)if(row&&bookingUUID.test(row.id)&&typeof row.user_id==='string')records.push(row);
    }
    return records.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  }
  async function releaseLocks(record){
    const paths=[];
    for(const date of bookingDays(record)){
      const name='booking-locks/'+record.car_id+'/'+date+'.json';
      const lock=await storage(name,'GET',undefined,{optional:true});
      if(lock?.booking_id===record.id)paths.push(name);
    }
    if(paths.length)await storage('','DELETE',{prefixes:paths});
  }
  async function changeStatus(id,status,note,actor){
    const operation='booking-operations/'+id+'.json';
    const mutex=await storage(operation,'POST',{booking_id:id,actor_id:actor.id,created_at:new Date().toISOString()},{create:true});
    if(mutex?.storageConflict)fail('Bu bron hozir yangilanmoqda. Qayta urinib ko‘ring',409);
    try{
      const record=await storage(objectName(id),'GET',undefined,{optional:true});
      if(!record)fail('Bron topilmadi',404);
      if(actor.app_metadata?.role!=='admin'&&record.user_id!==actor.id)fail('Bron topilmadi',404);
      if(record.status===status){if(['cancelled','rejected'].includes(status))await releaseLocks(record);return record;}
      if(['cancelled','rejected'].includes(record.status))fail('Yakunlangan bron holatini o‘zgartirib bo‘lmaydi',409);
      if(status==='confirmed'&&record.status!=='pending')fail('Faqat kutilayotgan bron tasdiqlanadi',409);
      if(status==='rejected'&&record.status!=='pending')fail('Faqat kutilayotgan bron rad etiladi',409);
      if(status==='confirmed'&&record.start_date<bookingToday())fail('Boshlanish sanasi o‘tgan bronni tasdiqlab bo‘lmaydi',409);
      const result={...record,status,updated_at:new Date().toISOString(),...(actor.app_metadata?.role==='admin'?{admin_note:note||'',reviewed_by:actor.id}:{})};
      if(status==='confirmed'){
        try{
          for(const date of bookingDays(record)){
            const name='booking-locks/'+record.car_id+'/'+date+'.json';
            const lock=await storage(name,'POST',{booking_id:id,user_id:record.user_id,car_id:record.car_id,date},{create:true});
            if(lock?.storageConflict){const existing=await storage(name);if(existing?.booking_id!==id)fail('Bu avtomobil tanlangan sanalarda boshqa bron uchun tasdiqlangan',409);}
          }
        }catch(error){await releaseLocks(record);throw error;}
        try{await storage(objectName(id),'POST',result);}
        catch(error){
          // A lost HTTP response can follow a successful write. Never release dates
          // until a read proves that confirmation was not persisted.
          const persisted=await storage(objectName(id),'GET',undefined,{optional:true});
          if(persisted?.status==='confirmed')return persisted;
          if(persisted?.status==='pending')await releaseLocks(record);
          throw error;
        }
      }else{
        await storage(objectName(id),'POST',result);
        if(['cancelled','rejected'].includes(status))await releaseLocks(record);
      }
      return result;
    }finally{await storage('','DELETE',{prefixes:[operation]});}
  }
  if(path==='/api/bookings'&&method==='POST'){
    const user=await currentUser();const input=await body();
    if(!bookingUUID.test(input.idempotency_key||''))fail('Bron so‘rovi kaliti noto‘g‘ri');
    const id=input.idempotency_key.toLowerCase();
    if(!Number.isSafeInteger(input.car_id)||input.car_id<1)fail('Avtomobil ID noto‘g‘ri');
    const start=bookingDate(input.start_date),end=bookingDate(input.end_date);
    const days=start&&end?(end-start)/86400000:0;
    if(!start||!end||input.start_date<bookingToday()||!Number.isInteger(days)||days<1||days>365)fail('Ijara sanalari noto‘g‘ri. Muddat 1–365 kun, olish sanasi bugundan oldin bo‘lmasin');
    const phone=typeof input.phone==='string'?input.phone.trim():'';
    if(!/^[+\d\s()-]{7,40}$/.test(phone)||(phone.match(/\d/g)||[]).length<7||(phone.match(/\d/g)||[]).length>15)fail('Telefon raqamini to‘g‘ri kiriting');
    const pickup=typeof input.pickup_location==='string'?input.pickup_location.trim():'';
    if(pickup.length<3||pickup.length>200)fail('Avtomobilni olish joyi 3–200 belgidan iborat bo‘lsin');
    if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>1000))fail('Izoh 1000 belgidan oshmasin');
    const notes=(input.notes||'').trim();
    function sameSubmission(record){return record.user_id===user.id&&record.car_id===input.car_id&&record.start_date===input.start_date&&record.end_date===input.end_date&&record.phone===phone&&record.pickup_location===pickup&&record.notes===notes;}
    const previous=await storage(objectName(id),'GET',undefined,{optional:true});
    if(previous){if(!sameSubmission(previous))fail('Bu so‘rov kaliti avval ishlatilgan. Yangi so‘rov yuboring',409);return finish(previous);}
    const person=await profile(user.id);if(!person)fail('Bron qilish uchun ro‘yxatdan o‘tgan profilingizni to‘ldiring',400);
    const cars=await upstream('/storage/v1/object/rentcar-catalog/catalog.json');
    const car=Array.isArray(cars)?cars.find(c=>c.id===input.car_id):null;if(!car)fail('Avtomobil topilmadi',404);
    const requiredAge=Math.max(18,Number(car.minimum_age)||18);
    if(bookingAge(person.birth_date)<requiredAge)fail('Bu avtomobilni ijaraga olish uchun kamida '+requiredAge+' yoshda bo‘lishingiz kerak',400);
    if(typeof car.price!=='number'||!Number.isFinite(car.price)||car.price<=0||!Number.isSafeInteger(Math.round(car.price*days)))fail('Avtomobilning kunlik narxi noto‘g‘ri',502);
    const active=(await listBookings()).filter(b=>b.user_id===user.id&&b.status==='pending');
    if(active.length>=20)fail('Kutilayotgan bronlar soni 20 taga yetdi. Avval oldingi so‘rovlarni tekshiring',429);
    const now=new Date().toISOString();
    const booking={id,user_id:user.id,car_id:car.id,car_name:car.brand+' '+car.model,start_date:input.start_date,end_date:input.end_date,days,daily_price:car.price,estimated_total:car.price*days,currency:'UZS',status:'pending',customer_name:[person.first_name,person.last_name].filter(Boolean).join(' '),email:user.email||person.email,phone,pickup_location:pickup,notes,created_at:now,updated_at:now};
    const saved=await storage(objectName(id),'POST',booking,{create:true});
    if(saved?.storageConflict){const existing=await storage(objectName(id));if(!sameSubmission(existing))fail('Bu so‘rov kaliti avval ishlatilgan',409);return finish(existing);}
    return finish(booking,201);
  }
  if(path==='/api/bookings'&&method==='GET'){const user=await currentUser();return finish((await listBookings()).filter(b=>b.user_id===user.id));}
  if(path==='/api/admin/bookings'&&method==='GET'){await currentUser(true);return finish(await listBookings());}
  const cancel=path.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if(cancel&&method==='POST'){
    const user=await currentUser();if(!bookingUUID.test(cancel[1]))fail('Bron ID noto‘g‘ri');
    const id=cancel[1].toLowerCase();const booking=await storage(objectName(id),'GET',undefined,{optional:true});
    if(!booking||booking.user_id!==user.id)fail('Bron topilmadi',404);
    return finish(await changeStatus(id,'cancelled','',user));
  }
  const review=path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if(review&&method==='PUT'){
    const admin=await currentUser(true);if(!bookingUUID.test(review[1]))fail('Bron ID noto‘g‘ri');
    const input=await body();if(!['confirmed','rejected','cancelled'].includes(input.status))fail('Bron holati noto‘g‘ri');
    if(input.admin_note!==undefined&&(typeof input.admin_note!=='string'||input.admin_note.length>1000))fail('Admin izohi 1000 belgidan oshmasin');
    return finish(await changeStatus(review[1].toLowerCase(),input.status,(input.admin_note||'').trim(),admin));
  }
  return finish({error:'Endpoint topilmadi'},404);
}
