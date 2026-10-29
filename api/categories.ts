import { getSupabase, requireUser, fail } from './_lib';
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;const db=getSupabase();
  const {data:jobs,error:jobsError}=await db.from('searches').select('id').eq('user_id',user.id);
  if(jobsError)throw jobsError;
  const ids=(jobs||[]).map((j:any)=>j.id);
  if(!ids.length){res.status(200).json({categories:[]});return;}
  const {data,error}=await db.from('places').select('category').in('job_id',ids).neq('category','');
  if(error)throw error;
  const categories=[...new Set((data||[]).map((p:any)=>String(p.category||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  res.status(200).json({categories});
 }catch(e){fail(res,e,'Categories API error');}
}