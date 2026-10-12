create or replace function public.add_batch(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cat jsonb; v_email text; v_date date; v_product jsonb; v_color text; it jsonb; ref jsonb; need record;
  v_id text := 'B' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_items jsonb := '[]'::jsonb; v_changes jsonb; v_frozen jsonb; v_saved jsonb; v_short text[] := '{}';
  v_actual jsonb;
begin
  perform public.app_need('admin', 'operator');
  select email into v_email from public.profiles where id = auth.uid();
  begin
    v_date := (p ->> 'date')::date;
  exception when others then raise exception 'تاریخ نامعتبر';
  end;
  if coalesce(p ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'تاریخ نامعتبر'; end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') not between 1 and 200 then
    raise exception 'اجزای پارت نامعتبر';
  end if;

  perform pg_advisory_xact_lock(7001);
  select value into cat from public.app_config where key = 'catalog' for update;

  v_product := cat -> 'products' -> (p ->> 'productId');
  if v_product is null then raise exception 'محصول پیدا نشد'; end if;
  if p -> 'colorId' is not null and jsonb_typeof(p -> 'colorId') is distinct from 'null' then
    v_color := p ->> 'colorId';
    if cat -> 'colors' -> v_color is null or (v_product ->> 'colorable') is distinct from 'true' then raise exception 'رنگ نامعتبر'; end if;
  end if;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    ref := it -> 'ref';
    if jsonb_typeof(ref) is distinct from 'object' or jsonb_typeof(it -> 'stdQty') is distinct from 'number' or jsonb_typeof(it -> 'actualQty') is distinct from 'number'
       or (it ->> 'stdQty')::numeric not between 0 and 1e6 or (it ->> 'actualQty')::numeric not between 0 and 1e6 then
      raise exception 'جزء پارت نامعتبر';
    end if;
    if not coalesce((ref ->> 'kind' = 'material' and cat -> 'materials' -> (ref ->> 'id') is not null)
         or (ref ->> 'kind' = 'recipe' and cat -> 'recipes' -> (ref ->> 'id') is not null), false) then
      raise exception 'ماده یا فرمول پیدا نشد';
    end if;
    v_items := v_items || jsonb_build_object('ref', jsonb_build_object('kind', ref ->> 'kind', 'id', ref ->> 'id'),
                                             'stdQty', it -> 'stdQty', 'actualQty', it -> 'actualQty');
  end loop;

  -- who changed what is taken from the session, never from the client
  select coalesce(jsonb_agg(jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         'by', v_email, 'what', left(coalesce(c ->> 'what', ''), 200), 'reason', left(c ->> 'reason', 300))), '[]'::jsonb)
    into v_changes from (select c from jsonb_array_elements(case when jsonb_typeof(p -> 'changes') = 'array' then p -> 'changes' else '[]'::jsonb end) c limit 500) s;

  select coalesce(jsonb_object_agg(k, v -> 'pricePerKg'), '{}'::jsonb) into v_frozen from jsonb_each(cat -> 'materials') t(k, v);

  select jsonb_agg(jsonb_build_object('ref', i -> 'ref', 'qtyKg', i -> 'actualQty')) into v_actual from jsonb_array_elements(v_items) i;

  for need in select f.material_id, sum(f.kg) as kg from public.app_flatten(v_actual, cat) f group by f.material_id having sum(f.kg) > 0 loop
    if need.kg > public.app_stock(need.material_id) + 1e-9 then
      v_short := v_short || coalesce(cat -> 'materials' -> need.material_id ->> 'name', need.material_id);
    end if;
  end loop;
  if array_length(v_short, 1) > 0 then
    raise exception 'موجودی کافی نیست: %', array_to_string(v_short, '، ') using errcode = '23514';
  end if;

  v_saved := jsonb_build_object('id', v_id, 'date', p ->> 'date', 'productId', p ->> 'productId',
                                'colorId', to_jsonb(v_color), 'items', v_items, 'frozenPrices', v_frozen,
                                'changes', v_changes);
  if p ->> 'note' is not null then v_saved := v_saved || jsonb_build_object('note', left(p ->> 'note', 300)); end if;

  insert into public.batches (id, date, data, created_by) values (v_id, v_date, v_saved, auth.uid());
  insert into public.movements (id, date, material_id, kg, type, ref, created_by)
    select v_id || ':' || f.material_id, v_date, f.material_id, -sum(f.kg), 'out', v_id, auth.uid()
    from public.app_flatten(v_actual, cat) f group by f.material_id having sum(f.kg) > 0;
  perform public.app_audit('batch.add', jsonb_build_object('id', v_id, 'productId', p ->> 'productId', 'colorId', v_color));
  return v_saved;
end $$;

-- Finished goods: sticks made (in), sticks that left (out), waste from a batch (scrap).
create or replace function public.add_goods(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := p ->> 'type'; v_date date; cat jsonb; v_product jsonb; v_color text; v_len numeric; v_sticks numeric; v_kg numeric;
  v_id text := 'G' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_rec jsonb; have numeric;
begin
  perform public.app_need('admin', 'operator');
  if coalesce(v_type, '') not in ('in', 'out', 'scrap') then raise exception 'نوع نامعتبر'; end if;
  begin
    v_date := (p ->> 'date')::date;
  exception when others then raise exception 'تاریخ نامعتبر';
  end;
  if coalesce(p ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'تاریخ نامعتبر'; end if;

  perform pg_advisory_xact_lock(7002); -- serialise finished-goods changes
  select value into cat from public.app_config where key = 'catalog';
  v_rec := jsonb_build_object('id', v_id, 'date', p ->> 'date', 'type', v_type);
  if p ->> 'note' is not null then v_rec := v_rec || jsonb_build_object('note', left(p ->> 'note', 200)); end if;
  if p ->> 'batchId' is not null then v_rec := v_rec || jsonb_build_object('batchId', left(p ->> 'batchId', 40)); end if;

  if p ->> 'productId' is not null then
    if cat -> 'products' -> (p ->> 'productId') is null then raise exception 'محصول پیدا نشد'; end if;
    v_rec := v_rec || jsonb_build_object('productId', p ->> 'productId');
  end if;

  if v_type = 'scrap' then
    if jsonb_typeof(p -> 'kg') is distinct from 'number' or (p ->> 'kg')::numeric <= 0 or (p ->> 'kg')::numeric > 1e6 then raise exception 'وزن ضایعات نامعتبر'; end if;
    v_rec := v_rec || jsonb_build_object('kg', p -> 'kg', 'returned', (p ->> 'returned') is not distinct from 'true');
  else
    v_product := cat -> 'products' -> (p ->> 'productId');
    if v_product is null then raise exception 'محصول پیدا نشد'; end if;
    if p -> 'colorId' is not null and jsonb_typeof(p -> 'colorId') is distinct from 'null' then
      v_color := p ->> 'colorId';
      if cat -> 'colors' -> v_color is null or (v_product ->> 'colorable') is distinct from 'true' then raise exception 'رنگ نامعتبر'; end if;
    end if;
    if jsonb_typeof(p -> 'lengthM') is distinct from 'number' or (p ->> 'lengthM')::numeric not between 0.1 and 20 then raise exception 'طول نامعتبر'; end if;
    if jsonb_typeof(p -> 'sticks') is distinct from 'number' or (p ->> 'sticks')::numeric <> trunc((p ->> 'sticks')::numeric)
       or (p ->> 'sticks')::numeric not between 1 and 1e6 then raise exception 'تعداد شاخه نامعتبر'; end if;
    v_len := (p ->> 'lengthM')::numeric; v_sticks := (p ->> 'sticks')::numeric;
    v_rec := v_rec || jsonb_build_object('colorId', to_jsonb(v_color), 'lengthM', p -> 'lengthM', 'sticks', p -> 'sticks');
    if v_type = 'out' then
      v_rec := v_rec || jsonb_build_object('reason', case when p ->> 'reason' in ('sample', 'other') then p ->> 'reason' else 'sale' end);
      if nullif(trim(p ->> 'party'), '') is not null then v_rec := v_rec || jsonb_build_object('party', left(trim(p ->> 'party'), 100)); end if;
      select coalesce(sum(case when data ->> 'type' = 'in' then (data ->> 'sticks')::numeric else -(data ->> 'sticks')::numeric end), 0) into have
        from public.goods
        where data ->> 'type' in ('in', 'out') and data ->> 'productId' = p ->> 'productId'
          and coalesce(data ->> 'colorId', '') = coalesce(v_color, '') and (data ->> 'lengthM')::numeric = v_len;
      if v_sticks > have then raise exception 'موجودی کافی نیست؛ فقط % شاخه داریم', have using errcode = '23514'; end if;
    end if;
  end if;

  insert into public.goods (id, date, data, created_by) values (v_id, v_date, v_rec, auth.uid());
  perform public.app_audit('goods.add', v_rec);
  return v_rec;
end $$;

create or replace function public.list_users() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.app_need('admin');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'role', role, 'created_at', created_at) order by created_at) from public.profiles), '[]'::jsonb);
end $$;

create or replace function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur text;
begin
  perform public.app_need('admin');
  if coalesce(p_role, '') not in ('admin', 'operator', 'viewer') then raise exception 'نقش نامعتبر'; end if;
  select role into cur from public.profiles where id = p_user for update;
  if cur is null then raise exception 'کاربر پیدا نشد'; end if;
  if cur = 'admin' and p_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'آخرین ادمین را نمی‌توان تنزل داد' using errcode = '23514';
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform public.app_audit('user.role', jsonb_build_object('user', p_user, 'role', p_role));
end $$;

create or replace function public.audit_log() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.app_need('admin');
  return coalesce((select jsonb_agg(jsonb_build_object('at', at, 'username', email, 'action', action, 'detail', detail::text) order by id desc)
                   from (select * from public.audit order by id desc limit 200) a), '[]'::jsonb);
end $$;

-- Only the API functions are callable by logged-in users; helpers stay internal.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_state(), public.init_catalog(jsonb), public.save_catalog(jsonb, integer, text), public.add_movement(jsonb),
  public.add_batch(jsonb), public.add_goods(jsonb), public.list_users(), public.set_role(uuid, text), public.audit_log() to authenticated;
