import type { Site } from './types';
import { reddit } from './reddit';
import { threads } from './threads';
import { voz } from './voz';

/** Every supported site. Add new adapters here (and their domains to hosts.json). */
export const SITES: Site[] = [threads, reddit, voz];

export function siteForHost(hostname: string): Site | undefined {
  return SITES.find((s) => s.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`)));
}
