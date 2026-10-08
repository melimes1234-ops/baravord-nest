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

