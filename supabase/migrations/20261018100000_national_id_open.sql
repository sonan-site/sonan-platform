-- 094 | رقم الوثيقة مفتوحٌ بلا نوع (ملحق adr/0047 · ١٨ أكتوبر ٢٠٢٦)
--
-- قرار الراعي: يسجّل صاحب الجواز والزيارة وغيرهما، لا المواطن والمقيم وحدهما — ولا يُسأل عن
-- نوع وثيقته. فالرقم أرقامٌ وأحرف لاتينية كبيرة من ٥ إلى ٢٠ خانة (الواجهة تطبّعه قبل الحفظ).
-- التفرّد والقفل والقناع كما هي. وكل رقمٍ قائم يطابق الشرط الجديد (أوسع من القديم).

alter table public.profile_identities
  drop constraint chk_profile_identities_national_id,
  add constraint chk_profile_identities_national_id
    check (national_id is null or national_id ~ '^[A-Z0-9]{5,20}$');
