-- Mes Investissements : comptes sur invitation, portefeuille par profil, documents privés.
-- À exécuter une fois dans Supabase → SQL Editor. Ré-exécutable sans risque (idempotent).
-- Chaque profil ne voit QUE ses propres données (Row Level Security).

-- ── Profils ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Portefeuille (positions, liste de suivi, stratégie…) : un document JSON par profil ──
create table if not exists public.portfolios (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Codes d'invitation (créés par un administrateur) ─────────────────────────
create table if not exists public.invites (
  code text primary key,
  note text not null default '',
  created_by uuid references auth.users on delete set null,
  used_by uuid references auth.users on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.invites enable row level security;

drop policy if exists "profil : lecture du sien ou admin" on public.profiles;
create policy "profil : lecture du sien ou admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "portefeuille : le sien uniquement" on public.portfolios;
create policy "portefeuille : le sien uniquement" on public.portfolios
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "invitations : admin" on public.invites;
create policy "invitations : admin" on public.invites
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Inscription : refusée sans code d'invitation valide (sauf le tout premier compte = administrateur) ──
create or replace function public.check_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
begin
  if not exists (select 1 from public.profiles) then
    return new;  -- premier compte : l'administrateur
  end if;
  if v_code = '' or not exists (select 1 from public.invites i where i.code = v_code and i.used_by is null) then
    raise exception 'INVITATION_INVALIDE';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  first_user boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, display_name, is_admin)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60), first_user);
  insert into public.portfolios (user_id) values (new.id) on conflict do nothing;
  if not first_user then
    update public.invites set used_by = new.id, used_at = now() where invites.code = v_code and used_by is null;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_check_invite on auth.users;
create trigger on_auth_user_check_invite before insert on auth.users
  for each row execute function public.check_invite();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Documents : stockage privé, un dossier par profil (documents/<id du profil>/…) ──
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "documents : lecture des siens" on storage.objects;
create policy "documents : lecture des siens" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents : ajout dans son dossier" on storage.objects;
create policy "documents : ajout dans son dossier" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents : suppression des siens" on storage.objects;
create policy "documents : suppression des siens" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
