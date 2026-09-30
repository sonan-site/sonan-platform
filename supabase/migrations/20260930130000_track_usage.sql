-- 055 | ما يمنع حذف المسار يُعرَف قبل النقر لا بعده (ق-٢٠)
--
-- زرّ حذف المسار كان يُعرَض مفعَّلاً دائماً، فإن كان في المسار مشاركون رجع
-- الرفض **بعد** النقر. و`ق-٢٠` تشترط أن يُعطَّل ما لا يصحّ بسببٍ مكتوب — ولا
-- يُعرف السبب إلا بعدّ المشاركين، وهو عدٌّ لا يراه من يملك `programs.write`
-- بلا `participants.read`.
--
-- فالدالة `definer` بحارسٍ صريح على `programs.write` في شرطها: من لا يملك
-- الكتابة في البرنامج لا يرى صفّاً واحداً — لا صفراً يوهمه أن المسار خالٍ.
--
-- وتُرجع **الخطط** معها: الحذف يأخذ خطّة المسار، والنافذة تقول ذلك بعددها.
--
-- تراجع: نعم — تُسقط الدالة، ويعود الزرّ يُعرَض ثم يُرفض.

create or replace function public.fn_track_usage(p_program_id uuid)
returns table (track_id uuid, live_participants int, plans int)
language sql
security definer
set search_path = ''
as $$
  select
    t.id,
    (select count(*)::int from public.participants pa
      where pa.track_id = t.id and pa.deleted_at is null),
    (select count(*)::int from public.plans pl
      where pl.track_id = t.id and pl.deleted_at is null)
  from public.tracks t
  where t.program_id = p_program_id
    and t.deleted_at is null
    and public.fn_has_permission('programs.write', p_program_id);
$$;

comment on function public.fn_track_usage(uuid) is
  'ما يشغل كل مسار في البرنامج: مشاركوه الأحياء وخططه. لتعطيل زرّ الحذف بسببٍ مكتوب (ق-٢٠).';

revoke all on function public.fn_track_usage(uuid) from public;
grant execute on function public.fn_track_usage(uuid) to authenticated;
