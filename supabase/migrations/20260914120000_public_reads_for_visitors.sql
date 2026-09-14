-- 028 | الزائر يقرأ صفحة البرنامج المنشور
--
-- **عطبٌ قائم منذ الهجرة ٠١١، لا من هذه المراجعة:** سياسات القراءة العامة على
-- `tracks` و`page_blocks` و`admission_questions` ممنوحة لـ`anon`، وشرطها
-- `p.status = 'published' or fn_has_permission(…)`. لكن `fn_has_permission`
-- منزوعة من `anon`، وPostgres يفحص صلاحية تنفيذ الدالة **قبل** أن يختصر `or`.
-- فالطلب يُرفض كله، والصفحة العامة تُعرض للزائر بلا مسارات ولا عناصر ولا أسئلة.
-- لم يظهر لأن كل من فحصها كان داخلاً بحسابه.
--
-- **المنح آمن:** الدالة تجيب عن المستدعي وحده، و`auth.uid()` فارغٌ للزائر
-- فجوابها `false` دائماً. لا تكشف شيئاً ولا تكتب.
--
-- تراجع: نعم.

grant execute on function public.fn_has_permission(text, uuid) to anon;

comment on function public.fn_has_permission(text, uuid) is
  'BR-ISO-01 | تجيب عن المستدعي وحده. auth.uid() فارغ = false — ولذلك ممنوحة للزائر: سياسات القراءة العامة تستدعيها.';
