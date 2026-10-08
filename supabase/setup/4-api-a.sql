-- ---------------------------------------------------------------- API (called as supabase.rpc)

create or replace function public.get_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.app_role(); v_cat jsonb; v_ver integer;
begin
  if r is null then raise exception 'ابتدا وارد شوید' using errcode = '28000'; end if;
  select value, version into v_cat, v_ver from public.app_config where key = 'catalog';
  -- catalog is null until an admin signs in for the first time and the app creates it (init_catalog)
  return jsonb_build_object('role', r, 'email', (select email from public.profiles where id = auth.uid()),
    'catalog', v_cat, 'version', coalesce(v_ver, 0),
    'movements', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'date', to_char(date, 'YYYY-MM-DD'), 'materialId', material_id, 'kg', kg, 'type', type)
        || case when price_per_kg is not null then jsonb_build_object('pricePerKg', price_per_kg) else '{}'::jsonb end
        || case when ref is not null then jsonb_build_object('ref', ref) else '{}'::jsonb end
        || case when note is not null then jsonb_build_object('note', note) else '{}'::jsonb end
        order by date, created_at, id) from public.movements), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(data order by date desc, created_at desc) from public.batches), '[]'::jsonb));
end $$;

-- First-run setup: the admin's app uploads the starting catalog. Does nothing if one already exists.
create or replace function public.init_catalog(p_catalog jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.app_need('admin');
  perform public.app_validate_catalog(p_catalog);
  insert into public.app_config (key, value, version) values ('catalog', p_catalog, 1) on conflict (key) do nothing;
  perform public.app_audit('catalog.init', '{}'::jsonb);
  return (select version from public.app_config where key = 'catalog');
end $$;

create or replace function public.save_catalog(p_catalog jsonb, p_version integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur integer;
begin
  perform public.app_need('admin');
  perform public.app_validate_catalog(p_catalog);
  select version into cur from public.app_config where key = 'catalog' for update;
  if cur is distinct from p_version then
    raise exception 'کاتالوگ توسط کاربر دیگری تغییر کرده؛ صفحه را تازه کنید' using errcode = '40001';
  end if;
  update public.app_config set value = p_catalog, version = cur + 1 where key = 'catalog';
  perform public.app_audit('catalog.update', jsonb_build_object('from', cur, 'to', cur + 1));
  return cur + 1;
end $$;

create or replace function public.add_movement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := p ->> 'type'; v_kg numeric; v_price numeric; v_date date; v_mat text := p ->> 'materialId';
  v_id text := 'M' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  cat jsonb; ver integer; avg numeric; v_version integer;
begin
  perform public.app_need('admin', 'operator');
  if coalesce(v_type, '') not in ('in', 'waste_in', 'adjust') then raise exception 'نوع حرکت نامعتبر'; end if;
  if v_type = 'adjust' then perform public.app_need('admin'); end if;
  begin
    v_date := (p ->> 'date')::date;
  exception when others then raise exception 'تاریخ نامعتبر';
  end;
  if coalesce(p ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'تاریخ نامعتبر'; end if;
  if jsonb_typeof(p -> 'kg') is distinct from 'number' then raise exception 'مقدار نامعتبر'; end if;
  v_kg := (p ->> 'kg')::numeric;
  if v_kg = 0 or abs(v_kg) > 1e7 then raise exception 'مقدار نامعتبر'; end if;
  if v_type <> 'adjust' and v_kg < 0 then raise exception 'مقدار ورودی باید مثبت باشد'; end if;
  if p ? 'pricePerKg' and jsonb_typeof(p -> 'pricePerKg') is distinct from 'null' then
    if jsonb_typeof(p -> 'pricePerKg') is distinct from 'number' or (p ->> 'pricePerKg')::numeric < 0 or (p ->> 'pricePerKg')::numeric > 1e12 then
      raise exception 'قیمت نامعتبر';
    end if;
    v_price := (p ->> 'pricePerKg')::numeric;
  end if;

  perform pg_advisory_xact_lock(7001); -- serialise stock changes
  select value, version into cat, ver from public.app_config where key = 'catalog' for update;
  if v_mat is null or cat -> 'materials' -> v_mat is null then raise exception 'ماده پیدا نشد'; end if;

  insert into public.movements (id, date, material_id, kg, type, price_per_kg, note, created_by)
  values (v_id, v_date, v_mat, v_kg, v_type, case when v_type = 'in' then v_price end,
          left(p ->> 'note', 200), auth.uid());
  if v_type = 'adjust' and public.app_stock(v_mat) < -1e-9 then
    raise exception 'تعدیل موجودی را منفی می‌کند' using errcode = '23514';
  end if;

  v_version := ver;
  if v_type = 'in' and v_price is not null then
    avg := public.app_avg_price(v_mat);
    if avg is not null then
      cat := jsonb_set(cat, array['materials', v_mat, 'pricePerKg'], to_jsonb(avg));
      v_version := ver + 1;
      update public.app_config set value = cat, version = v_version where key = 'catalog';
    end if;
  end if;
  perform public.app_audit('movement.add', p || jsonb_build_object('id', v_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

