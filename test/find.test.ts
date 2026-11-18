import { describe, expect, it } from 'vitest';
import { fold, matcher } from '../src/content/find';
import type { Post } from '../src/shared/types';

const post = (author: string, text: string, title?: string): Post => ({ code: 'x', path: '/x', author, text, title, media: [], badges: [], counts: {} });
const m = (keywords: string, user?: string) => matcher({ keywords, user });

describe('find', () => {
  it('ignores case and Vietnamese accents', () => {
    expect(fold('Sữa Đậu Nành')).toBe('sua dau nanh');
    expect(m('sua dau')!.match(post('a', 'Sữa đậu nành'))).toEqual({ text: true, author: false });
    expect(m('sua bo')!.match(post('a', 'Sữa đậu nành'))).toBeNull();
    expect(m('sua')!.match(post('a', 'sửa xe'))).not.toBeNull();
    expect(m('sữa')!.match(post('a', 'sửa xe'))).toBeNull();
    expect(m('SỮA')!.match(post('a', 'mua sữa'))).not.toBeNull();
  });

  it('matches by author box, and words also match the author name', () => {
    expect(m('', 'be')!.match(post('BE READY', 'hi'))).toEqual({ text: false, author: true });
    expect(m('sữa', 'be ready')!.match(post('BE READY', 'mua sữa'))).toEqual({ text: true, author: true });
    expect(m('sữa', 'be')!.match(post('an', 'mua sữa'))).toBeNull();
    expect(m('zuck')!.match(post('zuck', 'hello'))).toEqual({ text: false, author: true });
    expect(m('  ', ' ')).toBeNull();
  });
});
