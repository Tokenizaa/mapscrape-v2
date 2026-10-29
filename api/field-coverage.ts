import { getSupabase, requireUser, fail } from './_lib';
const fields=['name','category','address','phone','website','rating','review_count','price_range','business_status','opening_hours','description','services_attributes','latitude','longitude','photos','videos','logo_url','social_links','reviews','review_topics','additional_attributes','media_items','plus_code','attributes','accessibility_attributes','next_opening_text','next_open_day','next_open_time','visible_photos_count','postal_code','country','city','state','source_place_id','source_url','popular_times','rating_distribution','review_highlights','field_status','collected_at'];
export default async function handler(req:any,res:any):Promise<void>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({error:'Método não permitido.'});return;}
 try{
  const user=await requireUser(req,res);if(!user)return;const db=getSupabase();
  const {data:jobs,error:jobsError}=await db.from('searches').select('id').eq('user_id',user.id);if(jobsError)throw jobsError;
  let q=db.from('places').select('*',{count:'exact'}).in('job_id',(jobs||[]).map((j:any)=>j.id));
  const jobId=String(req.query?.jobId||'');if(jobId)q=q.eq('job_id',jobId);
  const {data,count,error}=await q.limit(5000);if(error)throw error;
  const rows=data||[];const totalRecords=count||0;
  const result=fields.map(key=>{const populated=rows.filter((r:any)=>r[key]!==null&&r[key]!==undefined&&String(r[key]).trim()!==''&&String(r[key])!=='[]'&&String(r[key])!=='{}').length;return {key,label:key.replace(/_/g,' '),populated,missing:rows.length-populated,percentage:rows.length?Math.round(populated/rows.length*100):0};});
  res.status(200).json({totalRecords, totalFields:fields.length, averageCoverage:result.length?Math.round(result.reduce((s,f)=>s+f.percentage,0)/result.length):0,fields:result});
 }catch(e){fail(res,e,'Field coverage API error');}
}