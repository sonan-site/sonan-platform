-- الاسم بالحروف العربية (قرار الراعي ١٨ نوفمبر ٢٠٢٦ · adr/0062).
--
-- **الصيغة:** كل جزءٍ من الأربعة حرفٌ عربيٌّ أولاً، ثم حروفٌ عربية وتشكيلٌ ومسافةٌ وشَرطة — والحروف
-- العربية تشمل الممتدّة (ی ک ہ پ…) لمن يكتب بلوحة أردية أو فارسية. نظيرها في المتصفح والخادم
-- `ARABIC_NAME` في lib/validation/profile.ts، واختبار التكافؤ في lib/auth/arabic-name.db-test.ts.
--
-- **مشغّلٌ لا قيد:** القيد يُفحص مع أي تعديلٍ للصفّ، فكان يمنع إيقاف حسابٍ من الـ١٣٤ القائمة بحروفٍ
-- لاتينية أو تعديل جواله قبل تصحيح اسمه (درس الهجرة ٠٣٦). فالمشغّل يفحص **الجزء الذي تغيّر وحده**.
-- ورفضه 23514 كالقيد — فـ`fn_handle_new_user` يلتقطه ولا يُرفض إنشاء الحساب (يُستكمل في صفحته).
--
-- **القائمة:** الأسماء القائمة لا تُمسّ؛ تظهر لأصحابها نافذةٌ تطلب تحديثها، و`fn_non_arabic_names`
-- يعدّ ما بقي لمن يقرأ الحسابات.
--
-- تراجع: نعم — drop trigger/functions.

create or replace function private.is_arabic_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[\u0621-\u063A\u0641-\u064A\u066E\u066F\u0671-\u06D3\u06D5](?:[\u0621-\u063A\u0641-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u064B-\u065F\u0670 -]*[\u0621-\u063A\u0641-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u064B-\u065F\u0670])?$';
$$;

comment on function private.is_arabic_name(text) is
  'جزء اسمٍ بالحروف العربية: حرفٌ عربي أولاً ثم حروفٌ وتشكيلٌ ومسافةٌ وشَرطة (adr/0062). نظيره ARABIC_NAME في lib/validation/profile.ts.';

revoke all on function private.is_arabic_name(text) from public, anon;
grant execute on function private.is_arabic_name(text) to authenticated;

-- جزءٌ مقبول: عربيٌّ، أو غائب (فارغٌ أو مسافاتٌ — نقصٌ يحكم به «المكتمل» لا هذه القاعدة).
create or replace function private.name_part_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is null or btrim(p_name, ' ') = '' or private.is_arabic_name(p_name);
$$;

comment on function private.name_part_ok(text) is
  'جزء اسمٍ عربيٌّ أو غائب — نظيره isArabicName في lib/validation/profile.ts (adr/0062).';

revoke all on function private.name_part_ok(text) from public, anon;
grant execute on function private.name_part_ok(text) to authenticated;

-- ══ الرفض عند الكتابة: الجزء الجديد أو المتغيّر وحده ══
create or replace function public.fn_profiles_arabic_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if ((tg_op = 'INSERT' or new.first_name is distinct from old.first_name) and not private.name_part_ok(new.first_name))
     or ((tg_op = 'INSERT' or new.father_name is distinct from old.father_name) and not private.name_part_ok(new.father_name))
     or ((tg_op = 'INSERT' or new.grandfather_name is distinct from old.grandfather_name)
         and not private.name_part_ok(new.grandfather_name))
     or ((tg_op = 'INSERT' or new.family_name is distinct from old.family_name) and not private.name_part_ok(new.family_name)) then
    raise exception 'الاسم بالحروف العربية' using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_profiles_arabic_name() is
  'يرفض جزء اسمٍ جديداً أو متغيّراً بغير الحروف العربية (23514) — والقائم لا يُمسّ (adr/0062).';

create trigger trg_profiles_arabic_name
  before insert or update of first_name, father_name, grandfather_name, family_name on public.profiles
  for each row execute function public.fn_profiles_arabic_name();

-- ══ ما بقي: عددٌ لمن يقرأ الحسابات ══
-- بصلاحية من يطلب: سياسة `profiles` تقصر القراءة على صاحبها وحامل users.read — فغيرُه يعدّ نفسه.
create or replace function public.fn_non_arabic_names()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int
  from public.profiles p
  where p.deleted_at is null
    and p.first_name is not null
    and not (
      private.name_part_ok(p.first_name)
      and private.name_part_ok(p.father_name)
      and private.name_part_ok(p.grandfather_name)
      and private.name_part_ok(p.family_name)
    );
$$;

comment on function public.fn_non_arabic_names() is
  'عدد الحسابات النشطة التي في اسمها جزءٌ بغير الحروف العربية — بصلاحية من يطلب (adr/0062).';

revoke all on function public.fn_non_arabic_names() from public, anon;
grant execute on function public.fn_non_arabic_names() to authenticated;
