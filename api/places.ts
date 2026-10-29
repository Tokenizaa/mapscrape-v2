import { getSupabase, requireUser, fail } from './_lib';
const sortable=new Set(['collected_at','name','category','rating','review_count','created_at']);
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;
  const params=req.query||{};
  const offset=Math.max(0,Number.parseInt(String(params.offset||'0'),10)||0);
  const limit=Math.min(100,Math.max(1,Number.parseInt(String(params.limit||'25'),10)||25));
  const sortBy=String(params.sortBy||'collected_at');const ascending=String(params.sortOrder||'desc').toLowerCase()==='asc';
  const db=getSupabase();
  const {data:jobs,error:jobsError}=await db.from('searches').select('id').eq('user_id',user.id);
  if(jobsError)throw jobsError;const ids=(jobs||[]).map((j:any)=>j.id);
  if(!ids.length){res.status(200).json({places:[],total:0});return;}
  let q=db.from('places').select('*',{count:'exact'}).in('job_id',ids);
  if(params.jobId)q=q.eq('job_id',String(params.jobId));
  if(params.category)q=q.ilike('category','%'+String(params.category).trim().replace(/[%_]/g,'')+'%');
  if(params.query){const term=String(params.query).trim().replace(/[%_(),]/g,' ');if(term)q=q.or('name.ilike.%'+term+'%,category.ilike.%'+term+'%,address.ilike.%'+term+'%,phone.ilike.%'+term+'%,website.ilike.%'+term+'%');}
  q=q.order(sortable.has(sortBy)?sortBy:'collected_at',{ascending}).range(offset,offset+limit-1);
  const {data,count,error}=await q;if(error)throw error;
  res.status(200).json({places:data||[],total:count||0});
 }catch(e){fail(res,e,'Places API error');}
}