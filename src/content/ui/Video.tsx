import { useEffect, useRef, useState } from 'preact/hooks';
import { liveVideo } from '../driver';
import { I } from './common';

/**
 * Plays a Threads video inside the sheet. Threads streams video through MediaSource (blob: URL
 * that can't be reused), so we mirror the page's own <video> with captureStream() and drive that
 * element (play, pause, seek). Sound comes from that source element (the mirror stays muted, so
 * audio never doubles); it starts muted — it's a work sheet after all — and is re-muted on close.
 */

type Status = 'loading' | 'ready' | 'missing';

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function VideoMirror({ vkey, code, poster, compact }: { vkey: string; code: string; poster?: string; compact?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [time, setTime] = useState({ cur: 0, dur: 0, paused: true });
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setSrc(null);
    liveVideo(vkey, code).then((el) => {
      if (!alive) return;
      if (!el || !ref.current) return setStatus('missing');
      try {
        ref.current.srcObject = (el as any).captureStream() as MediaStream;
      } catch {
        return setStatus('missing');
      }
      ref.current.play().catch(() => {});
      el.play().catch(() => {});
      setSrc(el);
      setStatus('ready');
    });
    return () => {
      alive = false;
      if (ref.current) ref.current.srcObject = null;
    };
  }, [vkey]);

  // Give the page's player its sound back to "muted" whenever we stop showing it.
  useEffect(() => {
    if (!src) return;
    return () => {
      src.muted = true;
    };
  }, [src]);

  useEffect(() => {
    if (!src) return;
    const tick = () => setTime({ cur: src.currentTime, dur: src.duration || 0, paused: src.paused });
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [src]);

  useEffect(() => {
    if (src) src.muted = muted;
  }, [muted, src]);

  const stop = (e: Event) => e.stopPropagation();
  const toggle = (e: Event) => {
    stop(e);
    if (!src) return;
    if (src.paused) src.play().catch(() => {});
    else src.pause();
  };

  return (
    <div class={`vm ${compact ? 'compact' : ''}`} onClick={stop} onMouseDown={stop}>
      <video ref={ref} poster={poster} muted playsInline onClick={toggle} />
      {status !== 'ready' && (
        <div class="vm-status">{status === 'loading' ? 'Loading video…' : 'Video not available here, open the thread to play it'}</div>
      )}
      {status === 'ready' && (
        <div class="vm-bar">
          <button class="vm-btn" title={time.paused ? 'Play' : 'Pause'} onClick={toggle}>
            <I n={time.paused ? 'playArrow' : 'pause'} />
          </button>
          <input
            class="vm-seek"
            type="range"
            min={0}
            max={time.dur || 0}
            step={0.1}
            value={time.cur}
            onInput={(e) => {
              if (src) src.currentTime = Number((e.target as HTMLInputElement).value);
            }}
          />
          <span class="vm-time">{fmt(time.cur)} / {fmt(time.dur)}</span>
          <button class="vm-btn" title={muted ? 'Unmute' : 'Mute'} onClick={(e) => { stop(e); setMuted(!muted); }}>
            <I n={muted ? 'volumeOff' : 'volumeUp'} />
          </button>
        </div>
      )}
    </div>
  );
}
