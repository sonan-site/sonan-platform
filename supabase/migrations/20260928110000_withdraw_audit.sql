-- 045 | الانسحاب فعلٌ ذاتيّ يُكتب في السجلّ
--
-- `fn_write_audit` (الهجرة ٠٢٦) تقبل فعلاً ذاتياً واحداً: `participant_registered`.
-- وما سواه يحتاج صلاحية إدارية — فانسحاب المشارك من برنامجه كان يفشل كلّه
-- برسالة «لا يُكتب تدقيق إداري بلا صلاحية». كشفه `lib/participants/withdraw.db-test.ts`.
--
-- **والفعل الذاتي يبقى محروساً كما كان:** على **مشاركة صاحبه** وحدها، ومرّة
-- لكل مشاركة. فلا يصير الباب مفتوحاً لكتابة ما شاء في السجلّ.
--
-- تراجع: نعم — تُعاد الدالة بنسخة الهجرة ٠٢٦.

create or replace function public.fn_write_audit(
  p_action       text,
  p_entity_table text,
  p_entity_id    uuid    default null,
  p_before       jsonb   default null,
  p_after        jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'لا يُكتب تدقيق بلا فاعل مصادَق عليه';
  end if;

  if p_action in ('participant_registered', 'participation_withdrawn') then
    -- الأفعال الذاتية: على مشاركة صاحبها، ومرّةً لكلٍّ.
    if p_entity_table <> 'participants'
       or not exists (
         select 1 from public.participants
         where id = p_entity_id and user_id = (select auth.uid())
       )
       or exists (
         select 1 from public.audit_log
         where action = p_action and entity_id = p_entity_id
       ) then
      raise exception 'تدقيق ذاتيّ غير مطابق' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.fn_my_permissions()) then
    raise exception 'لا يُكتب تدقيق إداري بلا صلاحية' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, before, after)
  values ((select auth.uid()), p_action, p_entity_table, p_entity_id, p_before, p_after)
  returning id into v_id;

  return v_id;
end;
$$;
