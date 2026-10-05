-- 061 | برنامج الخطة المخصّصة من مسارها حين لا يُذكر
--
-- `plans.program_id` إلزاميٌّ منذ صارت الخطة الافتراضية بلا مسار (الهجرة ٠٥٩).
-- وما بقي من المحرّك القديم — الإعداد السريع (`fn_quick_setup`) واختباراته —
-- يُنشئ الخطة بمسارها وحده. فيُشتقّ البرنامج من المسار عند الإدراج، ويُرفض
-- برنامجٌ يخالف مسارَه (المفتاح المركّب يرفضه أصلاً).
--
-- تراجع: نعم.

create or replace function public.fn_plan_program_from_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.program_id is null and new.track_id is not null then
    select t.program_id into new.program_id from public.tracks t where t.id = new.track_id;
  end if;
  return new;
end;
$$;

create trigger trg_plans_program_from_track
  before insert on public.plans
  for each row execute function public.fn_plan_program_from_track();

revoke all on function public.fn_plan_program_from_track() from public;
