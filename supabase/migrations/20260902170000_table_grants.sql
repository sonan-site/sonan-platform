-- 015 | منح الجداول صراحةً — الافتراض لا يُعوَّل عليه
--
-- **عطبٌ مكتشَف لا تحسين.** المشروع كان يعوّل على منح Supabase الافتراضية
-- لأدوار `anon` و`authenticated`. وقياس المشروع الحيّ أظهر أنها ليست ما ظُنّ:
--
--   authenticated = Dxtm  →  TRUNCATE · REFERENCES · TRIGGER · MAINTAIN
--                            **بلا SELECT ولا INSERT ولا UPDATE**
--
-- فكل شاشة إدارية معطَّلة عند الجذر: السياسات مكتوبة وصحيحة، لكن المنح دونها
-- لا تُبلَغ. ولا يظهر العطب في الصفحات العامة لأن `anon` مُنح `select` صراحةً
-- على جداولها في الهجرات ١٠–١٤.
--
-- ومعه خطر معاكس: `TRUNCATE` **لا تخضع لأمن الصفوف**. مُنحت لكل مصادَق على
-- كل جدول، فلو بلغها بأي طريق أفرغ الجداول كلها — التدقيق منها.
--
-- **القاعدة المعتمدة من الآن: المنحة تطابق السياسة.** الجدول يُمنح الأمر إن
-- كانت له سياسة لذلك الدور وذلك الأمر، ولا يُمنح شيئاً سواه. ولا `delete` ولا
-- `truncate` لأحد: الحذف ليّن في كل مكان (`platform.md §٢.٢`)، ومنحٌ لا سياسة
-- تحته دَينٌ صامت.
--
-- تراجع: نعم — والتراجع يُعيد التعطيل لا يُصلحه.

-- ══ السحب: كل ما مُنح ضمناً يسقط ══
revoke all on all tables in schema public from anon, authenticated, service_role;

-- `service_role` بلا منحة جدول واحدة عن قصد: الوحدة الوحيدة التي تحمل مفتاحه
-- (`lib/db/service-role.ts`) لا تلمس جدولاً — تستدعي واجهة مصادقة Supabase
-- وحدها. فمفتاح مسرَّب لا يقرأ بيانات مشارك عبر REST.
-- **شرط الانقلاب:** أول حاجة فعلية لكتابة جدولية بمفتاح الخدمة، تُمنح عندها
-- بجدولها وأمرها لا بالجملة.

-- ══ anon — القراءة العامة وحدها ══
-- خمسة جداول تقرؤها الصفحات العامة، ولها سياسات `select` لـ`anon`.
grant select on public.programs             to anon;
grant select on public.tracks               to anon;
grant select on public.page_blocks          to anon;
grant select on public.help_entries         to anon;
grant select on public.admission_questions  to anon;

-- ══ authenticated — قراءة فقط ══
-- لا سياسة كتابة لها أصلاً: التدقيق يُكتب بـ`fn_write_audit`، وحدّ المعدل
-- بـ`fn_hit_rate_limit`، وكلتاهما `security definer` فلا تحتاج منحة المستدعي.
grant select on public.audit_log         to authenticated;
grant select on public.notification_kinds to authenticated;
grant select on public.rate_limit_events to authenticated;

-- ══ authenticated — قراءة وتحديث ══
-- الإشعار يُقرأ ويُعلَّم مقروءاً، ولا يُنشئه صاحبه.
grant select, update on public.notifications to authenticated;

-- ══ authenticated — قراءة وإدراج ══
-- إجابة القبول تُكتب مرة عند التسجيل ولا تُعدَّل بعده.
grant select, insert on public.admission_answers to authenticated;

-- ══ authenticated — قراءة وإدراج وتحديث ══
grant select, insert, update on public.profiles              to authenticated;
grant select, insert, update on public.roles                 to authenticated;
grant select, insert, update on public.role_permissions      to authenticated;
grant select, insert, update on public.user_roles            to authenticated;
grant select, insert, update on public.settings              to authenticated;
grant select, insert, update on public.attachments           to authenticated;
grant select, insert, update on public.sections              to authenticated;
grant select, insert, update on public.programs              to authenticated;
grant select, insert, update on public.tracks                to authenticated;
grant select, insert, update on public.page_blocks           to authenticated;
grant select, insert, update on public.help_entries          to authenticated;
grant select, insert, update on public.admission_questions   to authenticated;
grant select, insert, update on public.participants          to authenticated;
grant select, insert, update on public.track_change_requests to authenticated;
grant select, insert, update on public.content_units         to authenticated;
grant select, insert, update on public.track_content_ranges  to authenticated;
grant select, insert, update on public.task_fields           to authenticated;
grant select, insert, update on public.day_templates         to authenticated;
grant select, insert, update on public.day_template_fields   to authenticated;
grant select, insert, update on public.plans                 to authenticated;
grant select, insert, update on public.plan_days             to authenticated;
grant select, insert, update on public.exams                 to authenticated;

-- ══ ما بعد اليوم ══
-- لا تُضبَط منح افتراضية للجداول القادمة عمداً: الافتراض هو ما أوقعنا في هذا.
-- الجدول الجديد يُمنح في هجرته بجانب سياساته، واختبار التطابق في
-- `lib/db/grants.db-test.ts` يُفشل البناء إن نُسي.
