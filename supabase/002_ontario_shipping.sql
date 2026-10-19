-- Apply ONLY if 001_schema.sql has already been deployed.
-- Updates customer-address validation to use official province/territory codes
-- and Canadian postal code format. Retains service-role-only permissions.
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

revoke execute on function public.service_submit_order(uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.service_submit_order(uuid,text,text,jsonb,jsonb,text) to service_role;
