import { getSupabase, requireUser, fail } from './_lib';
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;const db=getSupabase();
  const limit=Math.min(200,Math.max(1,Number.parseInt(String(req.query?.limit||'100'),10)||100));
  const {data:jobs,error:jobsError}=await db.from('searches').select('id').eq('user_id',user.id);if(jobsError)throw jobsError;
  const ids=(jobs||[]).map((j:any)=>j.id);
  let q=db.from('audit_logs').select('id,created_at,level,category,event,message,job_id,metadata',{count:'exact'}).order('created_at',{ascending:false}).limit(limit);
  if(ids.length)q=q.or('job_id.eq.,job_id.in.('+ids.join(',')+')');else q=q.eq('job_id','');
  const level=String(req.query?.level||'');if(level)q=q.eq('level',level);
  const category=String(req.query?.category||'');if(category)q=q.eq('category',category);
  const jobId=String(req.query?.jobId||'');if(jobId&&ids.includes(jobId))q=q.eq('job_id',jobId);
  const query=String(req.query?.query||'').trim();if(query)q=q.or('message.ilike.%'+query+'%,event.ilike.%'+query+'%');
  const {data,count,error}=await q;if(error)throw error;
  res.status(200).json({logs:data||[],total:count||0});
 }catch(e){fail(res,e,'Logs API error');}
}