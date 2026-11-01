import { fitWithin, isVoiceImageSource, VOICE_IMAGE_MAX_BYTES, VOICE_IMAGE_SOURCE_MAX_BYTES } from "./image";

/**
 * إعادة ترميز الصورة في المتصفح قبل رفعها (adr/0054 د٣): JPEG بأطول ضلع ٢٠٠٠ —
 * فتسقط البيانات الوصفية كلها (ومنها موقع التصوير) ويصغر الحجم. حمايةٌ للطالب
 * لا ضمانٌ من الخادم: عميلٌ معدَّل يتجاوزها لصورته هو.
 *
 * يُرجع نصّ خطأٍ عربياً يُعرض كما هو، أو الصورة الجاهزة.
 */
export async function prepareVoiceImage(file: File): Promise<{ blob: Blob } | { error: string }> {
  if (!isVoiceImageSource(file.type)) return { error: "الصورة PNG أو JPEG أو WebP." };
  if (file.size > VOICE_IMAGE_SOURCE_MAX_BYTES) return { error: "الصورة أكبر من ٢٥ ميغابايت." };

  const bitmap = await decodeScaled(file);
  if (!bitmap) return { error: "تعذّرت قراءة الصورة. جرّب صورةً أخرى." };

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { error: "تعذّرت معالجة الصورة على هذا الجهاز." };
  }
  // الشفافية تسودّ في JPEG — فالخلفية بيضاء قبل الرسم.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= VOICE_IMAGE_MAX_BYTES) return { blob };
  }
  return { error: "تعذّر تصغير الصورة إلى ٥ ميغابايت." };
}

/** الأبعاد كما تُعرض (والمتصفحات الحديثة تطبّق اتجاه الكاميرا على <img>) — قبل فكّ الصورة كاملة. */
function displaySize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * يفكّ الصورة **مصغَّرةً** — صورة ٤٨ ميغابكسل مفكوكةً كاملة ≈ ١٩٠ ميغابايت تُسقط صفحة الجوال.
 * وبدرجات: الاتجاه والتصغير، ثم الاتجاه وحده، ثم بلا خيارات — محرّكٌ لا يعرف خياراً قد يرمي.
 * والاتجاه من بيانات الكاميرا يُطبَّق قبل الرسم، وإلا دارت صورة الجوال.
 */
async function decodeScaled(file: File): Promise<ImageBitmap | null> {
  const size = await displaySize(file);
  const target = size ? fitWithin(size.width, size.height) : null;
  const attempts: (ImageBitmapOptions | undefined)[] = [
    ...(target
      ? [{ imageOrientation: "from-image" as const, resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" as const }]
      : []),
    { imageOrientation: "from-image" },
    undefined,
  ];
  for (const options of attempts) {
    try {
      return await createImageBitmap(file, options);
    } catch {
      // الدرجة التالية.
    }
  }
  return null;
}
