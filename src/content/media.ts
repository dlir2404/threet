/**
 * Live <video> registry shared by site adapters. Sites stream video through MediaSource (blob:
 * URLs) that can't be reused, but a live element can be mirrored with captureStream()
 * (ui/Video.tsx). Adapters register each video under a media key ("<postId>:v<n>").
 */
const videoEls = new Map<string, WeakRef<HTMLVideoElement>>();

export function videoFor(vkey: string): HTMLVideoElement | null {
  const el = videoEls.get(vkey)?.deref();
  return el?.isConnected ? el : null;
}

/** Frames grabbed from playing videos, used as their poster once Threads drops the poster image. */
const frames = new WeakMap<HTMLVideoElement, string>();

export function frameOf(v: HTMLVideoElement): string | undefined {
  const done = frames.get(v);
  if (done) return done;
  if (v.readyState < 2 || !v.videoWidth) return undefined;
  try {
    const scale = Math.min(1, 480 / v.videoWidth);
    const c = v.ownerDocument.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.7);
    frames.set(v, url);
    return url;
  } catch {
    return undefined; // tainted canvas: no poster
  }
}


export function registerVideo(vkey: string, el: HTMLVideoElement) {
  videoEls.set(vkey, new WeakRef(el));
}
