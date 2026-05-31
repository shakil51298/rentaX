create schema if not exists private;
grant usage on schema private to authenticated;

alter table public.chat_conversations
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists group_title text,
  add column if not exists group_avatar_url text,
  add column if not exists group_created_by uuid references auth.users(id) on delete set null,
  add column if not exists group_privacy text not null default 'private',
  add column if not exists group_invite_policy text not null default 'members',
  add column if not exists group_message_policy text not null default 'members',
  add column if not exists group_approval_required boolean not null default false,
  add column if not exists smart_summary_enabled boolean not null default true,
  add column if not exists smart_safety_enabled boolean not null default true,
  add column if not exists smart_rental_assistant_enabled boolean not null default true;

do $$
begin
  alter table public.chat_conversations
    drop constraint if exists chat_conversations_conversation_type_check;
  alter table public.chat_conversations
    add constraint chat_conversations_conversation_type_check
    check (conversation_type in ('direct', 'group'));

  alter table public.chat_conversations
    drop constraint if exists chat_conversations_group_privacy_check;
  alter table public.chat_conversations
    add constraint chat_conversations_group_privacy_check
    check (group_privacy in ('private', 'discoverable'));

  alter table public.chat_conversations
    drop constraint if exists chat_conversations_group_invite_policy_check;
  alter table public.chat_conversations
    add constraint chat_conversations_group_invite_policy_check
    check (group_invite_policy in ('members', 'admins'));

  alter table public.chat_conversations
    drop constraint if exists chat_conversations_group_message_policy_check;
  alter table public.chat_conversations
    add constraint chat_conversations_group_message_policy_check
    check (group_message_policy in ('members', 'admins'));
end $$;

create table if not exists public.chat_group_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  nickname text,
  joined_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id),
  check (role in ('admin', 'member')),
  check (status in ('active', 'left', 'removed'))
);

create index if not exists chat_group_members_conversation_idx
  on public.chat_group_members(conversation_id, status);

create index if not exists chat_group_members_user_idx
  on public.chat_group_members(user_id, status);

create or replace function private.is_chat_group_member(
  target_conversation_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_members members
    where members.conversation_id = target_conversation_id
      and members.user_id = target_user_id
      and members.status = 'active'
  );
$$;

create or replace function private.is_chat_group_admin(
  target_conversation_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_members members
    where members.conversation_id = target_conversation_id
      and members.user_id = target_user_id
      and members.role = 'admin'
      and members.status = 'active'
  );
$$;

create or replace function private.can_invite_chat_group_member(
  target_conversation_id uuid,
  inviter_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_conversations conversations
    where conversations.id = target_conversation_id
      and conversations.conversation_type = 'group'
      and (
        conversations.group_created_by = inviter_id
        or private.is_chat_group_admin(target_conversation_id, inviter_id)
      )
  );
$$;

grant execute on function private.is_chat_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_chat_group_admin(uuid, uuid) to authenticated;
grant execute on function private.can_invite_chat_group_member(uuid, uuid) to authenticated;

create or replace function private.enforce_chat_group_member_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  owner_id uuid;
begin
  select coalesce(conversations.group_created_by, conversations.created_by)
    into owner_id
  from public.chat_conversations conversations
  where conversations.id = new.conversation_id
    and conversations.conversation_type = 'group';

  if owner_id is null then
    return new;
  end if;

  if old.user_id = owner_id and (new.role <> 'admin' or new.status <> 'active') then
    raise exception 'Group owner cannot be demoted or removed';
  end if;

  if old.role = 'admin'
    and old.user_id is distinct from auth.uid()
    and new.status is distinct from old.status
    and new.status <> 'active'
    and auth.uid() is distinct from owner_id then
    raise exception 'Only group owner can remove admins';
  end if;

  if new.role is distinct from old.role and auth.uid() is distinct from owner_id then
    raise exception 'Only group owner can change admin roles';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_group_members_admin_role_guard
  on public.chat_group_members;

create trigger chat_group_members_admin_role_guard
  before update of role, status
  on public.chat_group_members
  for each row
  execute function private.enforce_chat_group_member_admin_changes();

alter table public.chat_group_members enable row level security;

grant select, insert, update, delete on public.chat_group_members to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Group members can read conversations'
  ) then
    create policy "Group members can read conversations"
      on public.chat_conversations
      for select
      to authenticated
      using (
        conversation_type = 'group'
        and private.is_chat_group_member(id, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Group members can update conversations'
  ) then
    create policy "Group members can update conversations"
      on public.chat_conversations
      for update
      to authenticated
      using (
        conversation_type = 'group'
        and private.is_chat_group_member(id, auth.uid())
      )
      with check (
        conversation_type = 'group'
        and private.is_chat_group_member(id, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_group_members'
      and policyname = 'Group members can read members'
  ) then
    create policy "Group members can read members"
      on public.chat_group_members
      for select
      to authenticated
      using (
        private.is_chat_group_member(conversation_id, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_group_members'
      and policyname = 'Group invite policy can add members'
  ) then
    create policy "Group invite policy can add members"
      on public.chat_group_members
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and joined_by = auth.uid()
        and status = 'active'
        and (
          exists (
            select 1
            from public.chat_conversations conversations
            where conversations.id = conversation_id
              and conversations.conversation_type = 'group'
              and conversations.group_created_by = auth.uid()
          )
          or (
            role = 'member'
            and private.can_invite_chat_group_member(conversation_id, auth.uid())
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_group_members'
      and policyname = 'Group members can update their membership'
  ) then
    create policy "Group members can update their membership"
      on public.chat_group_members
      for update
      to authenticated
      using (
        user_id = auth.uid()
        or private.is_chat_group_admin(conversation_id, auth.uid())
      )
      with check (
        user_id = auth.uid()
        or private.is_chat_group_admin(conversation_id, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Group members can read messages'
  ) then
    create policy "Group members can read messages"
      on public.chat_messages
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_conversations conversations
          where conversations.id = conversation_id
            and conversations.conversation_type = 'group'
            and private.is_chat_group_member(conversation_id, auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Group members can create messages'
  ) then
    create policy "Group members can create messages"
      on public.chat_messages
      for insert
      to authenticated
      with check (
        auth.uid() = sender_id
        and sender_id <> receiver_id
        and exists (
          select 1
          from public.chat_conversations conversations
          where conversations.id = conversation_id
            and conversations.conversation_type = 'group'
            and private.is_chat_group_member(conversation_id, sender_id)
            and private.is_chat_group_member(conversation_id, receiver_id)
            and (
              conversations.group_message_policy = 'members'
              or private.is_chat_group_admin(conversation_id, sender_id)
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Group members can update messages'
  ) then
    create policy "Group members can update messages"
      on public.chat_messages
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.chat_conversations conversations
          where conversations.id = conversation_id
            and conversations.conversation_type = 'group'
            and private.is_chat_group_member(conversation_id, auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from public.chat_conversations conversations
          where conversations.id = conversation_id
            and conversations.conversation_type = 'group'
            and private.is_chat_group_member(conversation_id, auth.uid())
        )
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_group_members;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
