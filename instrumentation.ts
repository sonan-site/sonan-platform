/** يُستدعى مرة عند إقلاع الخادم. */
export async function register(): Promise<void> {
  await import("./lib/env.server");
}
