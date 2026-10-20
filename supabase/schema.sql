-- Klasbeheer: database en beveiliging.
-- Voer dit uit in Supabase: SQL Editor > New query > plakken > Run.
-- Je mag het gerust opnieuw uitvoeren: bestaande gegevens blijven behouden.
--
-- Beveiliging:
--  1. Row Level Security: elke gebruiker kan enkel zijn eigen rij lezen of schrijven.
--  2. Toegangslijst: daarbovenop moet het e-mailadres van de aangemelde gebruiker in
--     klasbeheer_beheerders staan. Ook als er toch iemand een account zou kunnen maken,
--     krijgt die dus geen toegang.
--  3. De rol "anon" (niet aangemeld) heeft geen enkel recht op deze tabellen.

-- ---------- gegevens ----------
create table if not exists public.klasbeheer_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- ---------- toegangslijst ----------
create table if not exists public.klasbeheer_beheerders (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table public.klasbeheer_data       enable row level security;
alter table public.klasbeheer_beheerders enable row level security;
alter table public.klasbeheer_data       force row level security;
alter table public.klasbeheer_beheerders force row level security;

-- Controle of de aangemelde gebruiker op de toegangslijst staat.
-- security definer: de functie mag de toegangslijst lezen, de gebruiker zelf niet.
create or replace function public.klasbeheer_heeft_toegang()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.klasbeheer_beheerders b
    where lower(b.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.klasbeheer_heeft_toegang() from public, anon;
grant execute on function public.klasbeheer_heeft_toegang() to authenticated;

-- Rechten: niets voor anon, enkel het nodige voor aangemelde gebruikers.
revoke all on public.klasbeheer_data       from public, anon, authenticated;
revoke all on public.klasbeheer_beheerders from public, anon, authenticated;
grant select, insert, update, delete on public.klasbeheer_data to authenticated;
-- klasbeheer_beheerders krijgt geen rechten: enkel aan te passen in het Supabase-dashboard.

-- Oude regels (van een vorige versie) opruimen.
drop policy if exists "eigen gegevens lezen"       on public.klasbeheer_data;
drop policy if exists "eigen gegevens toevoegen"   on public.klasbeheer_data;
drop policy if exists "eigen gegevens wijzigen"    on public.klasbeheer_data;
drop policy if exists "eigen gegevens verwijderen" on public.klasbeheer_data;

create policy "eigen gegevens lezen" on public.klasbeheer_data
  for select to authenticated
  using (auth.uid() = user_id and public.klasbeheer_heeft_toegang());

create policy "eigen gegevens toevoegen" on public.klasbeheer_data
  for insert to authenticated
  with check (auth.uid() = user_id and public.klasbeheer_heeft_toegang());

create policy "eigen gegevens wijzigen" on public.klasbeheer_data
  for update to authenticated
  using (auth.uid() = user_id and public.klasbeheer_heeft_toegang())
  with check (auth.uid() = user_id and public.klasbeheer_heeft_toegang());

create policy "eigen gegevens verwijderen" on public.klasbeheer_data
  for delete to authenticated
  using (auth.uid() = user_id and public.klasbeheer_heeft_toegang());

-- ---------- jouw e-mailadres toevoegen ----------
-- Voer daarna APART deze regel uit, met het e-mailadres van je account:
--
--   insert into public.klasbeheer_beheerders (email) values ('jouw.adres@voorbeeld.be');
--
-- Controleren wie toegang heeft:   select * from public.klasbeheer_beheerders;
-- Iemand de toegang ontnemen:      delete from public.klasbeheer_beheerders where email = '...';
