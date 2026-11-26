-- إشعارات الجهاز — المرحلة الأولى (adr/0064 · الخطة `docs/reviews/2026-11-26-خطة-إشعارات-الجهاز.md`).
-- ما يصل إلى الجرس يصل إلى أجهزة صاحبه التي فعّلها. القاعدة تحفظ الاشتراكات وتحجز ما يُرسَل وتنبّه
-- المُرسِل؛ والإرسال نفسه في المنصة (`app/api/push/dispatch`).

-- ══ ١ · عنوان الجهاز ══
/* خدمات الإشعار المعروفة وحدها (المراجعة م٢): المُرسِل يطلب العنوان من خادمه، فعنوانٌ يكتبه المستخدم
   بلا حدّ يجعل خادمنا يطلب أي مكان. والمضيف ينتهي بـ`/` مباشرة، فلا يمرّ `fcm.googleapis.com@غيره`. */
create function public.fn_push_endpoint_allowed(p_endpoint text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_endpoint is not null
     and length(p_endpoint) <= 1024
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/[A-Za-z0-9._~:/?=&%+,!*-]+$';
$$;

revoke all on function public.fn_push_endpoint_allowed(text) from public, anon;

-- ══ ٢ · الاشتراكات ══
/* اشتراك جهازٍ لحساب. **الجهاز الواحد قد يحمل أكثر من حساب** (قرار الراعي ٢٦ نوفمبر: وليّ أمرٍ يدخل
   بحسابات أبنائه على جوالٍ واحد — يصله إشعار كل من فعّل عليه)، فالمفتاح العنوان مع الحساب. */
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null check (public.fn_push_endpoint_allowed(endpoint)),
  p256dh          text not null check (length(p256dh) between 40 and 200),
  auth            text not null check (length(auth) between 10 and 100),
  -- نوع الجهاز وحده لا وصف متصفحه (المراجعة م١١).
  device          text not null check (device in ('ios', 'android', 'desktop', 'other')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- عمود النواة — والحذف هنا صلبٌ عمداً (الإيقاف والخروج وموت الاشتراك): عنوانٌ لا يُرسَل إليه لا يُبقى.
  deleted_at      timestamptz,
  last_success_at timestamptz,
  -- أول إخفاقٍ عابرٍ متصل منذ آخر نجاح — يُحذف الاشتراك بعد سبعة أيام منه لا بعدد الإخفاقات (م١).
  failing_since   timestamptz,
  unique (endpoint, user_id)
);

comment on table public.push_subscriptions is
  'أجهزةٌ فعّل أصحابها إشعارات المنصة عليها (adr/0064). يُكتب بدوال fn_push_* وحدها، ويقرؤه المُرسِل بمفتاح الخادم.';

create index idx_push_subscriptions_user on public.push_subscriptions (user_id);
create trigger trg_push_subscriptions_updated_at before update on public.push_subscriptions
  for each row execute function public.fn_set_updated_at();

alter table public.push_subscriptions enable row level security;

-- صاحبه يرى أجهزته وحده. ولا كتابة من العميل: الدوال وحدها تكتب (المراجعة ت٤).
create policy push_subscriptions_read_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- ══ ٣ · ما أُرسل من الإشعارات ══
alter table public.notifications add column pushed_at timestamptz;

comment on column public.notifications.pushed_at is
  'متى حُجز للإرسال إلى الأجهزة (adr/0064) — فارغٌ = لم يُرسَل بعد. القديم عند التشغيل معبّأ فلا يُرسَل.';

-- ما سبق الميزة لا يُرسَل: لا سيلٌ من القديم عند التشغيل.
update public.notifications set pushed_at = created_at where pushed_at is null;

create index idx_notifications_push_pending
  on public.notifications (created_at) where pushed_at is null and deleted_at is null;

-- ══ ٤ · دوال صاحب الجهاز ══
/* تفعيل هذا الجهاز للداخل. الحساب من الجلسة لا من معامل. وإعادة التفعيل تحدّث مفاتيحه. وسقفان
   (م٢): عشرة أجهزة للحساب، وعشرة حسابات للجهاز — يُحذف الأقدم. */
create function public.fn_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.fn_is_active() then
    raise exception 'غير مصرَّح' using errcode = '42501';
  end if;
  if not public.fn_push_endpoint_allowed(p_endpoint) then
    raise exception 'عنوان الجهاز غير مقبول' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (v_uid, p_endpoint, p_p256dh, p_auth, coalesce(p_device, 'other'))
  on conflict (endpoint, user_id) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, failing_since = null;

  delete from public.push_subscriptions s
  where s.id in (
    select id from public.push_subscriptions where user_id = v_uid
    order by created_at desc offset 10
  );
  delete from public.push_subscriptions s
  where s.id in (
    select id from public.push_subscriptions where endpoint = p_endpoint
    order by created_at desc offset 10
  );
end;
$$;

/* إيقافه على هذا الجهاز للداخل وحده — وما بقي عليه من حساباتٍ أخرى يُعاد، فيُلغي المتصفح اشتراكه
   إن لم يبقَ أحد. */
create function public.fn_push_unsubscribe(p_endpoint text)
returns integer
language sql volatile security definer set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions
    where endpoint = p_endpoint and user_id = (select auth.uid())
  )
  select count(*)::integer from public.push_subscriptions
  where endpoint = p_endpoint and user_id <> (select auth.uid());
$$;

/* أجهزة الداخل كلها — إغلاق الحساب، أو كلمةٌ مؤقتة عُيّنت بدلها كلمته (يبقى الجهاز الذي عيّنها منه). */
create function public.fn_push_unsubscribe_all(p_keep_endpoint text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where user_id = (select auth.uid())
    and endpoint is distinct from p_keep_endpoint;
$$;

-- أمفعّلٌ هذا الجهاز للداخل؟ — حال الواجهة من الخادم لا من المتصفح (م٣).
create function public.fn_push_is_mine(p_endpoint text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.push_subscriptions
    where endpoint = p_endpoint and user_id = (select auth.uid())
  );
$$;

revoke all on function public.fn_push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.fn_push_unsubscribe(text) from public, anon;
revoke all on function public.fn_push_unsubscribe_all(text) from public, anon;
revoke all on function public.fn_push_is_mine(text) from public, anon;
grant execute on function public.fn_push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.fn_push_unsubscribe(text) to authenticated;
grant execute on function public.fn_push_unsubscribe_all(text) to authenticated;
grant execute on function public.fn_push_is_mine(text) to authenticated;

-- ══ ٥ · للمُرسِل وحده ══
/* يحجز ما لم يُرسَل (حتى `p_limit`) ويُعيد منه ما يستحق الإرسال. الحجز بـ`skip locked` والشرط مكرّرٌ في
   التحديث نفسه، فطلبان متزامنان لا يحجزان الإشعار مرتين (م٥). ويُعاد كل ما حُجز — فالفارغ يعني أن
   الطابور فرغ — و`deliver` لما **صاحبه نشطٌ وله جهاز وعمره دون يوم**: فالموقوف والمغلق لا يُرسَل إليه
   (ت٥)، والقديم لا يُعرض.
   والحقول هي حقول «تنبيهاتي» نفسها (`fn_my_notifications`) لنصٍّ واحدٍ في الموضعين — واختبار تكافؤ. */
create function public.fn_push_claim(p_limit integer default 50)
returns table (
  id uuid, recipient_id uuid, kind text, track_name text, decision text, body text, created_at timestamptz,
  deliver boolean
)
language sql volatile security definer set search_path = ''
as $$
  -- الاختيار مُجسَّدٌ مرةً واحدة: لو كان استعلاماً فرعياً في `in` لأعاد المخطِّط تنفيذه، فتجاوز الحدّ.
  with picked as materialized (
    select q.id from public.notifications q
    where q.pushed_at is null and q.deleted_at is null
    order by q.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ),
  claimed as (
    update public.notifications n
    set pushed_at = now()
    from picked
    where n.id = picked.id
      and n.pushed_at is null
      and n.deleted_at is null
    returning n.id, n.recipient_id, n.kind, n.payload, n.created_at
  )
  select c.id, c.recipient_id, c.kind,
         t.name,
         c.payload ->> 'decision',
         case when c.kind = 'profile_corrected'
              then (select string_agg(f, ',') from jsonb_array_elements_text(c.payload -> 'names') f) end,
         c.created_at,
         c.created_at > now() - interval '1 day'
           and exists (select 1 from public.profiles p where p.user_id = c.recipient_id and p.deleted_at is null)
           and exists (select 1 from public.push_subscriptions s where s.user_id = c.recipient_id)
  from claimed c
  -- تحويلٌ آمن: حمولةٌ بمعرّفٍ تالف لا تُفشل الحجز فتقف الطابور كله خلفها (مراجعة البناء ت٥).
  left join public.tracks t on t.id = case
    when coalesce(c.payload ->> 'to_track_id', c.payload ->> 'track_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(c.payload ->> 'to_track_id', c.payload ->> 'track_id')::uuid end
  order by c.created_at;
$$;

revoke all on function public.fn_push_claim(integer) from public, anon, authenticated;
grant execute on function public.fn_push_claim(integer) to service_role;

-- ══ ٦ · التنبيه الفوري ══
/* يطلب المُرسِل عبر `pg_net` — **لا يُفشل شيئاً أبداً**: لا امتداد، أو لا عنوان أو سرّ في Vault (نسخةٌ
   محلية، أو الحيّ قبل إعداده)، أو أي خطأ: يمرّ صامتاً بتحذير، ويبقى الإشعار في الجرس وفي الطابور
   للكنسة. والطلب يُدرج في طابور `pg_net` فلا يخرج إلا بعد إيداع المعاملة (قرار الراعي ٢٦ نوفمبر). */
create function public.fn_push_kick()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then
    return;
  end if;
  execute $q$select net.http_post(url := $1, body := '{}'::jsonb,
                                  headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', $2),
                                  timeout_milliseconds := 60000)$q$
    using v_url, v_secret;
exception when others then
  raise warning 'تنبيه مُرسِل الإشعارات لم يُطلب: %', sqlerrm;
end;
$$;

revoke all on function public.fn_push_kick() from public, anon, authenticated;
grant execute on function public.fn_push_kick() to service_role;

/* مشغّلٌ للجملة لا للسطر: نشر نتائج مسارٍ يُدرج مئات الإشعارات في جملةٍ واحدة، فتنبيهٌ واحد. ولا ينبّه
   إلا إن كان فيها ما لم يُرسَل — فحجز المُرسِل نفسه (تحديث `pushed_at`) لا يعيد تنبيهه. */
create function public.fn_notifications_push_kick()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from fresh where pushed_at is null and deleted_at is null) then
    perform public.fn_push_kick();
  end if;
  return null;
end;
$$;

revoke all on function public.fn_notifications_push_kick() from public, anon, authenticated;

create trigger trg_notifications_push_insert
  after insert on public.notifications
  referencing new table as fresh
  for each statement execute function public.fn_notifications_push_kick();

create trigger trg_notifications_push_update
  after update on public.notifications
  referencing new table as fresh
  for each statement execute function public.fn_notifications_push_kick();

-- ══ ٧ · تعديل البيانات المتلاحق يصل الجهاز كما يعود إلى الجرس (م٦) ══
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

select pg_temp.patch('public.fn_audit_field_change(text, text, uuid, uuid, jsonb, jsonb, text[], jsonb)'::regprocedure,
$o$      do update set payload = excluded.payload, status = 'sent', read_at = null;$o$,
$n$      do update set payload = excluded.payload, status = 'sent', read_at = null, pushed_at = null;$n$);

-- ══ ٨ · الكنسة ══
/* كل ساعة: ما فات التنبيهَ الفوري (المُرسِل معطّل، أو الطلب ضاع) يُطلب له مرة. */
create function public.fn_push_sweep()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notifications
    where pushed_at is null and deleted_at is null and created_at > now() - interval '1 day'
  ) then
    perform public.fn_push_kick();
  end if;
end;
$$;

revoke all on function public.fn_push_sweep() from public, anon, authenticated;

-- الامتدادان حيث يتاحان (الحيّ وCI). وحيث لا يتاحان تبقى الدوال وتُختبر وحدها، والتنبيه يمرّ صامتاً.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('push-sweep', '23 * * * *', 'select public.fn_push_sweep()');
  end if;
end;
$$;
