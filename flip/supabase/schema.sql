-- ============================================================
-- FLIP — Supabase schema
-- Run in the Supabase SQL editor (or via the CLI) once.
-- ============================================================

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Analyzed documents (analysis stored as JSONB — same shape as DocumentAnalysis)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  title text not null,
  overall_risk text not null check (overall_risk in ('safe', 'warn', 'danger')),
  summary text,
  headline text,
  transcript text,
  analysis jsonb not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.documents enable row level security;

drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "documents owner" on public.documents;
create policy "documents owner" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage bucket for uploaded files (private) ─────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects
  for all using (
    bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
  );
