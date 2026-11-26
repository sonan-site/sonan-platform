/** فُتحت المنصة من أيقونتها المثبّتة (`adr/0063`) — لا من المتصفح. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
