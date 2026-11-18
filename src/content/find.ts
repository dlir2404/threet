import type { Post } from '../shared/types';

/**
 * Find bar matching: case-insensitive, every word must appear (in the text, title or author name).
 * A word typed without accents matches any accents ("sua" finds "sữa" and "sửa"); a word typed
 * with accents matches exactly ("sữa" does not find "sửa"). `user` (the "Người đăng" box) must
 * appear in the author name.
 */

export interface FindQuery {
  keywords: string;
  user?: string;
}

/** Lowercase, no diacritics, đ → d. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export interface Matcher {
  /** Which parts of a post matched, or null when it doesn't. */
  match(p: Post): { text: boolean; author: boolean } | null;
}

export function matcher(q: FindQuery): Matcher | null {
  const lower = (x: string) => x.normalize('NFC').toLowerCase();
  const words = lower(q.keywords.trim()).split(/\s+/).filter(Boolean).map((w) => ({ w, plain: fold(w) === w }));
  const user = fold(q.user?.trim() ?? '');
  if (!words.length && !user) return null;
  return {
    match(p) {
      const name = lower(p.author);
      if (user && !fold(name).includes(user)) return null;
      const raw = lower(`${p.title ?? ''}\n${p.text}`);
      const has = (hay: string, { w, plain }: { w: string; plain: boolean }) => (plain ? fold(hay) : hay).includes(w);
      let text = false;
      let author = !!user;
      for (const word of words) {
        if (has(raw, word)) text = true;
        else if (has(name, word)) author = true;
        else return null;
      }
      return { text, author };
    },
  };
}
