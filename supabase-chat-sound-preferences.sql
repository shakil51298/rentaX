create table if not exists public.chat_sound_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  notification_sound_id text not null default 'phone_default',
  ringtone_sound_id text not null default 'phone_default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, conversation_id),
  check (notification_sound_id in ('phone_default', 'rentalx_pop', 'silent')),
  check (ringtone_sound_id in ('phone_default', 'rentalx_pop', 'silent'))
);

alter table public.chat_sound_preferences enable row level security;

drop policy if exists "Users can read own chat sound preferences" on public.chat_sound_preferences;
create policy "Users can read own chat sound preferences"
on public.chat_sound_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat sound preferences" on public.chat_sound_preferences;
create policy "Users can insert own chat sound preferences"
on public.chat_sound_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat sound preferences" on public.chat_sound_preferences;
create policy "Users can update own chat sound preferences"
on public.chat_sound_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own chat sound preferences" on public.chat_sound_preferences;
create policy "Users can delete own chat sound preferences"
on public.chat_sound_preferences
for delete
using (auth.uid() = user_id);
