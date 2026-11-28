-- إشعارات الجهاز: المُرسِل بدوالٍ لا بمنح جداول (adr/0064 · إصلاح ما بعد النشر).
--
-- قاعدة المنصة (lib/db/grants.db-test.ts): `service_role` بلا منحة جدولٍ واحدة — مفتاحه يبلغ البيانات
-- بدوالٍ مسمّاة فقط. والهجرة 20261126100000 تركت لـ`service_role` منح الجدول الافتراضية على
-- `push_subscriptions`، وكان المُرسِل يقرؤه ويعدّله مباشرة، ويعيد ما لم يُرسَل بتعديل `notifications`
-- (ولا منحة له عليه — فكان سيُرفض). فهذه أربع دوال للمُرسِل وحده، ثم تُسحب المنح.

-- ══ ١ · أجهزة المستلمين ══
create function public.fn_push_targets(p_users uuid[])
returns table (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_id = any(coalesce(p_users, '{}'))
  order by s.user_id, s.created_at;
$$;

-- ══ ٢ · نتيجة الإرسال ══
/* `sent`: نجح — يُسجَّل ويُمحى التعثّر. `gone`: الجهاز ألغى اشتراكه أو عنوانه غير مقبول — يُحذف.
   `transient`: تعثّرٌ عابر — يُسجَّل أول وقته ولا يُحدَّث بعده (المدة من أول تعثّر). */
create function public.fn_push_report(p_id uuid, p_outcome text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  case p_outcome
    when 'sent' then
      update public.push_subscriptions set last_success_at = now(), failing_since = null where id = p_id;
    when 'gone' then
      delete from public.push_subscriptions where id = p_id;
    when 'transient' then
      update public.push_subscriptions set failing_since = now() where id = p_id and failing_since is null;
    else
      raise exception 'نتيجة إرسالٍ غير معروفة: %', p_outcome;
  end case;
end;
$$;

-- ══ ٣ · إعادة ما لم يُرسَل إلى الطابور ══
/* لما حُجز ولم يبدأ إرساله قبل الحدّ الصلب — والمحذوف لا يعود. */
create function public.fn_push_requeue(p_ids uuid[])
returns integer
language sql volatile security definer set search_path = ''
as $$
  with back as (
    update public.notifications set pushed_at = null
    where id = any(coalesce(p_ids, '{}')) and pushed_at is not null and deleted_at is null
    returning 1
  )
  select count(*)::integer from back;
$$;

-- ══ ٤ · تنظيف المتعثّر ══
/* ما تعثّر عابراً مدةً متصلة (افتراضاً سبعة أيام، ولا أقل من يوم) يُحذف. */
create function public.fn_push_prune(p_days integer default 7)
returns integer
language sql volatile security definer set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions
    where failing_since < now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.fn_push_targets(uuid[]) from public, anon, authenticated;
revoke all on function public.fn_push_report(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_push_requeue(uuid[]) from public, anon, authenticated;
revoke all on function public.fn_push_prune(integer) from public, anon, authenticated;
grant execute on function public.fn_push_targets(uuid[]) to service_role;
grant execute on function public.fn_push_report(uuid, text) to service_role;
grant execute on function public.fn_push_requeue(uuid[]) to service_role;
grant execute on function public.fn_push_prune(integer) to service_role;

-- ══ ٥ · سحب منح الجدول ══
revoke all on public.push_subscriptions from service_role;
