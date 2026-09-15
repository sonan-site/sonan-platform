-- 035 | حارس الملف يعرف متى يأتي التعديل من دالة موثوقة
--
-- `fn_guard_profile_update` (الهجرة ٠٢٦) يمنع صاحب الملف من تعديل `deleted_at`،
-- لأن سياسة `profiles_update` تجيز له تحديث صفّه كله — فكان يرفع إيقافه عن نفسه.
--
-- لكن `fn_close_my_account` (الهجرة ٠٣٤) تُوقف ملف صاحبها **بقصد**، والحارس
-- يقرأ `auth.uid()` فيراها طلب صاحب الملف نفسه ويرفضها. كشفه
-- `lib/auth/close-account.db-test.ts`.
--
-- **الفارق الحقيقي هو من يُنفّذ لا من يطلب:** الطلب المباشر من واجهة REST
-- يُنفَّذ بدور `authenticated`، والدالة `security definer` تُنفَّذ بدور مالكها.
-- والحارس `security invoker`، فـ`current_user` فيه يكشف السياق. فالمنع يبقى
-- كاملاً على الطلب المباشر، ويمرّ ما كتبته دالةٌ تحرس نفسها.
--
-- تراجع: نعم.

create or replace function public.fn_guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- داخل دالة موثوقة، أو من الخادم، أو مالك القاعدة: ليس طلب مستخدمٍ مباشراً.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- بلا هوية = لا يصل هنا من REST. والإداري الحيّ يعدّل ما يشاء.
  if (select auth.uid()) is null or public.fn_has_permission('users.write') then
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
     or new.user_id is distinct from old.user_id then
    raise exception 'حالة الحساب لا تُعدَّل إلا من الإدارة'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
