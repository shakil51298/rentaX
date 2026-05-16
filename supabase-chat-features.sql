create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one_id uuid not null references auth.users(id) on delete cascade,
  participant_two_id uuid not null references auth.users(id) on delete cascade,
  property_id text,
  created_by uuid references auth.users(id) on delete set null,
  last_message text,
  last_message_type text,
  last_message_at timestamptz,
  last_sender_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (participant_one_id <> participant_two_id)
);

create unique index if not exists chat_conversations_pair_property_idx
  on public.chat_conversations (
    participant_one_id,
    participant_two_id,
    coalesce(property_id, '')
  );

create index if not exists chat_conversations_participant_one_idx
  on public.chat_conversations(participant_one_id, last_message_at desc);

create index if not exists chat_conversations_participant_two_idx
  on public.chat_conversations(participant_two_id, last_message_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text,
  message_type text not null default 'text',
  media_url text,
  media_mime_type text,
  media_name text,
  audio_duration_ms integer,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  check (message_type in ('text', 'image', 'video', 'voice'))
);

create index if not exists chat_messages_conversation_created_at_idx
  on public.chat_messages(conversation_id, created_at);

create index if not exists chat_messages_receiver_seen_idx
  on public.chat_messages(receiver_id, seen_at);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  typing_conversation_id uuid references public.chat_conversations(id) on delete set null,
  typing_to_user_id uuid references auth.users(id) on delete set null,
  typing_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_presence enable row level security;

grant select, insert, update on public.chat_conversations to authenticated;
grant select, insert, update on public.chat_messages to authenticated;
grant select, insert, update on public.user_presence to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Conversation members can read'
  ) then
    create policy "Conversation members can read"
      on public.chat_conversations
      for select
      using (auth.uid() in (participant_one_id, participant_two_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Conversation members can create'
  ) then
    create policy "Conversation members can create"
      on public.chat_conversations
      for insert
      with check (
        auth.uid() in (participant_one_id, participant_two_id)
        and participant_one_id <> participant_two_id
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Conversation members can update'
  ) then
    create policy "Conversation members can update"
      on public.chat_conversations
      for update
      using (auth.uid() in (participant_one_id, participant_two_id))
      with check (auth.uid() in (participant_one_id, participant_two_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Message members can read'
  ) then
    create policy "Message members can read"
      on public.chat_messages
      for select
      using (auth.uid() in (sender_id, receiver_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Senders can create messages'
  ) then
    create policy "Senders can create messages"
      on public.chat_messages
      for insert
      with check (
        auth.uid() = sender_id
        and exists (
          select 1
          from public.chat_conversations conversations
          where conversations.id = conversation_id
            and sender_id in (
              conversations.participant_one_id,
              conversations.participant_two_id
            )
            and receiver_id in (
              conversations.participant_one_id,
              conversations.participant_two_id
            )
            and sender_id <> receiver_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Receivers can mark messages seen'
  ) then
    create policy "Receivers can mark messages seen"
      on public.chat_messages
      for update
      using (auth.uid() = receiver_id)
      with check (auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_presence'
      and policyname = 'Authenticated users can read presence'
  ) then
    create policy "Authenticated users can read presence"
      on public.user_presence
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_presence'
      and policyname = 'Users can create their presence'
  ) then
    create policy "Users can create their presence"
      on public.user_presence
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_presence'
      and policyname = 'Users can update their presence'
  ) then
    create policy "Users can update their presence"
      on public.user_presence
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-media',
  'chat-media',
  true,
  25000000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/mpeg',
    'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read chat media'
  ) then
    create policy "Anyone can read chat media"
      on storage.objects
      for select
      using (bucket_id = 'chat-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload chat media'
  ) then
    create policy "Authenticated users can upload chat media"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'chat-media'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_conversations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.user_presence;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
