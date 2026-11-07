-- GazOnRide · Admin paneli: üyelerin son girişi ve uygulamayı son açışı
-- Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run.
-- Birden fazla kez çalıştırmak güvenlidir (var olanı günceller).

-- 1) Uygulamanın son açılış zamanı (her üye kendi satırını günceller).
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- 2) Admin listesi: üyelik tarihi, son giriş (auth.users) ve son görülme.
--    Sadece admin_users tablosundaki hesaplar çağırabilir.
create or replace function public.admin_list_users_v2()
returns table(id uuid, email text, name text, bike text,
              created_at timestamptz, last_sign_in_at timestamptz, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'Admin yetkisi gerekli' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.name::text, p.bike::text,
           u.created_at, u.last_sign_in_at, p.last_seen_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by greatest(coalesce(p.last_seen_at, '-infinity'), coalesce(u.last_sign_in_at, '-infinity')) desc;
end;
$$;
revoke all on function public.admin_list_users_v2() from public, anon;
grant execute on function public.admin_list_users_v2() to authenticated;
