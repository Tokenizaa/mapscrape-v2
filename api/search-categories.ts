import { getSupabase, requireUser, fail } from './_lib';
export default async function handler(req:any,res:any):Promise<void>{
 try{
  const user=await requireUser(req,res);if(!user)return;const db=getSupabase();
  if(req.method==='GET'){
   const {data,error}=await db.from('search_categories').select('id,name,created_at').eq('user_id',user.id).order('name',{ascending:true});
   if(error)throw error;res.status(200).json({categories:data||[]});return;
  }
  if(req.method==='POST'){
   const name=String(req.body?.name||'').trim().replace(/\s+/g,' ').slice(0,120);
   if(!name){res.status(422).json({error:'Nome da categoria obrigatório.'});return;}
   const normalized_name=name.normalize('NFKC').toLocaleLowerCase('pt-BR');
   const {data:existing,error:findError}=await db.from('search_categories').select('id,name,created_at').eq('user_id',user.id).eq('normalized_name',normalized_name).maybeSingle();
   if(findError)throw findError;if(existing){res.status(200).json({category:existing});return;}
   const record={id:'cat_'+crypto.randomUUID(),consumer_project:user.id,name,normalized_name,user_id:user.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
   const {data,error}=await db.from('search_categories').insert(record).select('id,name,created_at').single();if(error)throw error;
   res.status(201).json({category:data});return;
  }
  res.setHeader('Allow','GET, POST');res.status(405).json({error:'Método não permitido.'});
 }catch(e){fail(res,e,'Search categories API error');}
}