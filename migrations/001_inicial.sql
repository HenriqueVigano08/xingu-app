create table public.inventories (
  owner uuid primary key references auth.users(id) on delete cascade,
  data text not null default '{"products":[],"moves":[]}',
  version bigint not null default 0
);
alter table public.inventories enable row level security;
-- No browser access: all operations go through the authenticated server.
revoke all on table public.inventories from anon, authenticated;
grant select, insert, update on table public.inventories to service_role;
