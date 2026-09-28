-- 047 | المسار المؤرشف لا يبقى تحته مشارك — حارسٌ في القاعدة لا في الدالة وحدها
--
-- `fn_archive_track` (الهجرة ٠٣٩) ترفض أرشفة مسارٍ عليه مشاركون أحياء. لكن
-- **لا مشغّل على `tracks.deleted_at`**، وسياسة `tracks_update` تُجيز لحامل
-- `programs.write` كتابة أي عمود عبر الواجهة المباشرة — ومنه `deleted_at`.
-- فالحارس يُلتَفّ عليه بطلبٍ واحد.
--
-- **وأثره ليس تجميليّاً:** كل سياسات قراءة الخطة والمادة للمشارك تمرّ بمساره
-- الحيّ. فمن بقي على مسارٍ مؤرشف **لا خطة تُقرأ له ولا يوم يُرسَل**، ويقف بلا
-- رسالةٍ تشرح. (`docs/TECH-DEBT.md د-٦`)
--
-- **والمدخل المقابل مسدودٌ سلفاً:** إسناد مشاركٍ إلى مسارٍ مؤرشف ترفضه
-- `fn_guard_participant_capacity` بـ«هذا المسار غير متاح» — إدراجاً وتحديثاً
-- (الهجرة ٠٣٩). فلا يُضاف له حارسٌ ثانٍ بصيغةٍ ثانية: قاعدةٌ واحدة برسالتين
-- تُربك أكثر ممّا تحمي.
--
-- **والمشغّل `security definer` بقصد:** الفحص يمسّ `participants` ولها سياستها،
-- ومن يملك `programs.write` بلا `participants.read` لا يرى المشاركين — فيمرّ
-- الفحص بصمتٍ ويُيتَّمون. وهي علّة الهجرة ٠٢٧ نفسها في `fn_archive_track`.
--
-- **ولا يفحص الحارس ما مضى:** المشغّل يحكم على التغيير لا على الصفوف القائمة.
-- وما وقع قبله يظهر في «يحتاج انتباهك» (`orphan_track`، الهجرة ٠٤٦).
--
-- تراجع: نعم — حذف المشغّل ودالّته.

create or replace function public.fn_guard_track_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- الأرشفة وحدها تُحرَس: الاستعادة (من مؤرشفٍ إلى حيّ) تُرِدّ المسار لأصحابه.
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from public.participants
    where track_id = old.id and deleted_at is null
  ) then
    -- الرسالة نفسها التي تقولها `fn_archive_track` — فالطريقان سببٌ واحد.
    raise exception 'في المسار مشاركون — انقلهم قبل أرشفته' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_guard_track_archive() from public;

-- الاسم يسبق `trg_tracks_updated_at` أبجدياً، فالمنع قبل ختم الوقت.
create trigger trg_tracks_guard_archive
  before update of deleted_at on public.tracks
  for each row execute function public.fn_guard_track_archive();
