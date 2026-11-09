-- الإشعارات الداخلية — الدفعة ١: إشعارات الأحداث والجرس و«تنبيهاتي» (خطة ٤ نوفمبر · adr/0055).
--
-- ما تفعله الإدارة ويخصّ المشارك يصله داخل المنصة وحدها (ف-٥): قرار طلب انتقاله، ونشر نتائج
-- مساره. **التوليد بمشغّلَين على جدولَي القرارين** — فلا تُعاد كتابة `fn_decide_track_change` ولا
-- `fn_publish_results`، ولا يُمسّ المحرك. لكن الإدراج يقع داخل معاملتَي القرارين (وأحدهما داخل قفل
-- المحرك)، فيُكتب بأدنى ما يكون ويُختبر مع القرار.
--
-- الإعلانات في الدفعة ٢ — و`fn_my_notifications` تُرجع أعمدتها من الآن (العنوان · النص · «عُدِّل»).

-- ══ الجدول القائم ══
-- مفتاح الحدث: إشعارٌ واحد للحدث الواحد لكل مستلم، وسحب النشر يحذفه حذفاً ناعماً فتُنشئه إعادته.
alter table public.notifications
  add column ref_key text,
  add column read_at timestamptz;
comment on column public.notifications.ref_key is
  'مفتاح الحدث (`track_change:<طلب>` · `results:<اعتماد المسار>`) — فريدٌ لكل مستلم بين غير المحذوف.';
comment on column public.notifications.read_at is
  'لحظة قراءته في «تنبيهاتي» — تُضبط مع الحال `read`.';
create unique index uq_notifications_ref on public.notifications (recipient_id, ref_key) where deleted_at is null;
create index idx_notifications_ref on public.notifications (ref_key) where deleted_at is null and ref_key is not null;

-- الوسم بالدالة وحدها (مراجعة الخطة م٤): لا تحديث مباشر — فلا يُكتب `read` بلا `read_at`، ولا تُمسّ
-- الحمولة. والقراءة المباشرة باقية لصاحبها بسياستها.
drop policy notifications_mark_read on public.notifications;
revoke update on public.notifications from authenticated;

-- النوعان بهجرة لا في البذرة — المشغّلان يشترطانهما على الحيّ (مراجعة الخطة: تحسين).
insert into public.notification_kinds (code, label) values
  ('track_change_decided', 'قرار طلب الانتقال'),
  ('results_published', 'نشر النتائج')
on conflict (code) do nothing;

-- ══ المشغّلان ══
/* قرار طلب الانتقال — قبولاً أو رفضاً. صارم: فشله يُفشل القرار (مراجعة الخطة م٣)، فلا يُدرج إلا ما
   يصحّ: مشاركةٌ حيّة لها صاحب — والممحوّ حسابه (`user_id` فارغ) أو المحذوفة مشاركته لا يُشعَر، ولا
   يُفشل رفضَ طلبه المعلّق (ح١). */
create or replace function public.fn_notify_track_change_decided()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, kind, payload, status, sent_at, ref_key)
  select pa.user_id, 'track_change_decided',
         jsonb_build_object('participant_id', pa.id, 'program_id', pa.program_id,
                            'decision', new.status, 'to_track_id', new.to_track_id),
         'sent', now(), 'track_change:' || new.id
  from public.participants pa
  where pa.id = new.participant_id and pa.user_id is not null and pa.deleted_at is null
  on conflict (recipient_id, ref_key) where deleted_at is null do nothing;
  return null;
end;
$$;

create trigger trg_track_change_requests_notify
  after update of status on public.track_change_requests
  for each row when (old.status = 'pending' and new.status <> 'pending')
  execute function public.fn_notify_track_change_decided();

/* نشر نتائج المسار وسحبه. **بلا نتيجةٍ ولا نسبةٍ ولا مركز في الحمولة** (م٢) — يراها صاحبها في
   «رحلتي» من مصدرها، فلا تبقى نسخةٌ منها بعد سحب النشر. والإدراج وحده يُلفّ: الإشعار ثانويٌّ والنشر
   أساسي، فخللٌ فيه يُنذَر به ولا يوقف النشر (م٣) — والاختبار يمسكه. */
create or replace function public.fn_notify_results_published()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published_at is not null and old.published_at is null then
    begin
      insert into public.notifications (recipient_id, kind, payload, status, sent_at, ref_key)
      select pa.user_id, 'results_published',
             jsonb_build_object('participant_id', pa.id, 'program_id', pa.program_id,
                                'exam_id', new.exam_id, 'track_id', new.track_id),
             'sent', now(), 'results:' || new.id
      from public.exam_results r
      join public.participants pa on pa.id = r.participant_id
      where r.track_result_id = new.id and r.deleted_at is null
        and pa.user_id is not null and pa.deleted_at is null
      on conflict (recipient_id, ref_key) where deleted_at is null do nothing;
    exception when others then
      raise warning 'إشعارات نشر النتائج لم تُكتب (%): %', new.id, sqlerrm;
    end;
  elsif new.published_at is null and old.published_at is not null then
    -- سحب النشر: يغيب الإشعار، وإعادة النشر تُنشئه من جديد.
    update public.notifications set deleted_at = now()
    where ref_key = 'results:' || new.id and deleted_at is null;
  end if;
  return null;
end;
$$;

create trigger trg_exam_track_results_notify
  after update of published_at on public.exam_track_results
  for each row when (old.published_at is distinct from new.published_at)
  execute function public.fn_notify_results_published();

revoke all on function public.fn_notify_track_change_decided() from public, anon, authenticated;
revoke all on function public.fn_notify_results_published() from public, anon, authenticated;

-- ══ للطالب ══
/* «تنبيهاتي»: الأحدث أولاً. الأعمدة تتّسع للإعلانات (الدفعة ٢): `source` يفرّق، والعنوان والنص
   و`edited_at` لها — وإشعار الحدث يُصاغ نصّه في الواجهة من نوعه وقراره واسم مساره. والأسماء تُحلّ
   عند القراءة (م٢)، فيبقى اسم المسار المؤرشف. */
create or replace function public.fn_my_notifications(p_limit integer default 50)
returns table (
  id uuid, source text, kind text, participant_id uuid, program_name text, track_name text,
  decision text, title text, body text, created_at timestamptz, edited_at timestamptz, unread boolean
)
language sql stable security definer set search_path = ''
as $$
  select n.id, 'event', n.kind,
         -- المشاركة المحذوفة (انسحب بعد النشر مثلاً) يبقى إشعارها بلا رابطٍ إلى رحلةٍ غابت (مراجعة البناء م٢).
         case when pa.deleted_at is null and pa.user_id = (select auth.uid()) then pa.id end,
         p.name,
         t.name,
         n.payload ->> 'decision',
         null::text, null::text,
         n.created_at, null::timestamptz,
         n.status <> 'read'
  from public.notifications n
  left join public.participants pa on pa.id = nullif(n.payload ->> 'participant_id', '')::uuid
  left join public.programs p on p.id = nullif(n.payload ->> 'program_id', '')::uuid
  left join public.tracks t on t.id = nullif(coalesce(n.payload ->> 'to_track_id', n.payload ->> 'track_id'), '')::uuid
  where n.recipient_id = (select auth.uid()) and n.deleted_at is null
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- نقطة الجرس: أمِن غير مقروء؟
create or replace function public.fn_my_notifications_unseen()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.notifications
    where recipient_id = (select auth.uid()) and deleted_at is null and status <> 'read'
  );
$$;

/* يَسِم ما عُرض: حتى `p_until` (أحدث ما في الصفحة، بدقّة القاعدة) — فلا يُوسَم ما وصل بعد الرسم
   ولا يَسِم الجلبُ المسبق شيئاً (م٥). تُنادى من العميل بعد الرسم. و`read_at` لحظة الوسم نفسها، لا
   الحدّ (مراجعة البناء م٣). وحدُّه طابعٌ لا معرّفات: حدثٌ بدأت معاملته قبل أحدث المعروض وأُودع بعد
   الرسم يُوسَم ولم يُرَ — يقتضي قرارين متداخلين للطالب نفسه في أجزاء ثانية، فيُقبل. */
create or replace function public.fn_mark_notifications_seen(p_until timestamptz)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_until timestamptz := least(p_until, now());
  v_n     int;
begin
  if p_until is null then
    return 0;
  end if;
  update public.notifications set status = 'read', read_at = now()
  where recipient_id = (select auth.uid()) and deleted_at is null and status <> 'read'
    and created_at <= v_until;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.fn_my_notifications(integer) from public, anon;
revoke all on function public.fn_my_notifications_unseen() from public, anon;
revoke all on function public.fn_mark_notifications_seen(timestamptz) from public, anon;
grant execute on function public.fn_my_notifications(integer) to authenticated;
grant execute on function public.fn_my_notifications_unseen() to authenticated;
grant execute on function public.fn_mark_notifications_seen(timestamptz) to authenticated;
