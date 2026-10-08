import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';

async function checkModel(apiKey:string,model:string):Promise<{model:string;ok:boolean;status:number;message:string}>{
  const res=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(model),{
    headers:{authorization:`Bearer ${apiKey}`}
  });
  const data:any=await res.json().catch(()=>({}));
  return {model,ok:res.ok,status:res.status,message:res.ok?'可使用':String(data?.error?.message||'無法使用此模型')};
}

export async function checkOpenAI(env:Env,user:AuthUser):Promise<any>{
  requireRole(user,'admin');
  if(!env.OPENAI_API_KEY) throw new HttpError(503,'OPENAI_API_KEY 尚未設定');
  const textModel=env.OPENAI_TEXT_MODEL||'gpt-6-luna';
  const imageModel=env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-flare';
  const editModel=env.OPENAI_IMAGE_EDIT_MODEL||'gpt-image-2.5-sunburst';
  const results=await Promise.all([
    checkModel(env.OPENAI_API_KEY,textModel),
    checkModel(env.OPENAI_API_KEY,imageModel),
    editModel===imageModel?Promise.resolve(null):checkModel(env.OPENAI_API_KEY,editModel)
  ]);
  const models=results.filter(Boolean);
  return {ok:models.every((x:any)=>x.ok),models};
}
