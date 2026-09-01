-- 001 | المخطط والصلاحيات والمشغّلات المشتركة
-- تُنفَّذ قبل أي جدول.
--
-- عزل المخطط (adr/0019): المشروع يستضيف تطبيقاً آخر في public.
-- كل ما نبنيه يعيش في sunan وحده، ولا نقرأ ولا نكتب خارجه إطلاقاً.
-- تراجع: نعم (drop schema sunan cascade — ولا يمسّ public).

create schema if not exists sunan;

comment on schema sunan is
  'منصة مسابقة سنن. معزولة عن public الذي يستضيف تطبيقاً آخر لا علاقة له بها.';

-- أقل امتياز: authenticated و service_role فقط.
-- anon يحصل على المرور بالمخطط لا على الجداول — لا وصول مجهول في النواة.
-- الواجهة العامة (دليل البرامج) تُمنح صلاحياتها جدولاً جدولاً حين تُبنى.
grant usage on schema sunan to anon, authenticated, service_role;
grant all on all tables in schema sunan to authenticated, service_role;
grant all on all sequences in schema sunan to authenticated, service_role;

alter default privileges in schema sunan
  grant all on tables to authenticated, service_role;
alter default privileges in schema sunan
  grant all on sequences to authenticated, service_role;

-- سجل الهجرات خاصّ بنا داخل مخططنا.
-- لا نلمس supabase_migrations: سجل مشترك مع التطبيق الآخر، وخلط التاريخين
-- يجعل تراجع أحدهما يُربك الآخر.
create table if not exists sunan.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text not null
);

comment on table sunan.schema_migrations is
  'الهجرات المطبَّقة. checksum يكشف تعديل هجرة نُفِّذت — وهو ممنوع: التصحيح بهجرة جديدة.';

alter table sunan.schema_migrations enable row level security;
-- لا سياسة: لا أحد يقرؤه عبر الواجهة. المُشغّل يتصل مباشرة بامتياز القاعدة.

create extension if not exists pgcrypto with schema extensions;

-- مشغّل updated_at المشترك.
-- platform.md 2.2: يُحدَّث بمشغّل لا من التطبيق.
-- security invoker + مسار بحث مثبَّت: لا امتياز زائد لدالة لا تحتاجه.
create or replace function sunan.fn_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function sunan.fn_set_updated_at() is
  'يضبط updated_at عند كل تحديث. يُركَّب على كل جدول بلا استثناء.';
