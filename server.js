const express = require('express');
if (!process.env.VERCEL && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const fields = {brand:'string',is_new:'boolean',price:'number',year:'integer',model:'string'};
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['JSON obyekt yuboring'];
  const errors = [];
  for (const [key,type] of Object.entries(fields)) {
    const v = body[key];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) { errors.push(`${key}: majburiy maydon`); continue; }
    if (type === 'integer' ? !Number.isSafeInteger(v) || v < 0 : typeof v !== type || (type === 'number' && (!Number.isFinite(v) || v < 0))) errors.push(`${key}: noto'g'ri tur yoki qiymat (${type})`);
  }
  if (typeof body.year === 'number' && (body.year < 1886 || body.year > new Date().getFullYear()+1)) errors.push('year: yil noto‘g‘ri');
  for (const key of Object.keys(body)) if (!Object.hasOwn(fields,key)) errors.push(`${key}: ruxsat etilmagan maydon`);
  return errors;
}
function createApp({fetchImpl = fetch, env = process.env} = {}) {
  const app = express();
  app.set('trust proxy', env.VERCEL ? 1 : false);
  const path = require('node:path');
  const publicDir = path.join(__dirname,'rentcar-site','worker');
  app.use(express.json({limit:'100kb'}));
  // These routes serve only the named site files, including checkouts in dot directories.
  const sendSiteFile=(res,name)=>res.sendFile(path.join(publicDir,name),{dotfiles:'allow'});
  app.get(['/', '/admin'], (req,res)=>sendSiteFile(res,'page.html'));
  app.get('/style.css',(req,res)=>sendSiteFile(res,'style.css'));
  app.get('/rental.css',(req,res)=>sendSiteFile(res,'rental.css'));
  app.get('/app.js',(req,res)=>sendSiteFile(res,'app.js'));
  app.get('/images/:name',(req,res)=>{
    const image=require('./rentcar-site/worker/car-images.json')['/images/'+req.params.name];
    if(!image)return res.status(404).end();
    res.setHeader('Cache-Control','public, max-age=86400');
    res.type(image.type).send(Buffer.from(image.base64,'base64'));
  });
  app.use(async(req,res,next)=>{
    try {
      const {handleApi} = await import('./rentcar-site/worker/api.mjs');
      const headers = new Headers();
      for(const [name,value] of Object.entries(req.headers)) if(value) headers.set(name,Array.isArray(value)?value.join(', '):value);
      const request = new Request(req.protocol+'://'+req.get('host')+req.originalUrl,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&req.body?{body:JSON.stringify(req.body)}:{})});
      const response=await handleApi(request,env,fetchImpl);
      res.status(response.status);
      for(const [key,value] of response.headers) if(key!=='set-cookie') res.setHeader(key,value);
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
      res.send(await response.text());
    }catch(e){next(e);}
  });
  app.use((e,req,res,next)=>res.status(e.type==='entity.parse.failed'?400:e.status||502).json({error:e.type==='entity.parse.failed'?'JSON formati noto?g?ri':'Server so?rovida xato'}));
  return app;
}
const app = createApp();
if(require.main===module && !process.env.VERCEL) app.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log(`Server: http://localhost:${process.env.PORT||3000}`));
module.exports = app;
module.exports.createApp = createApp;
module.exports.fields = fields;
module.exports.validate = validate;

