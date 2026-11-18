import type { Site } from '../sites/types';

/** The site adapter for this tab, chosen once at boot from location.hostname (see index.tsx). */
let current: Site | undefined;

export function setSite(s: Site) {
  current = s;
}

export function site(): Site {
  if (!current) throw new Error('threet: no site adapter selected');
  return current;
}
