-- 020 | تصحيح حارس تجميد المقاطع — `before delete` يُعيد `old` لا `new`
--
-- **عطب في الهجرة ٠١٩ أمسكه الاختبار في أول تشغيل.** المشغّل
-- `trg_track_ranges_frozen` أُعلن `before insert or update or delete`، ودالته
-- تُنهي بـ`return new`. و`NEW` **فارغة في `DELETE`** — ومشغّل `before` يُعيد
-- فارغاً **يُلغي العملية صمتاً**.
--
-- فصار كل حذف لمقطع مسار يُلغى بلا خطأ ولا رسالة: الجملة تُبلغ بنجاحها
-- وصفر صفوف تتأثر. ولم يظهر إلا حين عجز التنظيف عن حذف مسار لبقاء مقاطعه.
--
-- والعلاج `coalesce(new, old)`: تُعيد `new` في الإدراج والتحديث، و`old` في
-- الحذف — فتمرّ العملية في الحالات الثلاث، والحارس يمنع بالاستثناء لا بالإلغاء.
--
-- تراجع: نعم.

create or replace function public.fn_guard_track_ranges_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track uuid;
begin
  v_track := coalesce(new.track_id, old.track_id);

  if exists (
    select 1
    from public.achievements a
    join public.participants pt on pt.id = a.participant_id
    where pt.track_id = v_track and a.deleted_at is null
  ) then
    raise exception 'لهذا المسار مشاركون ذوو إنجاز، فمقاطعه لا تُعدَّل'
      using errcode = '23514',
            hint = 'تعديل المقاطع يُزيح رتب من بعده، فيُسنَد للمشارك محفوظٌ ليس من مساره.';
  end if;

  -- **الفارق كله في هذا السطر.** `new` فارغة في الحذف، وإعادة الفارغ من
  -- مشغّل `before` إلغاءٌ صامت لا سماح.
  return coalesce(new, old);
end;
$$;
