-- Perfis administrativos da Arena Leste
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('master', 'caixa', 'midia')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_sessions
  add column if not exists user_id uuid references public.admin_users(id) on delete cascade;

create index if not exists admin_sessions_user_idx on public.admin_sessions(user_id, expires_at desc);
create index if not exists admin_users_role_idx on public.admin_users(role, active);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
