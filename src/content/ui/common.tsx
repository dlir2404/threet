import { useEffect, useState } from 'preact/hooks';
import { store, type MenuItemLike, type State } from '../store';
import { icons, type IconName } from './icons';

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((x) => x + 1)), []);
  return store.state;
}

export function I({ n, class: cls }: { n: IconName; class?: string }) {
  return <span class={cls} style="display:contents" dangerouslySetInnerHTML={{ __html: icons[n] }} />;
}

export interface MenuItem extends MenuItemLike {
  icon?: IconName;
}

export function openMenu(items: MenuItem[], anchor: Element, opts: { above?: boolean; id?: string; compact?: boolean } = {}) {
  const host = anchor.getRootNode() as ShadowRoot;
  const app = host.querySelector('.app')!.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  store.set({
    menu: {
      id: opts.id,
      items,
      x: r.left - app.left,
      y: opts.above ? undefined : r.bottom - app.top + 2,
      bottom: opts.above ? app.bottom - r.top + 4 : undefined,
      compact: opts.compact,
    },
  });
}

/** The Google Sheets mark, drawn from scratch. */
export function SheetsLogo({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 26 36" width={(size * 26) / 36} height={size} aria-hidden="true">
      <path d="M2.4 0H17l9 9v24.6A2.4 2.4 0 0 1 23.6 36H2.4A2.4 2.4 0 0 1 0 33.6V2.4A2.4 2.4 0 0 1 2.4 0z" fill="#0F9D58" />
      <path d="M17.6 9.2 26 17.4V9z" fill="#000" fill-opacity=".14" />
      <path d="M17 0l9 9h-6.6A2.4 2.4 0 0 1 17 6.6z" fill="#87CEAC" />
      <path
        d="M6 16h14v12H6zm1.6 1.6v2.6h4.6v-2.6zm6.2 0v2.6h4.6v-2.6zm-6.2 4.2v2.6h4.6v-2.6zm6.2 0v2.6h4.6v-2.6z"
        fill="#F1F1F1"
        fill-rule="evenodd"
      />
    </svg>
  );
}

export const SHEETS_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -2 36 40"><path d="M2.4 0H17l9 9v24.6A2.4 2.4 0 0 1 23.6 36H2.4A2.4 2.4 0 0 1 0 33.6V2.4A2.4 2.4 0 0 1 2.4 0z" fill="#0F9D58"/><path d="M17 0l9 9h-6.6A2.4 2.4 0 0 1 17 6.6z" fill="#87CEAC"/><path d="M6 16h14v12H6zm1.6 1.6v2.6h4.6v-2.6zm6.2 0v2.6h4.6v-2.6zm-6.2 4.2v2.6h4.6v-2.6zm6.2 0v2.6h4.6v-2.6z" fill="#F1F1F1" fill-rule="evenodd"/></svg>',
  );
