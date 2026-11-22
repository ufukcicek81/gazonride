-- GazOnRide · Onaylanmış topluluk rotalarını ve mola yerlerini misafirler de görsün
-- Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run.
-- Sadece status = 'approved' olan gönderiler açılır; bekleyen/reddedilen
-- gönderiler eskisi gibi yalnız sahibine ve adminlere görünür.
-- Birden fazla kez çalıştırmak güvenlidir.

drop policy if exists "Onaylı gönderiler misafirlere açık" on public.submissions;
create policy "Onaylı gönderiler misafirlere açık" on public.submissions
  for select to anon
  using (status = 'approved');
grant select on public.submissions to anon;

-- Beğeni sayıları (kimin beğendiği değil, sadece sayılar için okunur).
drop policy if exists "Beğeniler misafirlere açık" on public.route_likes;
create policy "Beğeniler misafirlere açık" on public.route_likes
  for select to anon
  using (true);
grant select on public.route_likes to anon;
