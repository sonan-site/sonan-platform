-- 044 | الانسحاب من برنامج، والدعوات المعلّقة (adr/0032)
--
-- ١ · **من سجّل لا يستطيع الخروج:** إغلاق الحساب كلّه هو المخرج الوحيد اليوم
--     (`fn_close_my_account`، الهجرة ٠٣٤) — وهو بابٌ أوسع ممّا يحتاجه من أراد
--     ترك برنامجٍ واحدٍ وحده.
--
-- ٢ · **المدعوّ قبل تفعيل حسابه لا ملف له:** `fn_handle_new_user` لا يُنشئ ملفاً
--     ناقصاً (الهجرة ٠٣٦)، فمن دُعي ولم يُفعّل **لا يظهر في أي شاشة**، ولا
--     يُعرف من دُعي أمس.
--
-- تراجع: نعم — حذف الدالتين.

-- ══ ١ · الانسحاب من برنامج ══
/**
 * يسحب المستدعي مشاركته هو — لا مشاركة غيره.
 *
 * **حذفٌ ليّن لا محو:** سجلّ إنجازه يبقى كما يبقى بعد إغلاق الحساب
 * (`adr/0027`)، والمقعد يتحرّر لأن السعة تعدّ الأحياء، والفهرس الفريد على
 * الأحياء وحدهم — فله أن يسجّل ثانيةً.
 */
create or replace function public.fn_withdraw_participation(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_days    int;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  select pa.program_id into v_program
  from public.participants pa
  where pa.id = p_participant_id
    and pa.user_id = v_uid
    and pa.deleted_at is null
  for update;

  if v_program is null then
    raise exception 'لا مشاركة لك بهذا المعرّف' using errcode = '23514';
  end if;

  select count(distinct a.plan_day_id)::int into v_days
  from public.achievements a
  where a.participant_id = p_participant_id and a.deleted_at is null;

  update public.participants
  set deleted_at = now()
  where id = p_participant_id;

  perform public.fn_write_audit(
    'participation_withdrawn', 'participants', p_participant_id,
    jsonb_build_object('program_id', v_program),
    jsonb_build_object('record_days', v_days)
  );
end;
$$;

revoke all on function public.fn_withdraw_participation(uuid) from public;
grant execute on function public.fn_withdraw_participation(uuid) to authenticated;

-- ══ ٢ · الدعوات المعلّقة ══
/**
 * من دُعي ولم يُفعّل حسابه: حسابُ مصادقةٍ بلا ملف.
 *
 * `security definer` لأن `auth.users` لا يقرؤه أحد من الشاشات، والشرط
 * `users.read` — فمن يرى المستخدمين يرى من دُعي منهم.
 */
create or replace function public.fn_pending_invites()
returns table (email text, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, coalesce(u.invited_at, u.created_at)
  from auth.users u
  where public.fn_has_permission('users.read')
    and not exists (select 1 from public.profiles p where p.user_id = u.id)
  order by coalesce(u.invited_at, u.created_at) desc
  limit 100;
$$;

revoke all on function public.fn_pending_invites() from public;
grant execute on function public.fn_pending_invites() to authenticated;
