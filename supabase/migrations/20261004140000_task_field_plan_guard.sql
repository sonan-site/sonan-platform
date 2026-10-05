-- 060 | حقلٌ له قيمٌ في خطة لا يتغيّر نوعه ولا يُحذف (adr/0037)
--
-- القيمة تُكتب بصيغة نوع حقلها: مقدارٌ للتراكمي، و«من/إلى» للصريح، وقيمةٌ
-- للعددي. فتغيير النوع — أو فكّ ارتباطه بالمادة — بعد كتابة القيم يتركها بصيغةٍ
-- لا يقرؤها المحرّك، وحذفه يترك أياماً بنشاطٍ لا اسم له. فيُرفض ما دامت له
-- قيمٌ في خطةٍ حيّة: يُفرَّغ من الخطة أولاً، ثم يُعدَّل.
--
-- يُكمل حارس الهجرة ٠٣٣ (`fn_guard_task_field_change`) ولا يُبدله: ذاك يحرس
-- المحرّك القديم إلى أن يُحذف.
--
-- تراجع: نعم.

create or replace function public.fn_guard_task_field_plan_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.kind is distinct from old.kind
      or new.is_material_linked is distinct from old.is_material_linked
      or (new.deleted_at is not null and old.deleted_at is null))
     and exists (
       select 1 from public.plan_values v
       join public.plans p on p.id = v.plan_id and p.deleted_at is null
       where v.task_field_id = old.id and v.deleted_at is null
     ) then
    raise exception 'لـ«%» قيمٌ في خطة: فرّغه من الخطة أولاً، ثم غيّر نوعه أو احذفه', old.label
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_task_fields_plan_values
  before update of kind, is_material_linked, deleted_at on public.task_fields
  for each row execute function public.fn_guard_task_field_plan_values();

revoke all on function public.fn_guard_task_field_plan_values() from public;
