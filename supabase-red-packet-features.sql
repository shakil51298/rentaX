create table if not exists public.chat_red_packets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 200),
  currency text not null default 'BDT',
  wish text,
  photo_url text,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

alter table public.chat_red_packets
  add column if not exists packet_mode text not null default 'direct',
  add column if not exists recipient_count integer not null default 1,
  add column if not exists random_split boolean not null default false;

do $$
begin
  alter table public.chat_red_packets
    drop constraint if exists chat_red_packets_packet_mode_check;
  alter table public.chat_red_packets
    add constraint chat_red_packets_packet_mode_check
    check (packet_mode in ('direct', 'group_selected', 'group_all'));

  alter table public.chat_red_packets
    drop constraint if exists chat_red_packets_recipient_count_check;
  alter table public.chat_red_packets
    add constraint chat_red_packets_recipient_count_check
    check (recipient_count > 0);
end $$;

create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 500000),
  currency text not null default 'BDT',
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_id uuid references auth.users(id) on delete set null,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  red_packet_id uuid references public.chat_red_packets(id) on delete cascade,
  topup_request_id uuid references public.wallet_topup_requests(id) on delete set null,
  amount numeric(12, 2) not null,
  currency text not null default 'BDT',
  source text not null default 'red_packet_received',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_red_packet_recipients (
  id uuid primary key default gen_random_uuid(),
  red_packet_id uuid not null references public.chat_red_packets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'BDT',
  opened_at timestamptz,
  wallet_entry_id uuid references public.wallet_entries(id) on delete set null,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (red_packet_id, user_id)
);

alter table public.chat_red_packets
  drop constraint if exists chat_red_packets_amount_check;

alter table public.chat_red_packets
  drop constraint if exists chat_red_packets_amount_max_check;

alter table public.chat_red_packets
  add constraint chat_red_packets_amount_max_check
  check (amount > 0 and amount <= 200) not valid;

alter table public.wallet_entries
  alter column red_packet_id drop not null;

alter table public.wallet_entries
  add column if not exists topup_request_id uuid references public.wallet_topup_requests(id) on delete set null;

alter table public.wallet_entries
  drop constraint if exists wallet_entries_red_packet_id_key;

alter table public.wallet_entries
  drop constraint if exists wallet_entries_amount_check;

alter table public.wallet_entries
  drop constraint if exists wallet_entries_source_check;

update public.wallet_entries
set source = 'red_packet_received'
where source = 'red_packet';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallet_entries_amount_nonzero_check'
  ) then
    alter table public.wallet_entries
      add constraint wallet_entries_amount_nonzero_check
      check (amount <> 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallet_entries_source_check'
  ) then
    alter table public.wallet_entries
      add constraint wallet_entries_source_check
      check (source in ('admin_topup', 'red_packet_sent', 'red_packet_received'));
  end if;
end $$;

create or replace view public.user_wallets
with (security_invoker = true)
as
select
  wallet_entries.user_id,
  wallet_entries.currency,
  coalesce(sum(wallet_entries.amount), 0)::numeric(12, 2) as balance,
  max(wallet_entries.created_at) as updated_at
from public.wallet_entries
where wallet_entries.user_id = auth.uid()
group by wallet_entries.user_id, wallet_entries.currency;

alter table public.chat_red_packets enable row level security;
alter table public.chat_red_packet_recipients enable row level security;
alter table public.wallet_topup_requests enable row level security;
alter table public.wallet_entries enable row level security;

grant select, insert on public.chat_red_packets to authenticated;
revoke update on public.chat_red_packet_recipients from authenticated;
grant select, insert on public.chat_red_packet_recipients to authenticated;
grant update(last_reminded_at) on public.chat_red_packet_recipients to authenticated;
grant select, insert, update on public.wallet_topup_requests to authenticated;
grant select, insert on public.wallet_entries to authenticated;
grant select on public.user_wallets to authenticated;

create index if not exists chat_red_packets_conversation_idx
  on public.chat_red_packets(conversation_id, created_at desc);

create index if not exists chat_red_packets_receiver_idx
  on public.chat_red_packets(receiver_id, created_at desc);

create index if not exists wallet_entries_user_idx
  on public.wallet_entries(user_id, created_at desc);

create index if not exists wallet_topup_requests_user_idx
  on public.wallet_topup_requests(user_id, created_at desc);

create index if not exists wallet_topup_requests_status_idx
  on public.wallet_topup_requests(status, created_at desc);

drop index if exists wallet_entries_red_packet_receiver_once_idx;

create unique index if not exists wallet_entries_red_packet_user_source_once_idx
  on public.wallet_entries(red_packet_id, user_id, source)
  where red_packet_id is not null;

create unique index if not exists wallet_entries_topup_request_once_idx
  on public.wallet_entries(topup_request_id)
  where topup_request_id is not null and source = 'admin_topup';

create index if not exists chat_red_packet_recipients_packet_idx
  on public.chat_red_packet_recipients(red_packet_id, opened_at);

create index if not exists chat_red_packet_recipients_user_idx
  on public.chat_red_packet_recipients(user_id, opened_at);

insert into public.chat_red_packet_recipients (
  red_packet_id,
  user_id,
  amount,
  currency,
  opened_at,
  wallet_entry_id,
  created_at
)
select
  packet.id,
  packet.receiver_id,
  packet.amount,
  packet.currency,
  entry.created_at,
  entry.id,
  packet.created_at
from public.chat_red_packets packet
left join public.wallet_entries entry
  on entry.red_packet_id = packet.id
  and entry.user_id = packet.receiver_id
  and entry.source = 'red_packet_received'
where not exists (
  select 1
  from public.chat_red_packet_recipients recipient
  where recipient.red_packet_id = packet.id
    and recipient.user_id = packet.receiver_id
)
on conflict (red_packet_id, user_id) do nothing;

update public.chat_red_packets packet
set recipient_count = greatest(1, coalesce(recipient_totals.recipient_count, 1))
from (
  select
    red_packet_id,
    count(*)::integer as recipient_count
  from public.chat_red_packet_recipients
  group by red_packet_id
) recipient_totals
where recipient_totals.red_packet_id = packet.id;

create or replace function public.prevent_wallet_overdraft()
returns trigger
language plpgsql
as $$
declare
  current_balance numeric(12, 2);
begin
  if new.amount >= 0 then
    return new;
  end if;

  select coalesce(sum(wallet_entries.amount), 0)::numeric(12, 2)
  into current_balance
  from public.wallet_entries
  where wallet_entries.user_id = new.user_id
    and wallet_entries.currency = new.currency;

  if current_balance + new.amount < 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_entries_prevent_overdraft on public.wallet_entries;

create trigger wallet_entries_prevent_overdraft
  before insert on public.wallet_entries
  for each row
  execute function public.prevent_wallet_overdraft();

create or replace function public.claim_chat_red_packet(target_red_packet_id uuid)
returns table (
  entry_id uuid,
  user_id uuid,
  red_packet_id uuid,
  amount numeric,
  currency text,
  opened_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_recipient public.chat_red_packet_recipients%rowtype;
  existing_entry public.wallet_entries%rowtype;
  created_entry public.wallet_entries%rowtype;
  claim_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Login is required to open a red packet';
  end if;

  select recipient.*
  into target_recipient
  from public.chat_red_packet_recipients recipient
  where recipient.red_packet_id = target_red_packet_id
    and recipient.user_id = current_user_id
  for update;

  if not found then
    raise exception 'This red packet was not sent to your account';
  end if;

  if target_recipient.opened_at is not null then
    select entry.*
    into existing_entry
    from public.wallet_entries entry
    where entry.id = target_recipient.wallet_entry_id;

    if existing_entry.id is null then
      select entry.*
      into existing_entry
      from public.wallet_entries entry
      where entry.red_packet_id = target_recipient.red_packet_id
        and entry.user_id = current_user_id
        and entry.source = 'red_packet_received'
      order by entry.created_at desc
      limit 1;
    end if;

    return query
    select
      existing_entry.id,
      existing_entry.user_id,
      existing_entry.red_packet_id,
      existing_entry.amount,
      existing_entry.currency,
      target_recipient.opened_at;
    return;
  end if;

  begin
    insert into public.wallet_entries (
      user_id,
      red_packet_id,
      amount,
      currency,
      source
    )
    values (
      current_user_id,
      target_recipient.red_packet_id,
      target_recipient.amount,
      target_recipient.currency,
      'red_packet_received'
    )
    returning * into created_entry;
  exception
    when unique_violation then
      select entry.*
      into created_entry
      from public.wallet_entries entry
      where entry.red_packet_id = target_recipient.red_packet_id
        and entry.user_id = current_user_id
        and entry.source = 'red_packet_received'
      order by entry.created_at desc
      limit 1;
  end;

  update public.chat_red_packet_recipients
  set
    opened_at = claim_time,
    wallet_entry_id = created_entry.id
  where id = target_recipient.id;

  return query
  select
    created_entry.id,
    created_entry.user_id,
    created_entry.red_packet_id,
    created_entry.amount,
    created_entry.currency,
    claim_time;
end;
$$;

revoke all on function public.claim_chat_red_packet(uuid) from public;
grant execute on function public.claim_chat_red_packet(uuid) to authenticated;

do $$
begin
  drop policy if exists chat_red_packets_participants_select on public.chat_red_packets;
  drop policy if exists chat_red_packets_sender_insert on public.chat_red_packets;
  drop policy if exists chat_red_packet_recipients_participants_select on public.chat_red_packet_recipients;
  drop policy if exists chat_red_packet_recipients_sender_insert on public.chat_red_packet_recipients;
  drop policy if exists chat_red_packet_recipients_sender_update on public.chat_red_packet_recipients;
  drop policy if exists wallet_topup_requests_owner_select on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_owner_insert on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_admin_select on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_admin_update on public.wallet_topup_requests;
  drop policy if exists wallet_entries_participants_select on public.wallet_entries;
  drop policy if exists wallet_entries_sender_spend_red_packet on public.wallet_entries;
  drop policy if exists wallet_entries_receiver_claim_red_packet on public.wallet_entries;
  drop policy if exists wallet_entries_admin_topup_insert on public.wallet_entries;

  create policy chat_red_packets_participants_select
    on public.chat_red_packets
    for select
    to authenticated
    using (
      auth.uid() = sender_id
      or auth.uid() = receiver_id
      or exists (
        select 1
        from public.chat_group_members member
        where member.conversation_id = chat_red_packets.conversation_id
          and member.user_id = auth.uid()
          and member.status = 'active'
      )
    );

  create policy chat_red_packets_sender_insert
    on public.chat_red_packets
    for insert
    to authenticated
    with check (
      auth.uid() = sender_id
      and exists (
        select 1
        from public.chat_messages message
        where message.id = chat_red_packets.message_id
          and message.conversation_id = chat_red_packets.conversation_id
          and message.sender_id = auth.uid()
          and message.media_mime_type = 'application/vnd.rentalx.red-packet'
      )
    );

  create policy chat_red_packet_recipients_participants_select
    on public.chat_red_packet_recipients
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = chat_red_packet_recipients.red_packet_id
          and (
            packet.sender_id = auth.uid()
            or packet.receiver_id = auth.uid()
            or exists (
              select 1
              from public.chat_group_members member
              where member.conversation_id = packet.conversation_id
                and member.user_id = auth.uid()
                and member.status = 'active'
            )
          )
      )
    );

  create policy chat_red_packet_recipients_sender_insert
    on public.chat_red_packet_recipients
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = chat_red_packet_recipients.red_packet_id
          and packet.sender_id = auth.uid()
          and packet.currency = chat_red_packet_recipients.currency
          and chat_red_packet_recipients.user_id <> auth.uid()
          and (
            (
              packet.packet_mode = 'direct'
              and chat_red_packet_recipients.user_id = packet.receiver_id
            )
            or exists (
              select 1
              from public.chat_group_members member
              where member.conversation_id = packet.conversation_id
                and member.user_id = chat_red_packet_recipients.user_id
                and member.status = 'active'
            )
          )
      )
    );

  create policy chat_red_packet_recipients_sender_update
    on public.chat_red_packet_recipients
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = chat_red_packet_recipients.red_packet_id
          and packet.sender_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = chat_red_packet_recipients.red_packet_id
          and packet.sender_id = auth.uid()
      )
    );

  create policy wallet_topup_requests_owner_select
    on public.wallet_topup_requests
    for select
    to authenticated
    using (auth.uid() = user_id);

  create policy wallet_topup_requests_owner_insert
    on public.wallet_topup_requests
    for insert
    to authenticated
    with check (
      auth.uid() = user_id
      and status = 'pending'
      and admin_id is null
      and reviewed_at is null
    );

  create policy wallet_topup_requests_admin_select
    on public.wallet_topup_requests
    for select
    to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');

  create policy wallet_topup_requests_admin_update
    on public.wallet_topup_requests
    for update
    to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
    with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');

  create policy wallet_entries_participants_select
    on public.wallet_entries
    for select
    to authenticated
    using (
      auth.uid() = user_id
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com'
      or exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = wallet_entries.red_packet_id
          and (
            packet.sender_id = auth.uid()
            or packet.receiver_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.chat_red_packet_recipients recipient
        where recipient.red_packet_id = wallet_entries.red_packet_id
          and recipient.user_id = auth.uid()
      )
    );

  create policy wallet_entries_sender_spend_red_packet
    on public.wallet_entries
    for insert
    to authenticated
    with check (
      auth.uid() = user_id
      and source = 'red_packet_sent'
      and amount < 0
      and exists (
        select 1
        from public.chat_red_packets packet
        where packet.id = wallet_entries.red_packet_id
          and packet.sender_id = auth.uid()
          and packet.amount = abs(wallet_entries.amount)
          and packet.currency = wallet_entries.currency
      )
    );

  create policy wallet_entries_receiver_claim_red_packet
    on public.wallet_entries
    for insert
    to authenticated
    with check (
      auth.uid() = user_id
      and source = 'red_packet_received'
      and amount > 0
      and exists (
        select 1
        from public.chat_red_packet_recipients recipient
        where recipient.red_packet_id = wallet_entries.red_packet_id
          and recipient.user_id = auth.uid()
          and recipient.amount = wallet_entries.amount
          and recipient.currency = wallet_entries.currency
      )
    );

  create policy wallet_entries_admin_topup_insert
    on public.wallet_entries
    for insert
    to authenticated
    with check (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com'
      and source = 'admin_topup'
      and amount > 0
      and exists (
        select 1
        from public.wallet_topup_requests request
        where request.id = wallet_entries.topup_request_id
          and request.user_id = wallet_entries.user_id
          and request.amount = wallet_entries.amount
          and request.currency = wallet_entries.currency
      )
    );
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.wallet_topup_requests;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.wallet_entries;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_red_packet_recipients;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
