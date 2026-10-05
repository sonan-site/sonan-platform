-- 062 | ما كشفته اختبارات القاعدة بعد الهجرة ٠٥٩
--
-- ١. **طريقان من الخطة إلى المسار.** المفتاح المركّب `(track_id, program_id)`
--    بقي معه المفرد `(track_id)` — وواجهة REST ترفض أي استعلام يربط
--    الجدولين حين يكون بينهما مفتاحان يتقاسمان عموداً (الهجرة ٠٣٤ ومعها
--    `lib/db/relationships.db-test.ts`). فيسقط المفرد، والمركّب يكفي.
--
-- ٢. **العددي بلا وحدة عدّ.** القيد `chk_task_fields_properties` يشترط للعددي
--    وحدةً وفكّاً من المادة، والإعداد السريع (`fn_quick_setup`) وما يُنشئ
--    «تكرار» عددياً يكتبه بلا هذين. فيُكمَّل الصفّ قبل القيد: «مرة» وحدةً،
--    والارتباط بالمادة مفكوكاً — وهو ما فعلته الهجرة ٠٥٩ بالصفوف القائمة.
--
-- تراجع: نعم.

alter table public.plans drop constraint plans_track_id_fkey;

create or replace function public.fn_task_field_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind::text = 'counted' then
    new.count_unit := coalesce(nullif(btrim(new.count_unit), ''), 'مرة');
    new.is_material_linked := false;
  end if;
  return new;
end;
$$;

create trigger trg_task_fields_defaults
  before insert or update of kind, count_unit, is_material_linked on public.task_fields
  for each row execute function public.fn_task_field_defaults();

revoke all on function public.fn_task_field_defaults() from public;
