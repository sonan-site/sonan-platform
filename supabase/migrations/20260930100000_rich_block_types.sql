-- 052 | أنواع عناصر الصفحة الغنية — القيم وحدها (adr/0035)
--
-- **هجرةٌ للقيم وحدها بقصد:** `alter type … add value` لا تُستعمل قيمتُه في
-- المعاملة التي أضافته. فالقيد الذي يشير إليها في الهجرة التالية، وإلا فشلت
-- الدفعة كلها.
--
-- والسبعة تغطّي أقسام صفحة مسابقة سنن كما اعتُمدت: غلافٌ وعدّاد إغلاق، وأرقام،
-- ومراحلُ بتواريخها، وجوائزُ المراكز، وشروطُ الالتحاق، ودعوةٌ ختامية.
--
-- تراجع: **لا** — قيمة التعداد لا تُحذف في PostgreSQL. والتراجع بإهمالها: نوعٌ
-- لا تعرضه الشاشة ولا يُنشئه أحد. وهذا يُقال صراحةً لأنه الاستثناء.

alter type public.block_type add value if not exists 'hero';
alter type public.block_type add value if not exists 'countdown';
alter type public.block_type add value if not exists 'stats';
alter type public.block_type add value if not exists 'timeline';
alter type public.block_type add value if not exists 'prizes';
alter type public.block_type add value if not exists 'terms';
alter type public.block_type add value if not exists 'cta';
