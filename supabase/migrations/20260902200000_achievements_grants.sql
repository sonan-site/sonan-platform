-- 018 | منح `achievements` — والقاعدة تُثبَّت نمطاً
--
-- **الحارس أمسك أول جدول بعد سنّ القاعدة.** الهجرة ٠١٧ أنشأت `achievements`
-- ومنحتها `select` لـ`authenticated`، ونسيت أن منح Supabase الافتراضية تعود
-- مع كل جدول جديد: `TRUNCATE · REFERENCES · TRIGGER` للأدوار الثلاثة.
--
-- و`lib/db/grants.db-test.ts` أفشل البناء فوراً. وهذا ما وُجد له: القاعدة
-- بلا فحصٍ يحرسها عادةٌ تُنسى، لا قاعدة.
--
-- **النمط من الآن:** كل هجرة تُنشئ جدولاً تبدأ منحها بـ`revoke all` على
-- الجداول التي أنشأتها، ثم تمنح ما تحته سياسة. السحب أولاً لأن الافتراضي
-- يسبقنا إلى الجدول.
--
-- تراجع: نعم — والتراجع يُعيد منحة `TRUNCATE` لا يزيلها.

revoke all on public.achievements from anon, authenticated, service_role;

-- القراءة وحدها: سياستان للقراءة (الإدارة وصاحب الإنجاز)، ولا سياسة كتابة —
-- الكتابة محصورة في `fn_submit_day` وهي `security definer` تحرس نفسها.
grant select on public.achievements to authenticated;
