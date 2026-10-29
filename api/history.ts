import { getSupabase, requireUser, fail } from './_lib';
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;
  const {data,error}=await getSupabase().from('searches').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(500);
  if(error)throw error;res.status(200).json(data||[]);
 }catch(e){fail(res,e,'History API error');}
}