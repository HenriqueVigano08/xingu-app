import assert from 'node:assert/strict';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'xingu-test-'));
for(const [name,path] of [['storage','worker/storage.ts'],['index','worker/index.ts'],['metrics','src/metrics.ts']]){
 const source=(await readFile(path,'utf8')).replace("'./storage'","'./storage.mjs'");
 await writeFile(join(temp,name+'.mjs'),ts.transpile(source,{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}));
}
const {default:worker}=await import(pathToFileURL(join(temp,'index.mjs')).href);
const {totals}=await import(pathToFileURL(join(temp,'metrics.mjs')).href);
const db=new PGlite();
const users={admin:{id:'00000000-0000-4000-8000-000000000001',email:'admin@example.com'},bob:{id:'00000000-0000-4000-8000-000000000002',email:'bob@example.com'},outsider:{id:'00000000-0000-4000-8000-000000000003',email:'other@example.com'},unconfirmed:{id:'00000000-0000-4000-8000-000000000004',email:'pending@example.com'}};
const setup=`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);`;
await db.exec(setup);for(const [key,u] of Object.entries(users))await db.query('insert into auth.users values($1,$2,$3)',[u.id,u.email,key==='unconfirmed'?null:new Date().toISOString()]);
await db.exec(await readFile('migrations/001_inicial.sql','utf8'));
await db.query('insert into public.inventories(owner,data,version) values($1,$2,7)',[users.admin.id,JSON.stringify({products:[],moves:[]})]);
// O e-mail da administração é um marcador no arquivo público; o teste usa um endereço fictício.
const migration=(await readFile('migrations/002_equipe.sql','utf8')).replace("'admin@exemplo.com'","'"+users.admin.email+"'");
assert.ok(migration.includes(users.admin.email));await db.exec(migration);await db.exec(migration);
assert.equal((await db.query('select version from public.xingu_migration_backup')).rows[0].version,7);
assert.equal((await db.query('select count(*)::int as n from public.xingu_members')).rows[0].n,1);
for(const role of ['anon','authenticated']){
 assert.equal((await db.query("select has_function_privilege($1,'public.xingu_context(uuid,text)','EXECUTE') as yes",[role])).rows[0].yes,false);
 assert.equal((await db.query("select has_function_privilege($1,'public.xingu_commit(uuid,uuid,bigint,text[],jsonb)','EXECUTE') as yes",[role])).rows[0].yes,false);
 assert.equal((await db.query("select has_function_privilege($1,'public.xingu_team(uuid,uuid,jsonb)','EXECUTE') as yes",[role])).rows[0].yes,false);
 assert.equal((await db.query("select has_table_privilege($1,'public.xingu_members','SELECT') as yes",[role])).rows[0].yes,false);
}
const originalFetch=globalThis.fetch;let beforeCommit=null;
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url),h=new Headers(init.headers);
 if(u.pathname==='/auth/v1/user'){const key=h.get('authorization')?.slice(7),user=users[key];return user?Response.json({...user,email_confirmed_at:key==='unconfirmed'?null:new Date().toISOString()}):Response.json({error:'Invalid'},{status:401})}
 assert.equal(h.get('apikey'),'server-secret');assert.equal(h.get('authorization'),'Bearer server-secret');
 const body=JSON.parse(init.body),name=u.pathname.split('/').at(-1);
 assert.ok(['xingu_context','xingu_commit','xingu_team'].includes(name));
 if(name==='xingu_commit'&&beforeCommit){const hook=beforeCommit;beforeCommit=null;await hook()}
 const args=Object.values(body),params=args.map((_,i)=>'$'+(i+1)).join(',');
 try{return Response.json((await db.query(`select public.${name}(${params}) as result`,args)).rows[0].result)}catch(e){console.error('SQL test error',e.message);return Response.json({error:'DB error'},{status:500})}
};
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'server-secret',ASSETS:{fetch:()=>new Response('asset')}};
async function call(body,token='admin',path='/api/inventory',origin='https://xingu.test'){
 return worker.fetch(new Request('https://xingu.test'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,Origin:origin},body:body===undefined?undefined:JSON.stringify(body)}),env)
}
async function get(token='admin'){const r=await call(undefined,token);assert.equal(r.status,200);return r.json()}
async function mutate(b,token='admin',expected=200){const d=await get(token),r=await call({...b,version:d.version},token),result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result}
async function team(email,permissions={},active=true){const d=await get();const r=await call({email,permissions,active,version:d.version},'admin','/api/team');assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json()}
try{
 assert.equal((await call(undefined,'invalid')).status,401);
 assert.equal((await call(undefined,'unconfirmed')).status,403);
 assert.equal((await call(undefined,'outsider')).status,403);
 assert.equal((await call({version:7},'admin','/api/inventory','https://other.test')).status,403);
 let d=await mutate({action:'product',name:'Camiseta',sku:'CAM1',category:'Roupas',cost:1000,price:2500,qty:10,min:2});const id=d.products[0].id;
 assert.equal(d.moves[0].type,'opening');assert.equal(d.moves[0].actor,users.admin.email);
 assert.equal(totals(d.moves,new Date().toISOString().slice(0,7)).purchases,0);
 d=await mutate({action:'move',type:'in',product:id,qty:10,value:2000});assert.equal(d.products[0].cost,1500);assert.equal(d.products[0].qty,20);
 // Só a última movimentação válida do produto aparece como estornável.
 assert.deepEqual(d.moves.map(m=>m.reversible),[false,true]);
 d=await mutate({action:'move',type:'out',product:id,qty:3,value:2500});const sale=d.moves.at(-1);
 assert.deepEqual(d.moves.map(m=>m.reversible),[false,false,true]);assert.equal(d.products[0].qty,17);assert.equal(sale.cost,1500);
 assert.equal(totals(d.moves,new Date().toISOString().slice(0,7)).profit,3000);
 await mutate({action:'move',type:'out',product:id,qty:18,value:2500},'admin',400);
 await mutate({action:'move',type:'in',product:id,qty:-1,value:1000},'admin',400);
 await mutate({action:'product',product:id,name:'Duplicate',sku:'CAM1 ',cost:1,price:2,qty:1,min:0},'admin',400);
 await mutate({action:'reverse',move:d.moves[1].id,note:'Compra errada'},'admin',400);
 d=await mutate({action:'reverse',move:sale.id,note:'Venda registrada em duplicidade'});assert.equal(d.products[0].qty,20);assert.equal(d.products[0].cost,1500);assert.equal(totals(d.moves,new Date().toISOString().slice(0,7)).revenue,0);
 await mutate({action:'reverse',move:sale.id,note:'Tentativa repetida'},'admin',400);
 d=await mutate({action:'reverse',move:d.moves[1].id,note:'Compra cancelada'});assert.equal(d.products[0].qty,10);assert.equal(d.products[0].cost,1000);assert.equal(totals(d.moves,new Date().toISOString().slice(0,7)).purchases,0);
 await team(users.bob.email,{sales:true});d=await get('bob');assert.equal(d.products[0].id,id);assert.equal(d.member.role,'member');assert.equal(d.member.permissions.sales,true);
 assert.ok(d.products.every(p=>!('cost'in p)));assert.ok(d.moves.every(m=>!('cost'in m)&&!('before'in m)&&!('after'in m)));assert.deepEqual(d.audit,[]);
 assert.equal((await call(undefined,'bob','/api/team')).status,403);
 await mutate({action:'product',name:'Not allowed',sku:'A',cost:1,price:2,qty:0,min:0},'bob',403);
 await mutate({action:'move',type:'in',product:id,qty:1,value:1000},'bob',403);
 await mutate({action:'move',type:'out',product:id,qty:1,value:1},'bob',403);
 await mutate({action:'reverse',move:sale.id,note:'Sem permissão'},'bob',403);
 d=await mutate({action:'move',type:'out',product:id,qty:1,value:2500},'bob');assert.equal(d.products[0].qty,9);assert.equal(d.moves.at(-1).actor,users.bob.email);assert.ok(!('cost'in d.moves.at(-1)));
 d=await get();assert.equal(d.products[0].qty,9);assert.equal(d.audit.at(-1).actor,users.bob.email);
 // Permission revocation between read and write is enforced inside SQL transaction.
 beforeCommit=()=>team(users.bob.email,{},false);
 await mutate({action:'move',type:'out',product:id,qty:1,value:2500},'bob',403);assert.equal((await get()).products[0].qty,9);
 assert.equal((await call(undefined,'bob')).status,403);
 await team(users.bob.email,{sales:true,prices:true});
 d=await mutate({action:'move',type:'out',product:id,qty:1,value:2300},'bob');assert.equal(d.moves.at(-1).price,2300);
 // No metadata changes without product permission, even if price editing is allowed.
 await mutate({action:'edit',product:id,name:'Tampered',sku:'CAM1',category:'Roupas',min:2,price:2500},'bob',403);
 d=await mutate({action:'edit',product:id,name:'Camiseta',sku:'CAM1',category:'Roupas',min:2,price:2700},'bob');assert.equal(d.products[0].price,2700);
 // Two requests based on the same version cannot both consume stock.
 const body={action:'move',type:'out',product:id,qty:1,value:2700,version:d.version};const rs=await Promise.all([call(body),call(body)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
 const admin=await get();assert.equal(admin.products[0].qty,7);
 const ownerChange=await call({email:users.admin.email,active:false,permissions:{},version:admin.version},'admin','/api/team');assert.equal(ownerChange.status,400);
 const dependency=await call({email:'new@example.com',active:true,permissions:{entries:true},version:admin.version},'admin','/api/team');assert.equal(dependency.status,400);
 await mutate({action:'archive',product:id},'admin',400);
 d=await mutate({action:'product',name:'Empty',sku:'EMPTY',category:'Geral',cost:0,price:100,qty:0,min:0});const emptyId=d.products.at(-1).id;
 d=await mutate({action:'archive',product:emptyId});assert.equal(d.products.at(-1).archived,true);
 await mutate({action:'move',type:'in',product:emptyId,qty:1,value:1},'admin',400);
 // Compra nova com observação "Estoque inicial" continua compra e entra no relatório.
 d=await mutate({action:'product',name:'Caneca',sku:'CAN1',category:'Geral',cost:500,price:900,qty:0,min:0});const mugId=d.products.at(-1).id;
 d=await mutate({action:'move',type:'in',product:mugId,qty:2,value:500,note:'Estoque inicial'});assert.equal(d.moves.at(-1).type,'in');
 d=await get();assert.equal(d.moves.at(-1).type,'in');assert.equal(totals(d.moves.filter(m=>m.product===mugId),new Date().toISOString().slice(0,7)).purchases,1000);
 // Registros da versão 1 (sem responsável) continuam reclassificados como estoque inicial.
 const legacy=JSON.parse((await db.query('select data from public.inventories where owner=$1',[users.admin.id])).rows[0].data);
 legacy.moves.push({id:'legacy-1',product:mugId,name:'Caneca',type:'in',qty:1,cost:500,price:0,date:new Date().toISOString(),note:'Estoque inicial'});
 await db.query('update public.inventories set data=$2 where owner=$1',[users.admin.id,JSON.stringify(legacy)]);
 assert.equal((await get()).moves.find(m=>m.id==='legacy-1').type,'opening');
 // Separate store: an unrelated member cannot read or mutate this stock.
 await db.query('insert into public.inventories(owner,data,version) values($1,$2,0)',[users.outsider.id,'{"products":[],"moves":[]}']);
 await db.query("insert into public.xingu_members(store_id,email,user_id,role) values($1,$2,$1,'owner')",[users.outsider.id,users.outsider.email]);
 assert.deepEqual((await get('outsider')).products,[]);
 await mutate({action:'move',type:'out',product:id,qty:1,value:2700},'outsider',400);
 assert.equal((await worker.fetch(new Request('https://xingu.test/api/inventory'),{})).status,503);
 assert.equal((await call(undefined,'admin','/api/nope')).status,404);
 // Prior-month sale remains in its month, refund is negative in refund month.
 const ledger=[{type:'out',qty:2,cost:1000,price:2500,date:'2026-10-20T15:00:00Z'},{type:'reversal',originalType:'out',qty:2,cost:1000,price:2500,date:'2026-11-20T15:00:00Z'}];
 assert.equal(totals(ledger,'2026-10').revenue,5000);assert.equal(totals(ledger,'2026-11').revenue,-5000);assert.equal(totals(ledger,'2026-11').profit,-3000);
 console.log('PASS — real PostgreSQL migration and grants; admin protection; shared stock; unconfirmed/unauthorized/blocked accounts; server-side permissions; cost redaction; discounted sales; revocation during write; concurrent updates; weighted cost; opening balance; reversals; monthly reports; archives; cross-store isolation.');
}finally{globalThis.fetch=originalFetch;await db.close();await rm(temp,{recursive:true,force:true})}
