\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
create schema t;
create table t.results (name text, ok boolean, info text);

create function t.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from auth.users where email = p_email), ''), false);
end $$;

create function t.ok(p_name text, p_cond boolean, p_info text default '') returns void language plpgsql as $$
begin insert into t.results values (p_name, coalesce(p_cond, false), p_info); end $$;

-- Runs sql and expects it to fail with the given sqlstate.
create function t.fails(p_name text, p_sql text, p_state text) returns void language plpgsql as $$
declare st text; msg text;
begin
  begin
    execute p_sql;
    insert into t.results values (p_name, false, 'did not fail');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    insert into t.results values (p_name, st = p_state, st || ' ' || msg);
  end;
end $$;

insert into auth.users (email) values ('alice@x.ir'), ('bob@x.ir'), ('carol@x.ir');

-- roles
select t.ok('first user is admin', (select role from profiles where email = 'alice@x.ir') = 'admin');
select t.ok('later users are viewers', (select count(*) from profiles where role = 'viewer') = 2);
select t.as_user('alice@x.ir');
select set_role((select id from profiles where email = 'bob@x.ir'), 'operator');
select t.ok('admin can promote to operator', (select role from profiles where email = 'bob@x.ir') = 'operator');

-- first run: no catalog until the admin creates it
select t.as_user('carol@x.ir');
select t.ok('catalog is null before first setup', (get_state() -> 'catalog') = 'null'::jsonb and (get_state() ->> 'version')::int = 0);
select t.fails('viewer cannot init catalog', format($q$select init_catalog(%L::jsonb)$q$, :'seed'), '42501');
select t.as_user('alice@x.ir');
select t.fails('init refuses garbage', $q$select init_catalog('{"a":1}')$q$, 'P0001');
select t.ok('admin creates the starting catalog', init_catalog(:'seed'::jsonb) = 1);
select t.ok('init is idempotent', init_catalog(:'seed'::jsonb) = 1 and (select count(*) from app_config) = 1);

-- anonymous and viewer
select t.as_user('');
select t.fails('anonymous cannot read state', 'select get_state()', '28000');
select t.as_user('carol@x.ir');
select t.ok('viewer can read state', (get_state() ->> 'role') = 'viewer');
select t.fails('viewer cannot add movement', $q$select add_movement('{"type":"in","date":"2026-10-04","materialId":"wax","kg":1}')$q$, '42501');
select t.fails('viewer cannot add batch', $q$select add_batch('{}')$q$, '42501');
select t.fails('viewer cannot save catalog', $q$select save_catalog('{}', 1)$q$, '42501');
select t.fails('viewer cannot list users', 'select list_users()', '42501');
select t.as_user('bob@x.ir');
select t.fails('operator cannot save catalog (2)', $q$select save_catalog('{}', 1)$q$, '42501');
select t.fails('operator cannot adjust stock', $q$select add_movement('{"type":"adjust","date":"2026-10-04","materialId":"wax","kg":-1}')$q$, '42501');

-- catalog: versioning and validation
select t.as_user('alice@x.ir');
create temp table cat as select (get_state() -> 'catalog') as c, (get_state() ->> 'version')::int as v;
select t.ok('seed catalog loaded', (select jsonb_typeof(c -> 'materials') from cat) = 'object' and (select v from cat) = 1);
select t.ok('save with right version bumps it', save_catalog((select c from cat), 1) = 2);
select t.fails('stale version is refused', 'select save_catalog((select c from cat), 1)', '40001');
select t.fails('negative price is refused', $q$select save_catalog(jsonb_set((select c from cat), '{materials,wax,pricePerKg}', '-5'), 2)$q$, 'P0001');
select t.fails('waste 100 is refused', $q$select save_catalog(jsonb_set((select c from cat), '{config,wastePct}', '100'), 2)$q$, 'P0001');
select t.fails('garbage catalog is refused', $q$select save_catalog('{"a":1}', 2)$q$, 'P0001');

-- purchases: weighted-average price
select t.as_user('bob@x.ir');
select add_movement('{"type":"in","date":"2026-10-04","materialId":"wax","kg":100,"pricePerKg":200000}');
select add_movement('{"type":"in","date":"2026-10-04","materialId":"wax","kg":100,"pricePerKg":300000}');
select t.ok('catalog price follows weighted average', ((get_state() -> 'catalog' -> 'materials' -> 'wax' ->> 'pricePerKg')::numeric) = 250000);
select t.ok('each priced purchase bumps the version', (get_state() ->> 'version')::int = 4);
select t.fails('unknown material', $q$select add_movement('{"type":"in","date":"2026-10-04","materialId":"ghost","kg":1}')$q$, 'P0001');
select t.fails('negative purchase', $q$select add_movement('{"type":"in","date":"2026-10-04","materialId":"wax","kg":-1}')$q$, 'P0001');
select t.fails('bad date', $q$select add_movement('{"type":"in","date":"2026-13-45","materialId":"wax","kg":1}')$q$, 'P0001');

-- stock everything
select add_movement(jsonb_build_object('type', 'in', 'date', '2026-10-01', 'materialId', k, 'kg', 1000))
  from jsonb_object_keys((get_state() -> 'catalog' -> 'materials')) k;

-- a batch: standard Flex + N1, with 3 kg wax instead of 2
create temp table b as
select jsonb_build_object('date', '2026-10-04', 'productId', 'flex', 'colorId', 'n1',
  'frozenPrices', '{"wax":1}'::jsonb,
  'changes', jsonb_build_array(jsonb_build_object('by', 'hacker', 'what', 'wax 3', 'reason', 'test')),
  'items', (select jsonb_agg(jsonb_build_object('ref', i -> 'ref', 'stdQty', i -> 'qtyKg',
              'actualQty', case when i -> 'ref' ->> 'id' = 'wax' then to_jsonb(3) else i -> 'qtyKg' end))
            from jsonb_array_elements((get_state() -> 'catalog' -> 'recipes' -> 'wpc-profile' -> 'items')
                                      || (get_state() -> 'catalog' -> 'colors' -> 'n1' -> 'items')) i)) as p;
create temp table res as select add_batch((select p from b)) as r;

select t.ok('batch stored once', (select count(*) from batches) = 1);
select t.ok('wax consumed from the ACTUAL formula (3 kg, not 2)', (select sum(kg) from movements where material_id = 'wax') = 1197);
select t.ok('wood consumed (60 kg)', (select sum(kg) from movements where material_id = 'wood') = 940);
select t.ok('polymer inside PRP consumed pro rata',
  abs((select sum(kg) from movements where material_id = 'pp-white') - (1000 - 33.0 / 99.75 * 60)) < 1e-6);
select t.ok('graft = 3 + 33/99.75 of the PRP',
  abs((select sum(kg) from movements where material_id = 'graft') - (1000 - 3 - 33.0 / 99.75 * 1)) < 1e-6);
select t.ok('server froze the prices (client value ignored)',
  ((select r -> 'frozenPrices' -> 'wax' from res))::numeric = 250000);
select t.ok('change author comes from the session', (select r -> 'changes' -> 0 ->> 'by' from res) = 'bob@x.ir');
select t.ok('stored batch matches returned one', (select data from batches limit 1) = (select r from res));

-- short stock: nothing is written
select t.fails('batch refused when stock is short',
  format($q$select add_batch(jsonb_set(%L::jsonb, '{items,0,actualQty}', '99999'))$q$, (select p from b)), '23514');
select t.ok('refused batch wrote nothing', (select count(*) from batches) = 1);
select t.fails('unknown product', format($q$select add_batch(jsonb_set(%L::jsonb, '{productId}', '"nope"'))$q$, (select p from b)), 'P0001');
select t.fails('negative quantity', format($q$select add_batch(jsonb_set(%L::jsonb, '{items,0,actualQty}', '-1'))$q$, (select p from b)), 'P0001');
select t.fails('unknown ref', format($q$select add_batch(jsonb_set(%L::jsonb, '{items,0,ref,id}', '"ghost"'))$q$, (select p from b)), 'P0001');

-- stock adjustments and roles
select t.as_user('alice@x.ir');
select t.fails('adjust below zero is refused', $q$select add_movement('{"type":"adjust","date":"2026-10-04","materialId":"wax","kg":-99999}')$q$, '23514');
select add_movement('{"type":"adjust","date":"2026-10-04","materialId":"wax","kg":-7}');
select t.ok('admin adjust works', (select sum(kg) from movements where material_id = 'wax') = 1190);
select t.fails('cannot demote last admin', format($q$select set_role(%L, 'viewer')$q$, (select id from profiles where email = 'alice@x.ir')), '23514');
select set_role((select id from profiles where email = 'bob@x.ir'), 'admin');
select set_role((select id from profiles where email = 'alice@x.ir'), 'viewer');
select t.ok('can demote once another admin exists', (select role from profiles where email = 'alice@x.ir') = 'viewer');
select t.as_user('bob@x.ir');
select t.ok('audit log records actions', jsonb_array_length(audit_log()) > 10);
select t.ok('users list for admin', jsonb_array_length(list_users()) = 3);

-- API roles cannot touch tables or helpers directly
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;
grant insert on t.results to anon, authenticated;
select t.as_user('bob@x.ir');
set role authenticated;
select t.fails('authenticated cannot read tables', 'select * from public.movements', '42501');
select t.fails('authenticated cannot write tables', $q$insert into public.profiles (id, email, role) values (gen_random_uuid(), 'x', 'admin')$q$, '42501');
select t.fails('authenticated cannot call helpers', $q$select public.app_stock('wax')$q$, '42501');
select t.ok('authenticated can call the API', (get_state() ->> 'role') = 'admin');
set role anon;
select t.fails('anon cannot call the API', 'select public.get_state()', '42501');
reset role;

\o
\set QUIET off
select case when ok then 'PASS' else 'FAIL' end as r, name, case when ok then '' else info end as info from t.results order by 1 desc, name;
select count(*) filter (where not ok) as failed, count(*) as total from t.results \gset
\if :failed
\echo FAILED: :failed of :total
\quit 1
\else
\echo ALL :total CHECKS PASSED
\endif
