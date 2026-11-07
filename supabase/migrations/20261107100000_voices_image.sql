-- «صوتك» — المرفق: صورةٌ واحدة لكل رسالة (خطة المرفق ١ نوفمبر · adr/0054 د١–د٤).
--
-- أول تخزين ملفات في المنصة. يرفع الطالب من متصفحه مباشرة إلى حاويةٍ خاصة (د٢)، والقاعدة تحرس
-- الرفع والقراءة بسياساتٍ على `storage.objects` — ثم يُسجَّل الملف على رسالته بدالةٍ تتحقّق من وجوده
-- (والتسجيل هو الضمان، لا فحص الرفع: الرفعان المتزامنان قد يمرّان — ف١٠). الصورة عمودٌ في `voices`
-- لا صفٌّ في `attachments` (د١): ذاك يُوقف محو صاحبه ويقبل الإدراج المباشر.
--
-- **الحذف** ممنوعٌ من SQL على التخزين (`storage.protect_delete`) — فالمحو يدوّن الملفات في طابورٍ،
-- ويحذفها الخادم بواجهة التخزين (د٤).

-- ══ الحاوية ══ — خاصة · 5 ميغابايت · JPEG وحده: المتصفح يعيد الترميز قبل الرفع (د٣).
-- والنوع ترويسةٌ يعلنها العميل لا فحصٌ للمحتوى — فالعرض بوسم <img> وحده.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voices', 'voices', false, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

-- ══ الأعمدة ══
alter table public.voices
  add column image_path  text,
  add column image_bytes bigint,
  add constraint chk_voices_image check (
    (image_path is null) = (image_bytes is null)
    and (image_path is null or image_path = user_id::text || '/' || id::text || '/' || split_part(image_path, '/', 3))
    and (image_path is null or split_part(image_path, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  );
comment on column public.voices.image_path is
  'مسار الصورة في حاوية voices: <user_id>/<id>/<uuid>.jpg — يكتبه fn_attach_voice_image وحده.';
comment on column public.voices.image_bytes is 'حجم الصورة كما قاسه التخزين، لا كما أعلنه العميل.';

-- ══ مساعدات السياسات ══ — في مخططٍ غير مكشوف لواجهة REST: تُستدعى من السياسات لا بنداء RPC.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- المسار `<uid>/<voice>/<uuid>.jpg` بتعبيرٍ صارم — والمشوَّه `null` لا خطأ يُسقط الطلب.
create or replace function private.voice_path(p_name text)
returns table (user_id uuid, voice_id uuid)
language sql immutable set search_path = ''
as $$
  select m[1]::uuid, m[2]::uuid
  from regexp_match(
    p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  ) m;
$$;

-- نطاق المعالِج: غير مؤرشفة · برنامجها غير محذوف · `voices.manage` عليه. يستعمله `fn_voice_detail`
-- وقراءة الصورة معاً — فلا يفترق شرطاهما يوماً.
create or replace function private.voice_staff_scope(p_program_id uuid, p_deleted_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_deleted_at is null
     and (p_program_id is null or exists (
           select 1 from public.programs p where p.id = p_program_id and p.deleted_at is null))
     and public.fn_has_permission('voices.manage', p_program_id);
$$;

-- الرفع: حسابٌ نشط · مجلدُه · رسالتُه غير مؤرشفة وبلا صورة · عمرها دون ٣٠ دقيقة · المجلد خالٍ (تخفيفٌ لا ضمان).
create or replace function private.voice_upload_ok(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select vp.user_id = (select auth.uid())
       and public.fn_is_active()
       and exists (
         select 1 from public.voices v
         where v.id = vp.voice_id and v.user_id = vp.user_id
           and v.deleted_at is null and v.image_path is null
           and v.created_at > now() - interval '30 minutes')
       and not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'voices' and o.name like vp.user_id::text || '/' || vp.voice_id::text || '/%')
    from private.voice_path(p_name) vp
  ), false);
$$;

-- القراءة: صاحبها (ولو قبل التسجيل — التخزين يقرأ ما رفعه للتوّ) · أو المعالِج على **الصورة المسجَّلة**
-- وحدها، بنطاق `fn_voice_detail`. ولا تقرأ `storage.objects`: المسار و`voices` يكفيان.
create or replace function private.voice_image_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select vp.user_id = (select auth.uid())
        or exists (
             select 1 from public.voices v
             where v.id = vp.voice_id and v.user_id = vp.user_id and v.image_path = p_name
               and private.voice_staff_scope(v.program_id, v.deleted_at))
    from private.voice_path(p_name) vp
  ), false);
$$;

revoke all on function private.voice_path(text) from public, anon;
revoke all on function private.voice_staff_scope(uuid, timestamptz) from public, anon;
revoke all on function private.voice_upload_ok(text) from public, anon;
revoke all on function private.voice_image_readable(text) from public, anon;
grant execute on function private.voice_path(text) to authenticated;
grant execute on function private.voice_staff_scope(uuid, timestamptz) to authenticated;
grant execute on function private.voice_upload_ok(text) to authenticated;
grant execute on function private.voice_image_readable(text) to authenticated;

-- ══ السياسات ══ — رفعٌ وقراءة، والحاوية في نصّ كلٍّ منهما. لا تعديل ولا حذف: فـupsert ونقل الملف
-- يفشلان عمداً، والحذف بواجهة التخزين من الخادم وحده.
create policy voices_image_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voices' and private.voice_upload_ok(name));

create policy voices_image_read on storage.objects
  for select to authenticated
  using (bucket_id = 'voices' and private.voice_image_readable(name));

-- ══ التسجيل ══ — الضمان: مرّةً واحدة، والملف موجودٌ فعلاً، والحجم من التخزين. وإعادة المحاولة بالمسار
-- نفسه تمرّ (رفعٌ نجح وتسجيلٌ تعثّر لا يحبس الطالب).
create or replace function public.fn_attach_voice_image(p_voice_id uuid, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v      public.voices;
  v_size bigint;
begin
  -- الموقوف لا يسجّل صورةً وإن بقي رمزه صالحاً (مراجعة البناء).
  if v_uid is null or not public.fn_is_active() then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;
  select * into v from public.voices
  where id = p_voice_id and user_id = v_uid and deleted_at is null
  for update;
  if v.id is null then
    raise exception 'الرسالة غير موجودة' using errcode = 'P0002';
  end if;
  if v.image_path is not null then
    if v.image_path = p_path then
      return;
    end if;
    raise exception 'للرسالة صورةٌ مرفقة' using errcode = '23505';
  end if;
  if not exists (select 1 from private.voice_path(p_path) vp where vp.user_id = v_uid and vp.voice_id = p_voice_id) then
    raise exception 'مسار الصورة غير صالح' using errcode = '22023';
  end if;

  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'voices' and o.name = p_path;
  if v_size is null then
    raise exception 'لم تصل الصورة' using errcode = 'P0002';
  end if;

  update public.voices set image_path = p_path, image_bytes = v_size where id = p_voice_id;
end;
$$;
revoke all on function public.fn_attach_voice_image(uuid, text) from public, anon;
grant execute on function public.fn_attach_voice_image(uuid, text) to authenticated;

-- ══ القراءتان تُرجعان المسار ══ — والرابط الموقّع يولّده الخادم بهوية القارئ، فتحرسه السياسة.
drop function public.fn_my_voices();
create function public.fn_my_voices()
returns table (
  id uuid, kind text, title text, body text, status text, created_at timestamptz,
  reply text, replied_at timestamptz, reply_unseen boolean, team text, image_path text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.kind, v.title, v.body,
         case when v.deleted_at is not null then 'closed' else v.status end,
         v.created_at, v.reply, v.replied_at,
         v.reply is not null and v.reply_seen_at is null,
         'فريق ' || coalesce(p.name, 'منصة سنن'),
         v.image_path
  from public.voices v
  left join public.programs p on p.id = v.program_id
  where v.user_id = (select auth.uid())
  order by v.created_at desc
  limit 100;
$$;
comment on function public.fn_my_voices() is
  'رسائل الطالب بلا اسم الرادّ («فريق {البرنامج}»)، والمؤرشفة «مغلقة» عنده (adr/0054).';

drop function public.fn_voice_detail(uuid);
create function public.fn_voice_detail(p_id uuid)
returns table (
  id uuid, kind text, title text, body text, status text, created_at timestamptz, context jsonb,
  reply text, replied_at timestamptz, replied_by_label text, reply_seen boolean, closed_at timestamptz,
  program_id uuid, program_name text, sender_name text, sender_phone text, registration_no integer, registration_prefix text, track_name text,
  image_path text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.kind, v.title, v.body, v.status, v.created_at, v.context,
         v.reply, v.replied_at, v.replied_by_label, v.reply_seen_at is not null, v.closed_at,
         v.program_id, p.name, coalesce(pr.full_name, 'حساب محذوف'), pr.phone,
         pa.registration_no, p.registration_prefix,
         t.name,
         v.image_path
  from public.voices v
  left join public.programs p on p.id = v.program_id
  left join public.participants pa on pa.id = v.participant_id
  left join public.tracks t on t.id = pa.track_id
  left join public.profiles pr on pr.user_id = v.user_id
  where v.id = p_id and private.voice_staff_scope(v.program_id, v.deleted_at);
$$;
comment on function public.fn_voice_detail(uuid) is
  'رسالةٌ بهوية مرسِلها لمعالِجها — بنطاق private.voice_staff_scope، كقراءة صورتها (adr/0054).';

revoke all on function public.fn_my_voices() from public, anon;
revoke all on function public.fn_voice_detail(uuid) from public, anon;
grant execute on function public.fn_my_voices() to authenticated;
grant execute on function public.fn_voice_detail(uuid) to authenticated;

-- ══ طابور حذف الملفات ══ — المحو يدوّن، والخادم يحذف بواجهة التخزين ثم يشطب (د٤ · ف٢ · ف٩).
-- `deleted_at` = حُذف الملفّ فعلاً: الصفّ يبقى أثراً لما حُذف ومتى، والمنتظر ما لم يُحذف بعد.
create table public.storage_purge_queue (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null,
  path       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_storage_purge_queue unique (bucket, path)
);
comment on table public.storage_purge_queue is
  'ملفاتٌ تنتظر الحذف بواجهة التخزين بعد محو أصحابها (adr/0054). بلا وصول مباشر — دالّتان لحامل users.write.';
create index idx_storage_purge_queue_pending on public.storage_purge_queue (created_at) where deleted_at is null;
create trigger trg_storage_purge_queue_updated_at before update on public.storage_purge_queue
  for each row execute function public.fn_set_updated_at();
alter table public.storage_purge_queue enable row level security;
revoke all on public.storage_purge_queue from anon, authenticated, service_role;
grant select on public.storage_purge_queue to authenticated;
create policy storage_purge_queue_functions_only on public.storage_purge_queue
  for select to authenticated using (false);

create or replace function public.fn_storage_purge_pending()
returns table (bucket text, path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fn_has_permission('users.write') then
    raise exception 'لا تملك صلاحية محو الحسابات' using errcode = '42501';
  end if;
  return query
    select q.bucket, q.path from public.storage_purge_queue q
    where q.deleted_at is null
    order by q.created_at, q.path
    limit 1000;
end;
$$;

create or replace function public.fn_storage_purge_done(p_bucket text, p_paths text[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.fn_has_permission('users.write') then
    raise exception 'لا تملك صلاحية محو الحسابات' using errcode = '42501';
  end if;
  update public.storage_purge_queue set deleted_at = now()
  where bucket = p_bucket and path = any (p_paths) and deleted_at is null;
end;
$$;
revoke all on function public.fn_storage_purge_pending() from public, anon;
revoke all on function public.fn_storage_purge_done(text, text[]) from public, anon;
grant execute on function public.fn_storage_purge_pending() to authenticated;
grant execute on function public.fn_storage_purge_done(text, text[]) to authenticated;

-- ══ المحو يدوّن ملفاته ══ — كلَّ ما تحت مجلده، فيشمل اليتيم (رفعٌ لم يُسجَّل).
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

select pg_temp.patch('public.fn_purge_account(uuid)'::regprocedure,
$o$  update public.voices set replied_by_label = v_label where replied_by = p_user_id;$o$,
$n$  update public.voices set replied_by_label = v_label where replied_by = p_user_id;

  -- صوره في «صوتك» تُدوَّن للحذف بواجهة التخزين — SQL لا يحذف ملفاً (adr/0054 د٤).
  insert into public.storage_purge_queue (bucket, path)
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id = 'voices' and o.name like p_user_id::text || '/%'
  on conflict (bucket, path) do nothing;$n$);
