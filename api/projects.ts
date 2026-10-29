import { getSupabase, requireUser, fail } from './_lib';
export default async function handler(req:any,res:any):Promise<void>{
 try{
  const user=await requireUser(req,res); if(!user)return;
  const db=getSupabase();
  if(req.method==='GET'){
   const {data,error}=await db.from('projects').select('id,name,created_at,updated_at').eq('user_id',user.id).order('name',{ascending:true});
   if(error)throw error; res.status(200).json({projects:data||[]}); return;
  }
  if(req.method==='POST'){
   const name=String(req.body?.name||'').trim().replace(/\s+/g,' ').slice(0,120);
   if(!name){res.status(422).json({error:'Nome do projeto obrigatório.'});return;}
   const normalized_name=name.normalize('NFKC').toLocaleLowerCase('pt-BR');
   const {data:existing,error:findError}=await db.from('projects').select('id,name,created_at,updated_at').eq('user_id',user.id).eq('normalized_name',normalized_name).maybeSingle();
   if(findError)throw findError;
   if(existing){res.status(200).json({project:existing});return;}
   const now=new Date().toISOString();
   const project={id:'prj_'+crypto.randomUUID(),consumer_project:user.id,name,normalized_name,user_id:user.id,created_at:now,updated_at:now};
   const {data,error}=await db.from('projects').insert(project).select('id,name,created_at,updated_at').single();
   if(error)throw error; res.status(201).json({project:data}); return;
  }
  res.setHeader('Allow','GET, POST');res.status(405).json({error:'Método não permitido.'});
 }catch(e){fail(res,e,'Projects API error');}
}