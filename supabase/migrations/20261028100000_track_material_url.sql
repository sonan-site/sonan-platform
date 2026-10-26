-- رابط مادة المسار (قرار الراعي ٢٦ أكتوبر): ملفّ الكتاب PDF لكل مسار — يراه طالب المسار في واجبه
-- اليومي، ويظهر في دليل المشارك تحت بطاقة مساره. رابطٌ خارجي (Google Drive) لا ملفٌّ مرفوع.
-- يُقرأ بسياسة قراءة المسارات القائمة (البرنامج المنشور للجميع)، ويُكتب بـ`programs.write` كبقية حقوله.

alter table public.tracks
  add column material_url text,
  add constraint chk_tracks_material_url check (
    material_url is null or (material_url ~ '^https://[^[:space:]<>"]+$' and length(material_url) <= 500)
  );

comment on column public.tracks.material_url is
  'رابط مادة المسار (ملفّ الكتاب) — https وحده، يُفتح في نافذةٍ جديدة. فارغ = لا رابط.';
