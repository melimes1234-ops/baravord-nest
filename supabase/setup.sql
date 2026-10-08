-- WPC cost estimation: Supabase schema.
-- Paste this whole file (schema + seed, see setup.sql) in Supabase > SQL Editor > Run.
-- All access goes through the functions below (RPC); tables are not readable or writable directly.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'operator', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  version integer not null
);

create table if not exists public.movements (
  id text primary key,
  date date not null,
  material_id text not null,
  kg numeric not null check (kg <> 0),
  type text not null check (type in ('in', 'out', 'waste_in', 'adjust')),
  price_per_kg numeric check (price_per_kg is null or price_per_kg >= 0),
  ref text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists movements_material_idx on public.movements (material_id, date, created_at);

create table if not exists public.batches (
  id text primary key,
  date date not null,
  data jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text not null,
  action text not null,
  detail jsonb not null default '{}'
);

alter table public.profiles enable row level security;
alter table public.app_config enable row level security;
alter table public.movements enable row level security;
alter table public.batches enable row level security;
alter table public.audit enable row level security;
-- No policies on purpose: the API roles cannot touch the tables, only call the functions.
revoke all on public.profiles, public.app_config, public.movements, public.batches, public.audit from anon, authenticated;
revoke all on sequence public.audit_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- users

-- The first user who signs up becomes admin; everyone after starts as viewer.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''),
          case when exists (select 1 from public.profiles) then 'viewer' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_need(variadic roles text[]) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.app_role();
begin
  if r is null then raise exception 'ابتدا وارد شوید' using errcode = '28000'; end if;
  if not (r = any (roles)) then raise exception 'دسترسی لازم را ندارید' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function public.app_audit(p_action text, p_detail jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit (email, action, detail)
  values (coalesce((select email from public.profiles where id = auth.uid()), '?'), p_action, p_detail)
$$;

-- ---------------------------------------------------------------- formulas

-- Expands recipe items to raw materials. A sub-recipe item of q kg contributes q/total of each of its items.
create or replace function public.app_flatten(items jsonb, catalog jsonb, scale numeric default 1, stack text[] default '{}')
returns table (material_id text, kg numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare it jsonb; rid text; rtotal numeric; r jsonb;
begin
  for it in select * from jsonb_array_elements(items) loop
    if it -> 'ref' ->> 'kind' = 'material' then
      material_id := it -> 'ref' ->> 'id';
      kg := (it ->> 'qtyKg')::numeric * scale;
      return next;
    else
      rid := it -> 'ref' ->> 'id';
      if rid = any (stack) then raise exception 'چرخه در فرمول‌ها: %', rid; end if;
      r := catalog -> 'recipes' -> rid;
      if r is null then raise exception 'فرمول پیدا نشد: %', rid; end if;
      select coalesce(sum((x ->> 'qtyKg')::numeric), 0) into rtotal from jsonb_array_elements(r -> 'items') x;
      if rtotal > 0 then
        return query select * from public.app_flatten(r -> 'items', catalog, scale * (it ->> 'qtyKg')::numeric / rtotal, stack || rid);
      end if;
    end if;
  end loop;
end $$;

-- Weighted-average purchase price, replaying movements in order (same rule as the app's core).
create or replace function public.app_avg_price(p_material text) returns numeric
language plpgsql stable set search_path = public, pg_temp as $$
declare m record; q numeric := 0; a numeric := null; held numeric;
begin
  for m in select kg, price_per_kg from public.movements where material_id = p_material order by date, created_at, id loop
    if m.kg > 0 and m.price_per_kg is not null then
      held := greatest(q, 0);
      a := (case when a is null then 0 else held * a end + m.kg * m.price_per_kg) / (held + m.kg);
    end if;
    q := q + m.kg;
  end loop;
  return a;
end $$;

create or replace function public.app_stock(p_material text) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(kg), 0) from public.movements where material_id = p_material
$$;

-- Structural check of a catalog: a wrong shape would break every price calculation.
create or replace function public.app_validate_catalog(c jsonb) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
declare k text; v jsonb; it jsonb; w jsonb; cfg jsonb;
  fail constant text := 'داده کاتالوگ معتبر نیست';
begin
  if jsonb_typeof(c) is distinct from 'object' then raise exception '%', fail; end if;
  foreach k in array array['materials', 'recipes', 'colors', 'products'] loop
    if jsonb_typeof(c -> k) is distinct from 'object' then raise exception '%: %', fail, k; end if;
  end loop;
  if jsonb_typeof(c -> 'tariffs') is distinct from 'array' or jsonb_array_length(c -> 'tariffs') = 0 then raise exception '%: tariffs', fail; end if;
  if jsonb_typeof(c -> 'config') is distinct from 'object' then raise exception '%: config', fail; end if;

  for k, v in select * from jsonb_each(c -> 'materials') loop
    if v ->> 'id' is distinct from k or coalesce(v ->> 'name', '') = '' then raise exception '%: ماده %', fail, k; end if;
    w := v -> 'pricePerKg';
    if w is not null and jsonb_typeof(w) is distinct from 'null' and (jsonb_typeof(w) is distinct from 'number' or (w #>> '{}')::numeric < 0 or (w #>> '{}')::numeric > 1e12) then
      raise exception '%: قیمت ماده %', fail, k;
    end if;
  end loop;

  for k, v in select * from jsonb_each(c -> 'recipes') union all select * from jsonb_each(c -> 'colors') loop
    if v ->> 'id' is distinct from k or coalesce(v ->> 'name', '') = '' or jsonb_typeof(v -> 'items') is distinct from 'array' then
      raise exception '%: فرمول %', fail, k;
    end if;
    for it in select * from jsonb_array_elements(v -> 'items') loop
      if jsonb_typeof(it -> 'ref') is distinct from 'object' or coalesce(it -> 'ref' ->> 'kind', '') not in ('material', 'recipe')
         or coalesce(it -> 'ref' ->> 'id', '') = '' or jsonb_typeof(it -> 'qtyKg') is distinct from 'number'
         or (it ->> 'qtyKg')::numeric < 0 or (it ->> 'qtyKg')::numeric > 1e6 then
        raise exception '%: جزء نامعتبر در %', fail, k;
      end if;
    end loop;
  end loop;

  for k, v in select * from jsonb_each(c -> 'products') loop
    if v ->> 'id' is distinct from k or coalesce(v ->> 'name', '') = '' or coalesce(v ->> 'baseRecipeId', '') = ''
       or jsonb_typeof(v -> 'colorable') is distinct from 'boolean' then
      raise exception '%: محصول %', fail, k;
    end if;
    w := v -> 'weightPer3mG';
    if w is not null and jsonb_typeof(w) is distinct from 'null' and (jsonb_typeof(w) is distinct from 'number' or (w #>> '{}')::numeric < 0 or (w #>> '{}')::numeric > 1e6) then
      raise exception '%: وزن محصول %', fail, k;
    end if;
  end loop;

  for it in select * from jsonb_array_elements(c -> 'tariffs') loop
    if coalesce(it ->> 'id', '') = '' or coalesce(it ->> 'name', '') = '' or jsonb_typeof(it -> 'marginPct') is distinct from 'number'
       or (it ->> 'marginPct')::numeric < 0 or (it ->> 'marginPct')::numeric > 1000 then
      raise exception '%: تعرفه', fail;
    end if;
  end loop;

  cfg := c -> 'config';
  if jsonb_typeof(cfg -> 'monthlyCosts') is distinct from 'array' or jsonb_typeof(cfg -> 'perBatchCosts') is distinct from 'array'
     or jsonb_typeof(cfg -> 'toleranceByMaterial') is distinct from 'object' then
    raise exception '%: config', fail;
  end if;
  for it in select * from jsonb_array_elements((cfg -> 'monthlyCosts') || (cfg -> 'perBatchCosts')) loop
    if jsonb_typeof(it -> 'amount') is distinct from 'number' or (it ->> 'amount')::numeric < 0 or (it ->> 'amount')::numeric > 1e13 then
      raise exception '%: ردیف هزینه', fail;
    end if;
  end loop;
  foreach k in array array['monthlyProductionKg', 'batchKg', 'wastePct', 'roundTo', 'defaultTolerancePct'] loop
    if jsonb_typeof(cfg -> k) is distinct from 'number' or (cfg ->> k)::numeric < 0 then raise exception '%: config.%', fail, k; end if;
  end loop;
  if (cfg ->> 'wastePct')::numeric >= 100 then raise exception '%: درصد ضایعات', fail; end if;
end $$;

-- ---------------------------------------------------------------- API (called as supabase.rpc)

create or replace function public.get_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.app_role(); res jsonb;
begin
  if r is null then raise exception 'ابتدا وارد شوید' using errcode = '28000'; end if;
  select jsonb_build_object('role', r, 'email', (select email from public.profiles where id = auth.uid()),
                            'catalog', value, 'version', version)
    into res from public.app_config where key = 'catalog';
  return res || jsonb_build_object(
    'movements', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'date', to_char(date, 'YYYY-MM-DD'), 'materialId', material_id, 'kg', kg, 'type', type)
        || case when price_per_kg is not null then jsonb_build_object('pricePerKg', price_per_kg) else '{}'::jsonb end
        || case when ref is not null then jsonb_build_object('ref', ref) else '{}'::jsonb end
        || case when note is not null then jsonb_build_object('note', note) else '{}'::jsonb end
        order by date, created_at, id) from public.movements), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(data order by date desc, created_at desc) from public.batches), '[]'::jsonb));
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
grant execute on function public.get_state(), public.save_catalog(jsonb, integer), public.add_movement(jsonb),
  public.add_batch(jsonb), public.list_users(), public.set_role(uuid, text), public.audit_log() to authenticated;

-- Starting catalog (only inserted once; re-running this file keeps your data).
insert into public.app_config (key, value, version)
values ('catalog', '{"materials":{"wood":{"id":"wood","name":"پودر چوب (خاک اره)","pricePerKg":20500},"carbonate":{"id":"carbonate","name":"کربنات","pricePerKg":19000},"antioxidant":{"id":"antioxidant","name":"آنتی‌اکسیدان","pricePerKg":1350000},"pp-white":{"id":"pp-white","name":"پلیمر سفید","pricePerKg":205000},"pp-recycled":{"id":"pp-recycled","name":"پلیمر چهارمالی","pricePerKg":null},"graft":{"id":"graft","name":"گرافت","pricePerKg":290000},"wax":{"id":"wax","name":"وکس","pricePerKg":250000},"waste":{"id":"waste","name":"ضایعات","pricePerKg":0},"titan":{"id":"titan","name":"تیتان","pricePerKg":1572000},"yellow":{"id":"yellow","name":"رنگ زرد","pricePerKg":null},"red":{"id":"red","name":"رنگ قرمز","pricePerKg":null},"brown":{"id":"brown","name":"رنگ قهوه‌ای","pricePerKg":null},"carbon-black":{"id":"carbon-black","name":"دوده","pricePerKg":null}},"recipes":{"prp":{"id":"prp","name":"PRP","items":[{"ref":{"kind":"material","id":"carbonate"},"qtyKg":38.5},{"ref":{"kind":"material","id":"antioxidant"},"qtyKg":0.25},{"ref":{"kind":"material","id":"graft"},"qtyKg":1},{"ref":{"kind":"material","id":"pp-white"},"qtyKg":60}]},"wpc-profile":{"id":"wpc-profile","name":"پروفیل WPC (پایه)","items":[{"ref":{"kind":"material","id":"wood"},"qtyKg":60},{"ref":{"kind":"recipe","id":"prp"},"qtyKg":33},{"ref":{"kind":"material","id":"wax"},"qtyKg":2},{"ref":{"kind":"material","id":"graft"},"qtyKg":3}]},"cabinet":{"id":"cabinet","name":"صفحه کابینت","items":[{"ref":{"kind":"material","id":"wood"},"qtyKg":72},{"ref":{"kind":"material","id":"pp-recycled"},"qtyKg":24},{"ref":{"kind":"material","id":"wax"},"qtyKg":2},{"ref":{"kind":"material","id":"graft"},"qtyKg":1},{"ref":{"kind":"material","id":"waste"},"qtyKg":10}],"needsReview":true}},"colors":{"n1":{"id":"n1","name":"N1","items":[{"ref":{"kind":"material","id":"titan"},"qtyKg":1.5}],"needsReview":true},"n2":{"id":"n2","name":"N2","items":[{"ref":{"kind":"material","id":"red"},"qtyKg":1.3},{"ref":{"kind":"material","id":"brown"},"qtyKg":0.05},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.03},{"ref":{"kind":"material","id":"waste"},"qtyKg":0.1},{"ref":{"kind":"material","id":"graft"},"qtyKg":1.5},{"ref":{"kind":"material","id":"wax"},"qtyKg":3}],"needsReview":true},"n3":{"id":"n3","name":"N3","items":[{"ref":{"kind":"material","id":"yellow"},"qtyKg":2},{"ref":{"kind":"material","id":"red"},"qtyKg":0.25},{"ref":{"kind":"material","id":"titan"},"qtyKg":0.25}],"needsReview":true},"n4":{"id":"n4","name":"N4","items":[{"ref":{"kind":"material","id":"yellow"},"qtyKg":1.87},{"ref":{"kind":"material","id":"red"},"qtyKg":0.3},{"ref":{"kind":"material","id":"titan"},"qtyKg":0.3},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.03}],"needsReview":true},"n5":{"id":"n5","name":"N5","items":[{"ref":{"kind":"material","id":"brown"},"qtyKg":2},{"ref":{"kind":"material","id":"red"},"qtyKg":0.3},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.25}],"needsReview":true},"n6":{"id":"n6","name":"N6","items":[{"ref":{"kind":"material","id":"graft"},"qtyKg":1.5},{"ref":{"kind":"material","id":"wax"},"qtyKg":2},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":1.2},{"ref":{"kind":"material","id":"waste"},"qtyKg":0.1}],"needsReview":true},"n7":{"id":"n7","name":"N7","items":[{"ref":{"kind":"material","id":"brown"},"qtyKg":0.8},{"ref":{"kind":"material","id":"red"},"qtyKg":0.09},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.05},{"ref":{"kind":"material","id":"waste"},"qtyKg":0.1},{"ref":{"kind":"material","id":"wax"},"qtyKg":2},{"ref":{"kind":"material","id":"graft"},"qtyKg":1.8}],"needsReview":true},"n8":{"id":"n8","name":"N8","items":[{"ref":{"kind":"material","id":"red"},"qtyKg":2},{"ref":{"kind":"material","id":"brown"},"qtyKg":0.2},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.2}],"needsReview":true},"n9":{"id":"n9","name":"N9","items":[{"ref":{"kind":"material","id":"titan"},"qtyKg":1.5},{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.1}],"needsReview":true},"n10":{"id":"n10","name":"N10","items":[{"ref":{"kind":"material","id":"carbon-black"},"qtyKg":0.18},{"ref":{"kind":"material","id":"titan"},"qtyKg":0.25}],"needsReview":true},"n11":{"id":"n11","name":"N11","items":[{"ref":{"kind":"material","id":"yellow"},"qtyKg":1.3},{"ref":{"kind":"material","id":"red"},"qtyKg":0.9},{"ref":{"kind":"material","id":"brown"},"qtyKg":0.3}],"needsReview":true}},"products":{"feel":{"id":"feel","name":"Feel","code":"FC140","widthMm":140,"thicknessMm":21,"usages":[],"weightPer3mG":4800,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"lead":{"id":"lead","name":"Lead","code":"FC103","widthMm":103,"thicknessMm":21,"usages":[],"weightPer3mG":5100,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"shine":{"id":"shine","name":"Shine","code":"FD21","widthMm":140,"thicknessMm":21,"usages":[],"weightPer3mG":7400,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"pond":{"id":"pond","name":"Pond","code":"FD155","widthMm":155,"thicknessMm":26,"usages":[],"weightPer3mG":10450,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"fair":{"id":"fair","name":"Fair","code":"FD26","widthMm":155,"thicknessMm":26,"usages":[],"weightPer3mG":9750,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"flex":{"id":"flex","name":"Flex","code":"FD140","widthMm":140,"thicknessMm":25,"usages":[],"weightPer3mG":7500,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":false},"once":{"id":"once","name":"Once","code":"FD142","widthMm":142,"thicknessMm":21,"usages":[],"weightPer3mG":7800,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"t-once":{"id":"t-once","name":"T-Once","code":"FD142","widthMm":142,"thicknessMm":21,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"clan":{"id":"clan","name":"Clan","code":"FD92","widthMm":91.5,"thicknessMm":21,"usages":[],"weightPer3mG":5100,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"t-clan":{"id":"t-clan","name":"T-Clan","code":"FD92T","widthMm":91.5,"thicknessMm":21,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"fame":{"id":"fame","name":"Fame","code":"FD72","widthMm":72,"thicknessMm":21,"usages":[],"weightPer3mG":3900,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"t-fame":{"id":"t-fame","name":"T-Fame","code":"FD72T","widthMm":72,"thicknessMm":21,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"fate":{"id":"fate","name":"Fate","code":"FB290","widthMm":290,"thicknessMm":12,"usages":[],"weightPer3mG":15100,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"flat":{"id":"flat","name":"Flat","code":"FB130","widthMm":130,"thicknessMm":11,"usages":[],"weightPer3mG":5950,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"petal":{"id":"petal","name":"Petal","code":"FB68","widthMm":68,"thicknessMm":11,"usages":[],"weightPer3mG":2890,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"tail":{"id":"tail","name":"Tail","code":"FB55","widthMm":55,"thicknessMm":14,"usages":[],"weightPer3mG":3110,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"viva":{"id":"viva","name":"Viva","code":"FB92","widthMm":92,"thicknessMm":13,"usages":[],"weightPer3mG":4250,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"off":{"id":"off","name":"Off","code":"FT40","widthMm":38,"thicknessMm":38,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"imp":{"id":"imp","name":"IMP","code":"FT90","widthMm":90,"thicknessMm":45,"usages":[],"weightPer3mG":5730,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"mela":{"id":"mela","name":"Mela","code":"FT60","widthMm":60,"thicknessMm":40,"usages":[],"weightPer3mG":5700,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"coffin":{"id":"coffin","name":"Coffin","code":"FT46","widthMm":27,"thicknessMm":46,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"t-coffin":{"id":"t-coffin","name":"T-Coffin","code":"FT46T","widthMm":27,"thicknessMm":46,"usages":[],"weightPer3mG":null,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"down":{"id":"down","name":"Down","code":"FT27","widthMm":27,"thicknessMm":46,"usages":[],"weightPer3mG":2900,"baseRecipeId":"wpc-profile","colorable":true,"needsReview":true},"cabinet":{"id":"cabinet","name":"صفحه کابینت","code":"CAB","usages":[],"weightPer3mG":null,"baseRecipeId":"cabinet","colorable":false}},"tariffs":[{"id":"wholesale","name":"عمده","marginPct":15},{"id":"retail","name":"خرده","marginPct":25}],"config":{"monthlyCosts":[],"monthlyProductionKg":0,"perBatchCosts":[],"batchKg":100,"wastePct":0,"roundTo":100,"defaultTolerancePct":5,"toleranceByMaterial":{}}}'::jsonb, 1)
on conflict (key) do nothing;
