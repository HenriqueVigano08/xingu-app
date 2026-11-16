import {database,ApiError} from './storage';
export const permissions=['costs','products','prices','entries','sales','reports','export','reverse'] as const;
const reply=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const can=(m:any,p:string)=>m.role==='owner'||m.permissions?.[p]===true;
const requirePermissions=(m:any,ps:string[])=>{if(ps.some(p=>!can(m,p)))throw new ApiError('Você não tem permissão para esta operação.',403)};
const money=(x:any)=>Number.isSafeInteger(x)&&x>=0&&x<=100000000;
const quantity=(x:any)=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
const clean=(s:any,max:number)=>typeof s==='string'?s.trim().slice(0,max):'';
function normalize(data:any){
 const s=structuredClone(data);s.products??=[];s.moves??=[];s.audit??=[];
 // Só registros da versão 1 (sem responsável) são reclassificados como estoque inicial.
 // Uma compra nova com a observação "Estoque inicial" continua sendo compra.
 for(const m of s.moves){if(m.type==='in'&&m.note==='Estoque inicial'&&!m.actor)m.type='opening'}
 return s;
}
// Apenas a movimentação válida mais recente de cada produto ativo pode ser estornada.
function reversibleIds(s:any){
 const active=new Set(s.products.filter((p:any)=>!p.archived).map((p:any)=>p.id)),seen=new Set<string>(),ids=new Set<string>();
 for(let i=s.moves.length-1;i>=0;i--){const x=s.moves[i];if(x.type==='reversal'||x.reversedBy||seen.has(x.product))continue;seen.add(x.product);if(x.before&&active.has(x.product))ids.add(x.id)}
 return ids;
}
function publicData(ctx:any){
 const s=normalize(ctx.data),m=ctx.member,cost=can(m,'costs'),reversible=reversibleIds(s);
 // Lista explícita de campos: fotografias de saldo e metadados internos não saem do servidor.
 const products=s.products.map((p:any)=>({id:p.id,name:p.name,sku:p.sku,category:p.category,qty:p.qty,min:p.min,price:p.price,archived:!!p.archived,...(cost?{cost:p.cost}:{})}));
 const moves=s.moves.map((x:any)=>({id:x.id,product:x.product,name:x.name,type:x.type,qty:x.qty,date:x.date,note:x.note,actor:x.actor||'Registro anterior',price:x.price||0,reversedBy:x.reversedBy,reverseOf:x.reverseOf,originalType:x.originalType,...(cost?{cost:x.cost}:{}),reversible:reversible.has(x.id)}));
 return {products,moves,version:ctx.version,member:{email:m.email,role:m.role,permissions:Object.fromEntries(permissions.map(p=>[p,can(m,p)]))},audit:m.role==='owner'?s.audit:[]};
}
export default {async fetch(req:Request,bindings:any){
 const path=new URL(req.url).pathname;
 if(!path.startsWith('/api/'))return bindings.ASSETS.fetch(req);
 if(!['/api/inventory','/api/team'].includes(path))return reply({error:'Não encontrado.'},404);
 if(!bindings.SUPABASE_URL||!bindings.SUPABASE_ANON_KEY||!bindings.SUPABASE_SERVICE_ROLE_KEY)return reply({error:'Serviço ainda não configurado.'},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Método não permitido.'},405);
 try{
  if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('Origem inválida.',403);
  const token=req.headers.get('authorization');if(!token?.startsWith('Bearer '))throw new ApiError('Entre na sua conta.',401);
  const auth=await fetch(bindings.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:bindings.SUPABASE_ANON_KEY,Authorization:token}});
  if(!auth.ok)throw new ApiError('Entre novamente na sua conta.',401);
  const u:any=await auth.json();if(!u.id||!u.email||!u.email_confirmed_at)throw new ApiError('Confirme seu e-mail antes de entrar.',403);
  const db=database(bindings),ctx=await db.rpc('xingu_context',{p_user:u.id,p_email:u.email.toLowerCase()}),m=ctx.member;
  let b:any={};
  if(req.method==='POST'){const raw=await req.text();if(raw.length>20000)throw new ApiError('Solicitação muito grande.');try{b=JSON.parse(raw)}catch{throw new ApiError('Solicitação inválida.')}if(!b||typeof b!=='object'||Array.isArray(b))throw new ApiError('Solicitação inválida.')}
  if(path==='/api/team'){
   if(m.role!=='owner')throw new ApiError('Somente a administração pode gerenciar a equipe.',403);
   if(req.method==='POST'){
    b.email=clean(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)||typeof b.active!=='boolean')throw new ApiError('Confira o e-mail e a situação do acesso.');
    const ps=Object.fromEntries(permissions.map(p=>[p,b.permissions?.[p]===true]));
    if((ps.products||ps.entries||ps.reverse)&&!ps.costs)throw new ApiError('Cadastro, entradas e estornos exigem acesso a custos.');
    if(ps.export&&!ps.reports)throw new ApiError('A exportação exige acesso aos relatórios.');
    b={email:b.email,active:b.active,permissions:ps,version:b.version};
   }
   return reply(await db.rpc('xingu_team',{p_user:u.id,p_store:m.store_id,p_change:req.method==='POST'?b:null}));
  }
  if(req.method==='GET')return reply(publicData(ctx));
  if(b.version!==ctx.version)throw new ApiError('Outra pessoa atualizou os dados. Atualize e tente novamente.',409);
  const s=normalize(ctx.data),now=new Date().toISOString(),actor=m.email;
  let required:string[]=[],description='';
  const need=(ps:string[])=>{required=ps;requirePermissions(m,ps)};
  const find=()=>{const p=s.products.find((p:any)=>p.id===b.product&&!p.archived);if(!p)throw new ApiError('Produto não encontrado ou arquivado.');return p};
  const validateName=()=>{if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||typeof b.sku!=='string'||b.sku.length>40||!quantity(b.min))throw new ApiError('Confira nome, código e estoque mínimo.');if(b.sku.trim()&&s.products.some((p:any)=>(b.action!=='edit'||p.id!==b.product)&&p.sku.toLowerCase()===b.sku.trim().toLowerCase()))throw new ApiError('Já existe um produto com esse código.')};
  const appendMove=(p:any,type:string,qty:number,cost:number,price:number,note:string,before:any)=>s.moves.push({id:crypto.randomUUID(),product:p.id,name:p.name,type,qty,cost,price,date:now,note,actor,actorId:u.id,before,after:{qty:p.qty,cost:p.cost}});
  if(b.action==='product'){
   need(['products','costs','prices']);validateName();if(!money(b.cost)||!money(b.price)||!quantity(b.qty))throw new ApiError('Confira os valores e a quantidade.');
   const p={id:crypto.randomUUID(),name:b.name.trim(),sku:b.sku.trim(),category:clean(b.category,60)||'Geral',cost:b.cost,price:b.price,min:b.min,qty:b.qty};s.products.push(p);
   if(p.qty)appendMove(p,'opening',p.qty,p.cost,0,'Estoque inicial',{qty:0,cost:p.cost});description='Produto cadastrado: '+p.name;
  }else if(b.action==='move'){
   if(!['in','out'].includes(b.type))throw new ApiError('Tipo inválido.');need(b.type==='in'?['entries','costs']:['sales']);
   const p=find();if(!quantity(b.qty)||b.qty<1||!money(b.value))throw new ApiError('Confira quantidade e valor.');
   if(b.type==='out'&&!can(m,'prices')&&b.value!==p.price)throw new ApiError('Você deve usar o preço de venda cadastrado.',403);
   if(b.type==='out'&&b.qty>p.qty)throw new ApiError('Quantidade maior que o estoque disponível.');
   if(b.type==='in'&&p.qty+b.qty>1000000)throw new ApiError('Limite de estoque excedido.');
   const before={qty:p.qty,cost:p.cost},cost=b.type==='in'?b.value:p.cost;
   if(b.type==='in'){p.cost=Math.round((p.qty*p.cost+b.qty*b.value)/(p.qty+b.qty));p.qty+=b.qty}else p.qty-=b.qty;
   appendMove(p,b.type,b.qty,cost,b.type==='out'?b.value:0,clean(b.note,200),before);description=(b.type==='in'?'Entrada: ':'Venda: ')+p.name+' ('+b.qty+')';
  }else if(b.action==='edit'){
   const p=find();const metadata=b.name!==p.name||b.sku!==p.sku||b.category!==p.category||b.min!==p.min;
   need([...(metadata?['products']:[]),...(b.price!==p.price?['prices']:[])]);if(!required.length)need([can(m,'products')?'products':'prices']);
   validateName();if(!money(b.price))throw new ApiError('Preço inválido.');Object.assign(p,{name:b.name.trim(),sku:b.sku.trim(),category:clean(b.category,60)||'Geral',min:b.min,price:b.price});description='Produto atualizado: '+p.name;
  }else if(b.action==='archive'){
   need(['products']);const p=find();if(p.qty!==0)throw new ApiError('Só é possível arquivar produtos com estoque zerado.');p.archived=true;description='Produto arquivado: '+p.name;
  }else if(b.action==='reverse'){
   need(['reverse','costs']);const original=s.moves.find((x:any)=>x.id===b.move);
   if(!original||original.reversedBy||original.type==='reversal'||!original.before)throw new ApiError('Esta movimentação não pode ser estornada.');
   const p=s.products.find((p:any)=>p.id===original.product&&!p.archived);if(!p)throw new ApiError('Produto não disponível.');
   const latest=[...s.moves].reverse().find((x:any)=>x.product===p.id&&x.type!=='reversal'&&!x.reversedBy);
   if(latest?.id!==original.id||p.qty!==original.after.qty||p.cost!==original.after.cost)throw new ApiError('Estorne primeiro a movimentação mais recente deste produto.');
   const reason=clean(b.note,200);if(reason.length<5)throw new ApiError('Informe o motivo do estorno (mínimo 5 caracteres).');
   Object.assign(p,original.before);const id=crypto.randomUUID();original.reversedBy=id;
   s.moves.push({id,product:p.id,name:p.name,type:'reversal',originalType:original.type,reverseOf:original.id,qty:original.qty,cost:original.cost,price:original.price,date:now,note:reason,actor,actorId:u.id});description='Estorno: '+p.name+' — '+reason;
  }else throw new ApiError('Ação inválida.');
  s.audit.push({id:crypto.randomUUID(),date:now,actor,actorId:u.id,action:b.action,description});
  await db.rpc('xingu_commit',{p_user:u.id,p_store:m.store_id,p_version:ctx.version,p_permissions:required,p_data:s});
  // Revalida o acesso após gravar: uma conta bloqueada não recebe dados atualizados.
  const fresh=await db.rpc('xingu_context',{p_user:u.id,p_email:u.email.toLowerCase()});
  return reply(publicData(fresh));
 }catch(e){return reply({error:e instanceof ApiError?e.message:'Não foi possível concluir a operação. Tente novamente.'},e instanceof ApiError?e.status:503)}
}};
