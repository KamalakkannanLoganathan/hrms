create table if not exists public.hrms_app_state (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hrms_app_state_updated_at on public.hrms_app_state;
create trigger set_hrms_app_state_updated_at
before update on public.hrms_app_state
for each row
execute function public.set_updated_at();

alter table public.hrms_app_state enable row level security;

drop policy if exists "No direct client access to app state" on public.hrms_app_state;
create policy "No direct client access to app state"
on public.hrms_app_state
for all
using (false)
with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eagle-rcm-hr-private',
  'eagle-rcm-hr-private',
  false,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
