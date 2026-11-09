-- التسجيل الصوتي لكل باب (قرار الراعي ٩ نوفمبر): الأبواب كتبٌ لكلٍّ تسجيله، والمسار يحفظ من عدّة أبواب.
-- رابطٌ خارجي (Google Drive) كرابط مادة المسار (`20261028100000_track_material_url`) لا ملفٌّ مرفوع.
-- يُكتب مباشرةً كاسم الباب: لا يُزيح رقماً، فحارس الترقيم (`fn_guard_material_layout`) لا يمسّه.
-- ويُقرأ في الدليل من `fn_public_track_sections` — تُعاد بعمودٍ زائد، فتُحذف وتُنشأ بمنحها نفسه.
--
-- تراجع: نعم — drop column، وإعادة الدالّة بأعمدتها الأربعة.

alter table public.material_sections
  add column audio_url text,
  add constraint chk_material_sections_audio_url check (
    audio_url is null or (audio_url ~ '^https://[^[:space:]<>"]+$' and length(audio_url) <= 500)
  );

comment on column public.material_sections.audio_url is
  'التسجيل الصوتي للباب — https وحده، يُفتح في نافذةٍ جديدة. فارغ = لا تسجيل.';

drop function public.fn_public_track_sections(uuid);

create function public.fn_public_track_sections(p_program_id uuid)
returns table (track_id uuid, section_name text, sort_order int, units int, audio_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, s.name, s.sort_order, count(u.id)::int, s.audio_url
  from public.tracks t
  join public.programs p on p.id = t.program_id
  join public.track_content_ranges r on r.track_id = t.id and r.deleted_at is null
  join public.content_units u
    on u.program_id = t.program_id and u.deleted_at is null
   and u.sequence between r.from_sequence and r.to_sequence
  join public.material_sections s on s.id = u.section_id and s.deleted_at is null
  where t.program_id = p_program_id
    and t.deleted_at is null
    and p.deleted_at is null
    and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
  group by t.id, t.sort_order, t.created_at, s.id, s.name, s.sort_order, s.audio_url
  -- المسارات بترتيبها، وأبواب كلٍّ بترتيب نطاقاته فيه (قد يقدّم مسارٌ باباً متأخراً في الترقيم).
  order by t.sort_order, t.created_at, min(r.sort_order), min(u.sequence);
$$;
revoke all on function public.fn_public_track_sections(uuid) from public;
grant execute on function public.fn_public_track_sections(uuid) to anon, authenticated;
comment on function public.fn_public_track_sections(uuid) is
  'أبواب كل مسار وعدد وحداته منها وتسجيلها الصوتي — لدليل المشارك. والوحدات بلا باب لا تُعدّ.';
