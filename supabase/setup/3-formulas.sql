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

