-- 001 | الامتدادات والمشغّلات المشتركة
-- تُنفَّذ قبل أي جدول. لا جدول يُنشأ قبل وجود مشغّل updated_at.
-- تراجع: نعم (إسقاط الدوال).

create extension if not exists pgcrypto with schema extensions;

-- مشغّل updated_at المشترك.
-- platform.md 2.2: يُحدَّث بمشغّل لا من التطبيق.
-- security invoker + مسار بحث مثبَّت: لا امتياز زائد لدالة لا تحتاجه.
create or replace function public.fn_set_updated_at()
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

comment on function public.fn_set_updated_at() is
  'يضبط updated_at عند كل تحديث. يُركَّب على كل جدول بلا استثناء.';
