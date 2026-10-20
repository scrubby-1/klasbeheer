-- Klasbeheer: tabel voor de optionele online synchronisatie.
-- Voer dit één keer uit in Supabase: Project > SQL Editor > New query > plakken > Run.

create table if not exists public.klasbeheer_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.klasbeheer_data enable row level security;

-- Elke gebruiker ziet en wijzigt enkel zijn eigen gegevens.
drop policy if exists "eigen gegevens lezen" on public.klasbeheer_data;
create policy "eigen gegevens lezen" on public.klasbeheer_data
  for select using (auth.uid() = user_id);

drop policy if exists "eigen gegevens toevoegen" on public.klasbeheer_data;
create policy "eigen gegevens toevoegen" on public.klasbeheer_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "eigen gegevens wijzigen" on public.klasbeheer_data;
create policy "eigen gegevens wijzigen" on public.klasbeheer_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigen gegevens verwijderen" on public.klasbeheer_data;
create policy "eigen gegevens verwijderen" on public.klasbeheer_data
  for delete using (auth.uid() = user_id);
