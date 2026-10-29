import { getSupabase, requireUser, fail } from '../_lib';
export default async function handler(req:any,res:any):Promise<void>{
 try{
  const user=await requireUser(req,res);if(!user)return;
  const id=String(req.query?.id||req.params?.id||'');
  if(!id){res.status(400).json({error:'ID obrigatório.'});return;}
  const db=getSupabase();
  if(req.method==='PATCH'){
   const name=String(req.body?.name||'').trim().replace(/\s+/g,' ').slice(0,120);
   if(!name){res.status(422).json({error:'Nome obrigatório.'});return;}
   const normalized_name=name.normalize('NFKC').toLocaleLowerCase('pt-BR');
   const {data,error}=await db.from('projects').update({name,normalized_name,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id).select('id,name,created_at,updated_at').maybeSingle();
   if(error)throw error;if(!data){res.status(404).json({error:'Projeto não encontrado.'});return;}
   res.status(200).json({project:data});return;
  }
  if(req.method==='DELETE'){
   const {data:found,error:findError}=await db.from('projects').select('id').eq('id',id).eq('user_id',user.id).maybeSingle();
   if(findError)throw findError;if(!found){res.status(404).json({error:'Projeto não encontrado.'});return;}
   const {error}=await db.from('searches').update({project_id:null}).eq('project_id',id).eq('user_id',user.id);if(error)throw error;
   const {error:delError}=await db.from('projects').delete().eq('id',id).eq('user_id',user.id);if(delError)throw delError;
   res.status(200).json({success:true});return;
  }
  res.setHeader('Allow','PATCH, DELETE');res.status(405).json({error:'Método não permitido.'});
 }catch(e){fail(res,e,'Project detail API error');}
}