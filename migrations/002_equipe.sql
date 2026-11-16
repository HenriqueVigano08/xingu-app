-- Xingu 2: estoque compartilhado por equipe.
-- Executar no SQL Editor do Supabase depois de 001_inicial.sql.
-- ANTES DE EXECUTAR: troque 'admin@exemplo.com' (bloco abaixo) pelo e-mail da conta administradora,
-- que já precisa estar cadastrada e confirmada no Supabase Auth.
-- Transação: qualquer erro cancela todas as alterações desta migração. Pode ser repetida sem perder dados.
begin;
create table if not exists public.xingu_members (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.inventories(owner),
 email text not null unique check (email = lower(trim(email))),
 user_id uuid unique references auth.users(id),
 role text not null default 'member' check(role in ('owner','member')),
 permissions jsonb not null default '{}',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.xingu_members enable row level security;
revoke all on public.xingu_members from public, anon, authenticated;
grant select, insert, update on public.xingu_members to service_role;
grant usage on schema public to service_role;
-- Esta cópia protege o estado anterior à migração; não é sobrescrita ao repetir o script.
create table if not exists public.xingu_migration_backup (
 owner uuid primary key, data text not null, version bigint not null, saved_at timestamptz default now()
);
alter table public.xingu_migration_backup enable row level security;
revoke all on public.xingu_migration_backup from public, anon, authenticated;
do $$
declare admin_id uuid; admin_email text := lower(trim('admin@exemplo.com'));
begin
 select id into admin_id from auth.users where lower(email)=admin_email and email_confirmed_at is not null;
 if admin_id is null then raise exception 'A conta administradora % não existe ou não confirmou o e-mail. Nenhuma alteração aplicada.', admin_email; end if;
 insert into public.inventories(owner,data,version) values(admin_id,'{"products":[],"moves":[]}',0) on conflict(owner) do nothing;
 insert into public.xingu_migration_backup(owner,data,version) select owner,data,version from public.inventories where owner=admin_id on conflict do nothing;
 insert into public.xingu_members(store_id,email,user_id,role) values(admin_id,admin_email,admin_id,'owner') on conflict(email) do nothing;
 if not exists(select 1 from public.xingu_members where store_id=admin_id and user_id=admin_id and role='owner' and active) then raise exception 'Associação administrativa incompatível. Migração cancelada.'; end if;
end $$;

-- Apenas o Worker pode chamar estas funções, depois de validar o token de login.
create or replace function public.xingu_context(p_user uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.xingu_members; inv public.inventories;
begin
 -- Vincula a autorização por e-mail a uma identidade confirmada, uma única vez.
 update public.xingu_members set user_id=p_user where user_id is null and email=lower(p_email) and active
 and not exists(select 1 from public.xingu_members existing where existing.user_id=p_user);
 select * into m from public.xingu_members where user_id=p_user and active;
 if not found then return jsonb_build_object('error','Seu acesso ainda não foi autorizado ou foi desativado. Fale com a administração.','status',403); end if;
 select * into inv from public.inventories where owner=m.store_id;
 return jsonb_build_object('member',to_jsonb(m),'data',inv.data::jsonb,'version',inv.version);
end $$;

create or replace function public.xingu_commit(p_user uuid,p_store uuid,p_version bigint,p_permissions text[],p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.xingu_members; v bigint; permission text;
begin
 -- Mesmo bloqueio para estoque e equipe: revogação não pode disputar uma gravação.
 select version into v from public.inventories where owner=p_store for update;
 select * into m from public.xingu_members where user_id=p_user and store_id=p_store and active;
 if not found then return jsonb_build_object('error','Acesso desativado.','status',403); end if;
 if m.role <> 'owner' then
  foreach permission in array p_permissions loop
   if not coalesce((m.permissions->>permission)::boolean,false) then return jsonb_build_object('error','Você não tem permissão para esta operação.','status',403); end if;
  end loop;
 end if;
 if v is distinct from p_version then return jsonb_build_object('error','Outra pessoa atualizou os dados. Atualize e tente novamente.','status',409); end if;
 update public.inventories set data=p_data::text,version=version+1 where owner=p_store;
 return jsonb_build_object('ok',true,'version',v+1);
end $$;

create or replace function public.xingu_team(p_user uuid,p_store uuid,p_change jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.xingu_members; target public.xingu_members; inv public.inventories; entry jsonb; mail text;
begin
 select * into inv from public.inventories where owner=p_store for update;
 select * into m from public.xingu_members where user_id=p_user and store_id=p_store and active and role='owner';
 if not found then return jsonb_build_object('error','Somente a administração pode gerenciar a equipe.','status',403); end if;
 if p_change is not null then
  if (p_change->>'version')::bigint is distinct from inv.version then return jsonb_build_object('error','Dados atualizados por outra pessoa. Atualize e tente novamente.','status',409); end if;
  mail := lower(trim(p_change->>'email'));
  select * into target from public.xingu_members where email=mail;
  if found and (target.role='owner' or target.store_id<>p_store) then return jsonb_build_object('error','Esta conta não pode ser alterada por aqui.','status',400); end if;
  insert into public.xingu_members(store_id,email,permissions,active) values(p_store,mail,p_change->'permissions',(p_change->>'active')::boolean)
  on conflict(email) do update set permissions=excluded.permissions, active=excluded.active;
  entry := jsonb_build_object('id',gen_random_uuid(),'date',now(),'actor',m.email,'action','team','description','Permissões de '||mail||' atualizadas; acesso '||case when (p_change->>'active')::boolean then 'ativo' else 'bloqueado' end);
  update public.inventories set data=jsonb_set(inv.data::jsonb,'{audit}',coalesce(inv.data::jsonb->'audit','[]'::jsonb)||jsonb_build_array(entry))::text,version=version+1 where owner=p_store;
 end if;
 return jsonb_build_object('members',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) from public.xingu_members t where t.store_id=p_store));
end $$;
revoke all on function public.xingu_context(uuid,text) from public,anon,authenticated;
revoke all on function public.xingu_commit(uuid,uuid,bigint,text[],jsonb) from public,anon,authenticated;
revoke all on function public.xingu_team(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.xingu_context(uuid,text) to service_role;
grant execute on function public.xingu_commit(uuid,uuid,bigint,text[],jsonb) to service_role;
grant execute on function public.xingu_team(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
