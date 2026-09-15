-- 034 | إغلاق المستخدم حسابه بنفسه
--
-- صفحة «حسابي» تتيح للمستخدم إغلاق حسابه (`adr/0025 §الأثر`). والإغلاق ثلاثة
-- أفعال لا تُترك نصفاً: إخراجه من مشاركاته، وإيقاف ملفه، وتدقيق ذلك. فهي هنا في
-- معاملة واحدة، ومنع الدخول بعدها من الخادم بمفتاح الخدمة (`setSignInBlocked`).
--
-- **ما يبقى:** إنجازه وإجاباته وسجلّه — الحذف ليّن كالمعتاد، ولا يُمحى شيء.
-- **ما لا يُستعاد تلقائياً:** المشاركات. استعادة الحساب من شاشة المستخدمين تُعيد
-- الملف وتفتح الدخول، ومقعده في البرنامج قد أخذه غيره.
--
-- تراجع: نعم.

/**
 * يُغلق حساب المستدعي — **بلا وسائط**، فلا يُغلق أحدٌ حساب غيره.
 *
 * **وصاحب الدور الإداري يُرفض:** إغلاقه يُسقط صلاحياته فوراً، والمدير الوحيد
 * يُغلق المنصة على نفسها. تُسحب أدواره أولاً بيد غيره، ثم يُغلق.
 */
create or replace function public.fn_close_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile uuid;
  v_left    int;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  select id into v_profile
  from public.profiles
  where user_id = v_uid and deleted_at is null;

  if v_profile is null then
    raise exception 'الحساب مغلق سلفاً أو غير مكتمل' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.user_roles where user_id = v_uid and deleted_at is null
  ) then
    raise exception 'لديك دور إداري. اطلب سحب أدوارك قبل إغلاق حسابك' using errcode = '23514';
  end if;

  update public.participants
  set deleted_at = now()
  where user_id = v_uid and deleted_at is null;
  get diagnostics v_left = row_count;

  update public.profiles set deleted_at = now() where id = v_profile;

  -- مباشرة لا عبر `fn_write_audit`: تلك تشترط صلاحية، والمستخدم العادي لا يملكها.
  insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
  values (v_uid, 'account_closed', 'profiles', v_profile,
          jsonb_build_object('participations_left', v_left));
end;
$$;

revoke all on function public.fn_close_my_account() from public;
grant execute on function public.fn_close_my_account() to authenticated;
