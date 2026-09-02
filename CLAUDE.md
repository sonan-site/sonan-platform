# دستور منصة مسابقة سنن

اقرأ هذا الملف قبل لمس أي شيء. لست مخوَّلاً بتحسين الترتيب — أنت مخوَّل بالعمل داخله.

## ١. السلطة والمرجعية

| الطبقة | الملف | حكمها |
|---|---|---|
| المعايير التقنية | `C:\dev\standards\platform.md` · `completeness-contract.md` · `seed-blueprint.md` | **مُلزِمة**. لا تُنسخ هنا. مخالفة أي بند = عيب بناء يرفضه الفحص، إلا بقرار مسجَّل في `docs/adr/` بمبرره وبديله المرفوض |
| لغة المجال | `CONTEXT.md` | المرجع الوحيد للمصطلحات. لا تستخدم مصطلحاً قبل قراءته |
| القرارات | `docs/adr/` | المُلزِم. ADR محسوم **لا يُعدَّل** — الإبطال بـ ADR جديد يشير إليه |
| المواصفة | `docs/ENTITIES.md` | الجداول والحقول والعلاقات. **لا كود قبل اعتمادها** |
| الحالة | `docs/STATUS.md` | مولَّد لا مكتوب. «ماذا بقي؟» يُجاب منه أو بمسح حيّ |

**المصدر مقابل المرجع:** `docs/discussions/` و`docs/requirements/` **مصدر تاريخي** — يُقرأ ولا يُبنى عليه. عند تعارضه مع `CONTEXT.md` أو `docs/adr/`، المرجع يفوز، ونبّه الراعي بالتعارض.

## ٢. بوّابة الإقلاع

**لا يُكتب سطر كود قبل استيفاء `platform.md §١٥` كاملة.** وأولها `docs/ENTITIES.md` معتمدة من الراعي، وهي بدورها محجوبة حتى تُحسم بنود `docs/open-questions.md`.

عند أي التباس: **احسمه مع الراعي قبل البناء لا أثناءه** (`completeness-contract §١`). الغموض المؤجَّل افتراضٌ صامت مؤجَّل.

## ٣. أين يذهب كل شيء

| النوع | المكان |
|---|---|
| تعريف مصطلح | `CONTEXT.md` — ملف واحد فقط |
| قرار محسوم | `docs/adr/` |
| سؤال معلَّق | `docs/open-questions.md` — ملف واحد فقط |
| دَين تقني | `docs/TECH-DEBT.md` |
| ملخّص نقاش | `docs/discussions/` |
| وثيقة سلَّمت لطرف | `docs/requirements/` |
| محاكاة بصرية | `docs/prototypes/` |
| كود | شجرة `platform.md §٣` حرفياً |

## ٤. التسمية

```
docs/adr/            NNNN-وصف-مختصر.md      ← الرقم التالي = أكبر رقم موجود + 1
docs/discussions/    YYYY-MM-DD-الموضوع.md
docs/requirements/   vNN-اسم-الوثيقة.html
db/migrations/       NNN_وصف.sql
```

رقم مُستهلَك **لا يُعاد استخدامه أبداً**، ولو حُذف ملفه.

## ٥. محظور

- إعادة ترتيب المجلدات أو إنشاء مجلد جديد في الجذر
- إعادة تسمية ملف موجود
- تعديل ADR محسوم
- إنشاء نسخ: `نهائي` · `v2` · `محدّث` — ملف واحد لكل شيء
- الحذف بلا إذن صريح من الراعي
- نسخ ملفات المعايير من `C:\dev\standards` إلى هنا
- **ملف لا يطابق أي فئة في §٣: اسأل، لا تخترع مجلداً**

## ٦. عند بدء أي جلسة

1. اقرأ `README.md` — أين وصلنا
2. اقرأ `docs/open-questions.md` — ما المحجوب
3. اقرأ `docs/TECH-DEBT.md` — `platform.md §١٢` يوجب مراجعته بداية كل جلسة
4. اقرأ `CONTEXT.md` قبل استخدام أي مصطلح

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
