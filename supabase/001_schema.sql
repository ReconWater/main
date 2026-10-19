-- Hospira Water / independent supply prototype.
-- Run once on a NEW Supabase project in SQL Editor. All money is integer CAD cents.
-- Orders are non-payment requests. They never collect or charge a card.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text not null default '',
  volume_ml integer check (volume_ml is null or volume_ml > 0),
  price_cents integer check (price_cents is null or price_cents > 0),
  currency text not null default 'CAD' check (currency = 'CAD'),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null default ('HW-' || upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 12))),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  shipping jsonb not null default '{}'::jsonb,
  notes text not null default '',
  status text not null default 'pending_review' check(status in ('pending_review','approved','fulfilled','cancelled')),
  subtotal_cents integer not null default 0 check(subtotal_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_date_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  sku text not null,
  quantity integer not null check(quantity between 1 and 100),
  unit_price_cents integer not null check(unit_price_cents > 0),
  unique(order_id, product_id)
);

create table if not exists public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  delta integer not null,
  reason text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Browser can only read published products and its own order records.
revoke all on public.admin_users,public.products,public.orders,public.order_items,public.inventory_movements from anon,authenticated;
grant select on public.products to anon,authenticated;
grant select on public.orders,public.order_items to authenticated;
-- The service role is held exclusively by Netlify Functions.
grant all on public.admin_users,public.products,public.orders,public.order_items,public.inventory_movements to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy "Published products are public" on public.products
  for select to anon,authenticated using (is_active = true);
create policy "Customers see their own orders" on public.orders
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers see items for their orders" on public.order_items
  for select to authenticated using (exists(
    select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())
  ));
-- No public/admin role table permissions and no direct table writes through the client.
-- Netlify Functions validate the authenticated user, then call service-only atomic SQL RPCs.

insert into public.products (sku,name,description,volume_ml,price_cents,stock_quantity,low_stock_threshold,is_active)
values ('BW-30ML', 'Bacteriostatic Water for Injection USP',
        '30 mL multiple-dose vial. Product availability and eligibility subject to review. Consult the manufacturer label.',
        30, null, 0, 5, true)
on conflict (sku) do nothing;

-- START OF SERVER-ONLY FUNCTIONS. Browser roles cannot execute them.
create or replace function public.service_submit_order(
  p_customer_id uuid, p_email text, p_name text, p_shipping jsonb, p_items jsonb, p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid;
  v_subtotal integer := 0;
  v_i jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_seen uuid[] := array[]::uuid[];
begin
  if p_customer_id is null or not exists (select 1 from auth.users where id=p_customer_id) then
    raise exception 'A verified customer account is required';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 or
     length(coalesce(p_email,'')) > 200 or
     length(coalesce(p_notes,'')) > 1000 then
    raise exception 'Invalid customer details';
  end if;
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' or
     length(btrim(coalesce(p_shipping->>'address',''))) < 5 or
     length(btrim(coalesce(p_shipping->>'city',''))) < 2 or
     coalesce(p_shipping->>'region','') not in ('AB','BC','MB','NB','NL','NT','NS','NU','ON','PE','QC','SK','YT') or
     upper(btrim(coalesce(p_shipping->>'postal',''))) !~ '^[A-CEGHJ-NPRSTVXY][0-9][A-CEGHJ-NPRSTV-Z][ ]?[0-9][A-CEGHJ-NPRSTV-Z][0-9]$' or
     (p_shipping->>'country') is distinct from 'Canada' or length(p_shipping::text) > 1200 then
    raise exception 'A valid Canadian delivery address, province code, and postal code are required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 15 then
    raise exception 'Select between 1 and 15 products';
  end if;
  if (select count(*) from public.orders
      where customer_id=p_customer_id and created_at > now()-interval '15 minutes') >= 3 then
    raise exception 'Too many recent requests. Please try again later';
  end if;

  insert into public.orders (customer_id,customer_email,customer_name,shipping,notes)
  values (p_customer_id,p_email,btrim(p_name),p_shipping,coalesce(p_notes,'')) returning id into v_order;
  for v_i in select value from jsonb_array_elements(p_items) as t(value) loop
    v_product_id := (v_i->>'product_id')::uuid;
    v_quantity := (v_i->>'quantity')::integer;
    if v_product_id = any(v_seen) then raise exception 'Duplicate product'; end if;
    v_seen := array_append(v_seen,v_product_id);
    if v_quantity is null or v_quantity not between 1 and 25 then raise exception 'Quantity must be 1–25'; end if;
    select * into v_product from public.products where id=v_product_id and is_active=true for update;
    if not found or v_product.price_cents is null then raise exception 'Product not available'; end if;
    if v_product.stock_quantity < v_quantity then raise exception 'Insufficient stock for %',v_product.name; end if;
    insert into public.order_items (order_id,product_id,product_name,sku,quantity,unit_price_cents)
    values (v_order,v_product.id,v_product.name,v_product.sku,v_quantity,v_product.price_cents);
    v_subtotal := v_subtotal + v_quantity * v_product.price_cents;
  end loop;
  update public.orders set subtotal_cents=v_subtotal where id=v_order;
  return v_order;
end $$;

create or replace function public.service_admin_save_product(
  p_id uuid, p_sku text, p_name text, p_description text, p_volume_ml integer,
  p_price_cents integer, p_active boolean, p_threshold integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if length(btrim(coalesce(p_sku,''))) not between 2 and 45 or
     length(btrim(coalesce(p_name,''))) not between 3 and 130 or
     length(coalesce(p_description,'')) > 800 or
     (p_price_cents is not null and p_price_cents <= 0) or
     (p_volume_ml is not null and p_volume_ml <= 0) or
     p_threshold not between 0 and 100000 then
    raise exception 'Invalid product information';
  end if;
  if p_id is null then
    insert into public.products(sku,name,description,volume_ml,price_cents,is_active,low_stock_threshold)
    values (btrim(p_sku),btrim(p_name),coalesce(p_description,''),p_volume_ml,p_price_cents,coalesce(p_active,false),p_threshold)
    returning id into v_id;
  else
    update public.products set sku=btrim(p_sku),name=btrim(p_name),description=coalesce(p_description,''),
      volume_ml=p_volume_ml,price_cents=p_price_cents,is_active=coalesce(p_active,false),
      low_stock_threshold=p_threshold,updated_at=now() where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Product not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.service_admin_set_stock(
  p_product_id uuid, p_quantity integer, p_actor uuid, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_old integer;
begin
  if p_quantity is null or p_quantity not between 0 and 1000000 or
     length(btrim(coalesce(p_reason,''))) not between 3 and 160 then
    raise exception 'Invalid stock adjustment';
  end if;
  select stock_quantity into v_old from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  update public.products set stock_quantity=p_quantity,updated_at=now() where id=p_product_id;
  if p_quantity <> v_old then
    insert into public.inventory_movements(product_id,actor_id,delta,reason)
    values(p_product_id,p_actor,p_quantity-v_old,btrim(p_reason));
  end if;
end $$;

create or replace function public.service_admin_change_order_status(
  p_order_id uuid, p_status text, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item record; v_stock integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status='pending_review' and p_status='approved' then
    for v_item in select * from public.order_items where order_id=p_order_id order by product_id loop
      select stock_quantity into v_stock from public.products where id=v_item.product_id for update;
      if v_stock < v_item.quantity then raise exception 'Insufficient stock for %',v_item.product_name; end if;
      update public.products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now() where id=v_item.product_id;
      insert into public.inventory_movements(product_id,actor_id,delta,reason,order_id)
      values(v_item.product_id,p_actor,-v_item.quantity,'Order approved',p_order_id);
    end loop;
  elsif v_order.status='approved' and p_status='cancelled' then
    for v_item in select * from public.order_items where order_id=p_order_id order by product_id loop
      update public.products set stock_quantity=stock_quantity+v_item.quantity,updated_at=now() where id=v_item.product_id;
      insert into public.inventory_movements(product_id,actor_id,delta,reason,order_id)
      values(v_item.product_id,p_actor,v_item.quantity,'Approved order cancelled',p_order_id);
    end loop;
  elsif not (
    (v_order.status='pending_review' and p_status='cancelled') or
    (v_order.status='approved' and p_status='fulfilled')
  ) then
    raise exception 'This order status transition is not permitted';
  end if;
  update public.orders set status=p_status,updated_at=now() where id=p_order_id;
end $$;

create or replace function public.service_admin_place_order(
  p_name text,p_email text,p_product_id uuid,p_quantity integer,p_notes text,p_actor uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_order uuid;
begin
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 or
     length(btrim(coalesce(p_email,''))) not between 5 and 200 or
     position('@' in p_email)=0 or p_quantity not between 1 and 100 or
     length(coalesce(p_notes,''))>1000 then
    raise exception 'Invalid manual order details';
  end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found or v_product.price_cents is null then raise exception 'Set a price first'; end if;
  if v_product.stock_quantity < p_quantity then raise exception 'Insufficient stock'; end if;
  insert into public.orders(customer_name,customer_email,notes,status,subtotal_cents)
  values (btrim(p_name),btrim(p_email),coalesce(p_notes,''),'approved',v_product.price_cents*p_quantity)
  returning id into v_order;
  insert into public.order_items(order_id,product_id,product_name,sku,quantity,unit_price_cents)
  values(v_order,v_product.id,v_product.name,v_product.sku,p_quantity,v_product.price_cents);
  update public.products set stock_quantity=stock_quantity-p_quantity,updated_at=now() where id=p_product_id;
  insert into public.inventory_movements(product_id,actor_id,delta,reason,order_id)
  values(p_product_id,p_actor,-p_quantity,'Manual order placed',v_order);
  return v_order;
end $$;

revoke execute on function public.service_submit_order(uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke execute on function public.service_admin_save_product(uuid,text,text,text,integer,integer,boolean,integer) from public,anon,authenticated;
revoke execute on function public.service_admin_set_stock(uuid,integer,uuid,text) from public,anon,authenticated;
revoke execute on function public.service_admin_change_order_status(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.service_admin_place_order(text,text,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.service_submit_order(uuid,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.service_admin_save_product(uuid,text,text,text,integer,integer,boolean,integer) to service_role;
grant execute on function public.service_admin_set_stock(uuid,integer,uuid,text) to service_role;
grant execute on function public.service_admin_change_order_status(uuid,text,uuid) to service_role;
grant execute on function public.service_admin_place_order(text,text,uuid,integer,text,uuid) to service_role;

-- After creating an admin through Supabase Auth -> Users, run this separately,
-- replacing the UUID (NEVER put the UUID in frontend code):
-- insert into public.admin_users(user_id) values ('YOUR_AUTH_USER_UUID');
