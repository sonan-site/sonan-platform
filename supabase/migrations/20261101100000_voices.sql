-- «صوتك» — رسائل الطلاب ومعالجتها (خطة ١ نوفمبر · الدفعة ١ بلا مرفق · adr/0054).
--
-- الطالب الداخل يرسل (استفسار · ملاحظة · اقتراح · مشكلة تقنية · شكوى) بعنوانٍ وتفاصيل وسياقٍ تقني،
-- فيُردّ عليه ردٌّ واحد يراه في «رسائلي» باسم «فريق {البرنامج}». ويعالجها حامل `voices.manage` على
-- برنامج الرسالة — والعام يرى الكل، ومنه ما بلا برنامج.
--
-- **الجدول بلا سياسات:** القراءة والكتابة كلها بدوالّ — فلا يقرأ الطالب اسم الرادّ الحقيقي
-- (قرار الراعي)، ولا يقرأ المشرف المحصور ما يمنعه نطاقه، ويرى المحصور هوية المرسِل وإن لم يملك
-- `participants.read` (مراجعة الخطة ح٢).

create table public.voices (
  id               uuid primary key default gen_random_uuid(),
  -- حساب المرسِل يُمحى بمحو صاحبه (`fn_purge_account`): رسائله تذهب معه (مراجعة الخطة ح١).
  user_id          uuid not null references auth.users (id) on delete cascade,
  participant_id   uuid references public.participants (id) on delete set null,
  program_id       uuid references public.programs (id) on delete set null,
  kind             text not null,
  title            text not null,
  body             text not null,
  context          jsonb not null default '{}'::jsonb,
  status           text not null default 'new',
  reply            text,
  replied_by       uuid references auth.users (id) on delete set null,
  -- الاسم يُثبَّت نصاً كـ`decided_by_label` — ويُطمس بمحو صاحبه.
  replied_by_label text,
  replied_at       timestamptz,
  reply_seen_at    timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint chk_voices_kind check (kind in ('inquiry', 'note', 'suggestion', 'technical', 'complaint')),
  constraint chk_voices_status check (status in ('new', 'in_progress', 'closed')),
  constraint chk_voices_title check (char_length(btrim(title)) between 3 and 120),
  constraint chk_voices_body check (char_length(btrim(body)) between 10 and 2000),
  constraint chk_voices_reply check (reply is null or char_length(btrim(reply)) between 2 and 1000),
  constraint chk_voices_context check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 2048)
);
comment on table public.voices is
  '«صوتك»: رسالة الطالب وردٌّ واحد عليها (adr/0054). بلا سياسات — كل قراءةٍ وكتابة بدوالّ.';
comment on column public.voices.context is
  'سياقٌ تقني يملؤه العميل ويُقصّ في الخادم: الصفحة (بلا استعلام) · المتصفح · عرض الشاشة. ≤2KB، ويُعرض نصاً.';

create index idx_voices_user on public.voices (user_id, created_at desc) where deleted_at is null;
create index idx_voices_inbox on public.voices (program_id, status, created_at desc) where deleted_at is null;
create trigger trg_voices_updated_at before update on public.voices
  for each row execute function public.fn_set_updated_at();
alter table public.voices enable row level security;
revoke all on public.voices from anon, authenticated, service_role;
-- قراءةٌ ممنوحة بسياسةٍ لا تُرجع صفّاً — فلا جدول بلا سياسة ولا سياسة بلا منحة (`grants.db-test`)،
-- ولا منفذ مباشر: كل قراءةٍ وكتابة بالدوالّ أعلاه وأدناه.
grant select on public.voices to authenticated;
create policy voices_functions_only on public.voices
  for select to authenticated using (false);

-- ══ الصلاحية لدور النظام ══ (والكتالوج في config/permissions.ts، والبذرة في seed.sql)
insert into public.role_permissions (role_id, permission_code)
select r.id, 'voices.manage' from public.roles r
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- ══ الإرسال ══
create or replace function public.fn_submit_voice(
  p_kind text, p_title text, p_body text, p_context jsonb default '{}'::jsonb, p_participant_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_part  record;
  v_today timestamptz;
  v_ctx   jsonb;
  v_path  text;
  v_id    uuid;
begin
  if v_uid is null or not public.fn_is_active() then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('inquiry', 'note', 'suggestion', 'technical', 'complaint') then
    raise exception 'اختر نوع الرسالة' using errcode = '22023';
  end if;

  -- خمس رسائل في يوم الرياض لكل حساب — والقفل يمنع طلبين متزامنين من تجاوز العدّ (مراجعة الخطة م٨).
  perform pg_advisory_xact_lock(hashtextextended('voices:' || v_uid::text, 0));
  v_today := (public.fn_local_now()::date)::timestamp at time zone 'Asia/Riyadh';
  if (select count(*) from public.voices where user_id = v_uid and created_at >= v_today) >= 5 then
    raise exception 'بلغت حدّ الرسائل اليوم (٥). أعد المحاولة غداً، أو تواصل مع شؤون الطلاب' using errcode = 'P0001', hint = 'voices_daily_limit';
  end if;

  -- المشاركة: من صفحة رحلته إن كانت له، وإلا أحدث مشاركةٍ تتبع الخطة، وإلا أحدث مشاركة (مراجعة الخطة م٢).
  select pa.id, pa.program_id into v_part from public.participants pa
  where pa.user_id = v_uid and pa.deleted_at is null
  order by (pa.id = p_participant_id) desc nulls last, public.fn_follows_plan(pa.status) desc, pa.joined_at desc
  limit 1;

  -- السياق: المفاتيح المسموحة وحدها، والصفحة بلا استعلامٍ ولا مرساة — روابط التأكيد تحمل رموزاً (م٧).
  v_path := split_part(split_part(coalesce(p_context ->> 'path', ''), '?', 1), '#', 1);
  v_ctx := jsonb_strip_nulls(jsonb_build_object(
    'path', nullif(left(v_path, 200), ''),
    'ua', nullif(left(coalesce(p_context ->> 'ua', ''), 300), ''),
    'viewport', nullif(left(coalesce(p_context ->> 'viewport', ''), 20), '')
  ));

  insert into public.voices (user_id, participant_id, program_id, kind, title, body, context)
  values (v_uid, v_part.id, v_part.program_id, p_kind, btrim(p_title), btrim(p_body), v_ctx)
  returning id into v_id;
  return v_id;
end;
$$;

-- ══ رسائلي ══ — بلا اسم الرادّ: يراه الطالب «فريق {البرنامج}» (قرار الراعي). والمؤرشفة تبقى عنده
-- «مغلقة»: الأرشفة ترتيبٌ لصندوق الإدارة لا حذفٌ لرسالته (قرار الراعي).
create or replace function public.fn_my_voices()
returns table (
  id uuid, kind text, title text, body text, status text, created_at timestamptz,
  reply text, replied_at timestamptz, reply_unseen boolean, team text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.kind, v.title, v.body,
         case when v.deleted_at is not null then 'closed' else v.status end,
         v.created_at, v.reply, v.replied_at,
         v.reply is not null and v.reply_seen_at is null,
         'فريق ' || coalesce(p.name, 'منصة سنن')
  from public.voices v
  left join public.programs p on p.id = v.program_id
  where v.user_id = (select auth.uid())
  order by v.created_at desc
  limit 100;
$$;

-- ردودٌ لم تُقرأ — نقطةٌ على زرّ «صوتك».
create or replace function public.fn_my_voices_unseen()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.voices
  where user_id = (select auth.uid()) and reply is not null and reply_seen_at is null;
$$;

create or replace function public.fn_mark_voices_seen()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  update public.voices set reply_seen_at = now()
  where user_id = (select auth.uid()) and reply is not null and reply_seen_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ══ صندوق الإدارة ══ — بنطاق `voices.manage` على برنامج الرسالة، ومعها هوية المرسِل (ح٢).
create or replace function public.fn_inbox_list(
  p_status text default null, p_kind text default null, p_program_id uuid default null
)
returns table (
  id uuid, kind text, title text, status text, created_at timestamptz, has_reply boolean,
  program_id uuid, program_name text, sender_name text, registration_no integer, registration_prefix text, track_name text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.kind, v.title, v.status, v.created_at, v.reply is not null,
         v.program_id, p.name, coalesce(pr.full_name, 'حساب محذوف'),
         pa.registration_no, p.registration_prefix,
         t.name
  from public.voices v
  left join public.programs p on p.id = v.program_id
  left join public.participants pa on pa.id = v.participant_id
  left join public.tracks t on t.id = pa.track_id
  left join public.profiles pr on pr.user_id = v.user_id
  where v.deleted_at is null and (v.program_id is null or p.deleted_at is null)
    and public.fn_has_permission('voices.manage', v.program_id)
    and (p_status is null or v.status = p_status)
    and (p_kind is null or v.kind = p_kind)
    and (p_program_id is null or v.program_id = p_program_id)
  order by (v.status = 'new') desc, v.created_at desc
  limit 300;
$$;

create or replace function public.fn_voice_detail(p_id uuid)
returns table (
  id uuid, kind text, title text, body text, status text, created_at timestamptz, context jsonb,
  reply text, replied_at timestamptz, replied_by_label text, reply_seen boolean, closed_at timestamptz,
  program_id uuid, program_name text, sender_name text, sender_phone text, registration_no integer, registration_prefix text, track_name text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.kind, v.title, v.body, v.status, v.created_at, v.context,
         v.reply, v.replied_at, v.replied_by_label, v.reply_seen_at is not null, v.closed_at,
         v.program_id, p.name, coalesce(pr.full_name, 'حساب محذوف'), pr.phone,
         pa.registration_no, p.registration_prefix,
         t.name
  from public.voices v
  left join public.programs p on p.id = v.program_id
  left join public.participants pa on pa.id = v.participant_id
  left join public.tracks t on t.id = pa.track_id
  left join public.profiles pr on pr.user_id = v.user_id
  where v.id = p_id and v.deleted_at is null and (v.program_id is null or p.deleted_at is null)
    and public.fn_has_permission('voices.manage', v.program_id);
$$;

-- ══ المعالجة ══
create or replace function public.fn_voice_guard(p_id uuid)
returns public.voices
language plpgsql security definer set search_path = ''
as $$
declare
  v public.voices;
begin
  -- يقفل الصفّ قبل الفحص: ردٌّ وأرشفةٌ متزامنان لا يكتب أحدهما على ما محاه الآخر (مراجعة البناء ١٠).
  select * into v from public.voices where id = p_id and deleted_at is null for update;
  if v.id is null or not public.fn_has_permission('voices.manage', v.program_id) then
    raise exception 'الرسالة غير موجودة' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

/* الرد (أو تعديله): يعود غير مقروء ليرى الطالب نسخته الأخيرة. الرد الأول يجعلها «قيد المعالجة»،
   والتعديل يُبقي حالها (تصحيح خطأٍ في ردّ مغلقة لا يعيد فتحها) — إلا إن طُلب الإغلاق. */
create or replace function public.fn_reply_voice(p_id uuid, p_reply text, p_close boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.voices;
  v_reply text := btrim(coalesce(p_reply, ''));
begin
  v := public.fn_voice_guard(p_id);
  if char_length(v_reply) < 2 or char_length(v_reply) > 1000 then
    raise exception 'الرد بين حرفين و١٠٠٠ حرف' using errcode = '23514';
  end if;
  update public.voices
  set reply = v_reply,
      replied_by = (select auth.uid()),
      replied_by_label = (select pr.full_name from public.profiles pr where pr.user_id = (select auth.uid())),
      replied_at = now(),
      reply_seen_at = null,
      status = case when p_close then 'closed' when v.reply is null then 'in_progress' else v.status end,
      closed_at = case when p_close then now() when v.reply is null then null else v.closed_at end
  where id = p_id and deleted_at is null;
  perform public.fn_write_audit(
    'voice_replied', 'voices', p_id,
    jsonb_build_object('status', v.status, 'reply', v.reply),
    jsonb_build_object('status', case when p_close then 'closed' when v.reply is null then 'in_progress' else v.status end,
                       'reply', v_reply)
  );
end;
$$;

-- الحال — والمشرف يعيد فتح المغلقة (قرار الراعي).
create or replace function public.fn_set_voice_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.voices;
begin
  if p_status is null or p_status not in ('new', 'in_progress', 'closed') then
    raise exception 'حالٌ غير معروفة' using errcode = '22023';
  end if;
  v := public.fn_voice_guard(p_id);
  if v.status = p_status then
    return;
  end if;
  update public.voices
  set status = p_status, closed_at = case when p_status = 'closed' then now() end
  where id = p_id and deleted_at is null;
  perform public.fn_write_audit('voice_status_changed', 'voices', p_id,
    jsonb_build_object('status', v.status), jsonb_build_object('status', p_status));
end;
$$;

-- أرشفة — رسالةٌ مزعجة أو مكرّرة: تخرج من الصندوق، وتبقى عند صاحبها «مغلقة».
create or replace function public.fn_archive_voice(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.fn_voice_guard(p_id);
  update public.voices
  set deleted_at = now(), status = 'closed', closed_at = coalesce(closed_at, now())
  where id = p_id and deleted_at is null;
  perform public.fn_write_audit('voice_archived', 'voices', p_id, null, null);
end;
$$;

revoke all on function public.fn_submit_voice(text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.fn_my_voices() from public, anon;
revoke all on function public.fn_my_voices_unseen() from public, anon;
revoke all on function public.fn_mark_voices_seen() from public, anon;
revoke all on function public.fn_inbox_list(text, text, uuid) from public, anon;
revoke all on function public.fn_voice_detail(uuid) from public, anon;
revoke all on function public.fn_voice_guard(uuid) from public, anon, authenticated;
revoke all on function public.fn_reply_voice(uuid, text, boolean) from public, anon;
revoke all on function public.fn_set_voice_status(uuid, text) from public, anon;
revoke all on function public.fn_archive_voice(uuid) from public, anon;
grant execute on function public.fn_submit_voice(text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.fn_my_voices() to authenticated;
grant execute on function public.fn_my_voices_unseen() to authenticated;
grant execute on function public.fn_mark_voices_seen() to authenticated;
grant execute on function public.fn_inbox_list(text, text, uuid) to authenticated;
grant execute on function public.fn_voice_detail(uuid) to authenticated;
grant execute on function public.fn_reply_voice(uuid, text, boolean) to authenticated;
grant execute on function public.fn_set_voice_status(uuid, text) to authenticated;
grant execute on function public.fn_archive_voice(uuid) to authenticated;

-- ══ «ما يحتاج انتباهك» ══ والمحو — رقّاعٌ على تعريفيهما القائمين.
create or replace function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: موضع التبديل غير فريد أو مفقود', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select pg_temp.patch('public.fn_attention_items()'::regprocedure,
$o$  where c.n > 0;$o$,
$n$  where c.n > 0

  union all
  -- «صوتك»: رسائل جديدة لم تُعالَج — بنطاق صاحب الصلاحية، وما بلا برنامج للعام وحده.
  select 'voice_new', v.program_id, p.name, (count(*))::int
  from public.voices v
  left join public.programs p on p.id = v.program_id
  where v.deleted_at is null and v.status = 'new' and (v.program_id is null or p.deleted_at is null)
    and public.fn_has_permission('voices.manage', v.program_id)
  group by v.program_id, p.name;$n$);

select pg_temp.patch('public.fn_purge_account(uuid)'::regprocedure,
$o$  update public.participants set user_id = null where user_id = p_user_id;$o$,
$n$  update public.participants set user_id = null where user_id = p_user_id;

  -- ردوده في «صوتك» تبقى، ويُطمس اسمه فيها كما في السجلّ. ورسائله هو تذهب بحذف حسابه (cascade).
  update public.voices set replied_by_label = v_label where replied_by = p_user_id;$n$);
