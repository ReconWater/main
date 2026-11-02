-- Recon Water order archive metadata
-- Run before deploying the matching admin/API patch.

alter table public.orders
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null;

create index if not exists orders_archived_at_idx
  on public.orders (archived_at desc)
  where archived_at is not null;

create index if not exists orders_active_created_at_idx
  on public.orders (created_at desc)
  where archived_at is null;

comment on column public.orders.archived_at is
  'Administrative archive timestamp. Does not change the order lifecycle status.';

comment on column public.orders.archived_by is
  'Administrator auth user id that archived the order.';
