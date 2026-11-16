export class ApiError extends Error {
 constructor(message:string, public status=400){super(message)}
}
export function database(env:any){
 return {async rpc(name:string,body:unknown){
  const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new ApiError('Não foi possível acessar o banco. Confira a migração de equipe e as configurações do servidor.',503);
  const d:any=await r.json();if(d.error)throw new ApiError(d.error,d.status||400);return d;
 }};
}
