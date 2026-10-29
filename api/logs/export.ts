import { getSupabase, requireUser, fail } from '../_lib';
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;const db=getSupabase();
  const {data:jobs,error:jobsError}=await db.from('searches').select('id').eq('user_id',user.id);if(jobsError)throw jobsError;
  const ids=(jobs||[]).map((j:any)=>j.id);
  let q=db.from('audit_logs').select('id,created_at,level,category,event,message,job_id,metadata').order('created_at',{ascending:false}).limit(5000);
  if(ids.length)q=q.or('job_id.eq.,job_id.in.('+ids.join(',')+')');else q=q.eq('job_id','');
  const {data,error}=await q;if(error)throw error;
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="mapscrape-audit.jsonl"');
  res.status(200).send((data||[]).map((row:any)=>JSON.stringify(row)).join('\n'));
 }catch(e){fail(res,e,'Logs export API error');}
}