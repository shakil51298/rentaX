create table if not exists public.chat_red_packets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 500000),
  currency text not null default 'BDT',
  wish text,
  photo_url text,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

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
alter table public.wallet_topup_requests enable row level security;
alter table public.wallet_entries enable row level security;

grant select, insert on public.chat_red_packets to authenticated;
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

create unique index if not exists wallet_entries_red_packet_receiver_once_idx
  on public.wallet_entries(red_packet_id)
  where red_packet_id is not null and source = 'red_packet_received';

create unique index if not exists wallet_entries_red_packet_user_source_once_idx
  on public.wallet_entries(red_packet_id, user_id, source)
  where red_packet_id is not null;

create unique index if not exists wallet_entries_topup_request_once_idx
  on public.wallet_entries(topup_request_id)
  where topup_request_id is not null and source = 'admin_topup';

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

do $$
begin
  drop policy if exists wallet_topup_requests_owner_select on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_owner_insert on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_admin_select on public.wallet_topup_requests;
  drop policy if exists wallet_topup_requests_admin_update on public.wallet_topup_requests;
  drop policy if exists wallet_entries_participants_select on public.wallet_entries;
  drop policy if exists wallet_entries_sender_spend_red_packet on public.wallet_entries;
  drop policy if exists wallet_entries_receiver_claim_red_packet on public.wallet_entries;
  drop policy if exists wallet_entries_admin_topup_insert on public.wallet_entries;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_red_packets'
      and policyname = 'chat_red_packets_participants_select'
  ) then
    create policy chat_red_packets_participants_select
      on public.chat_red_packets
      for select
      using (
        auth.uid() = sender_id
        or auth.uid() = receiver_id
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_red_packets'
      and policyname = 'chat_red_packets_sender_insert'
  ) then
    create policy chat_red_packets_sender_insert
      on public.chat_red_packets
      for insert
      with check (
        auth.uid() = sender_id
        and exists (
          select 1
          from public.chat_messages message
          where message.id = chat_red_packets.message_id
            and message.conversation_id = chat_red_packets.conversation_id
            and message.sender_id = auth.uid()
            and message.receiver_id = chat_red_packets.receiver_id
            and message.media_mime_type = 'application/vnd.rentalx.red-packet'
        )
      );
  end if;

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
        from public.chat_red_packets packet
        where packet.id = wallet_entries.red_packet_id
          and packet.receiver_id = auth.uid()
          and packet.amount = wallet_entries.amount
          and packet.currency = wallet_entries.currency
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
end $$;
