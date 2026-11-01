/**
 * مرفق «صوتك» (adr/0054 د١–د٤): صورةٌ واحدة لكل رسالة في حاويةٍ خاصة، بمسار
 * `<user_id>/<voice_id>/<uuid>.jpg` — والقاعدة تفرضه بالتعبير نفسه (`private.voice_path`).
 */

export const VOICE_BUCKET = "voices";
/** حدّ الحاوية — على **الناتج** بعد إعادة الترميز، لا على الأصل. */
export const VOICE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** حدّ الأصل: حمايةٌ لذاكرة الجوال لا قيدٌ على الطالب — صور الجوال الحديثة تتجاوز ٥ ميغابايت. */
export const VOICE_IMAGE_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
/** أطول ضلع بعد التصغير — يكفي لقراءة لقطة شاشة أو رسالة خطأ. */
export const VOICE_IMAGE_EDGE = 2000;
export const VOICE_IMAGE_SOURCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** عمر الرابط الموقّع بالثواني. */
export const VOICE_IMAGE_URL_TTL = 300;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(${UUID})/${UUID}\\.jpg$`);

export function voiceImagePath(userId: string, voiceId: string, fileId: string): string {
  return `${userId}/${voiceId}/${fileId}.jpg`.toLowerCase();
}

/** مسارٌ صالح لرسالةٍ بعينها — نسخة العميل من فحص القاعدة، للتحقق قبل النداء لا بدلاً منه. */
export function isVoiceImagePath(path: string, userId: string, voiceId: string): boolean {
  const m = PATH.exec(path);
  return m !== null && m[1] === userId.toLowerCase() && m[2] === voiceId.toLowerCase();
}

export function isVoiceImageSource(type: string): boolean {
  return (VOICE_IMAGE_SOURCE_TYPES as readonly string[]).includes(type);
}

/** أبعاد التصغير: أطول ضلعٍ لا يتجاوز الحدّ، والنسبة محفوظة، ولا تكبير. */
export function fitWithin(width: number, height: number, edge = VOICE_IMAGE_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
