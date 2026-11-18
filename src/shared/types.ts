export interface Media {
  kind: 'image' | 'video';
  src: string;
  /** Larger rendition when the page exposes one (srcset). */
  full?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Videos: directly playable URL (an mp4 the site exposes), when there is one. */
  play?: string;
  /** Videos: key of the live <video> on the page (see videoFor() in parser), e.g. "DfzRL8_H6bw:v0". */
  vkey?: string;
}

/** Engagement numbers as the site shows them ("14K", "2,3K"), keyed by metric (like, reply…). */
export type Counts = Record<string, string>;

export interface Post {
  /** Threads shortcode, e.g. "DfzRL8_H6bw". Unique key. */
  code: string;
  /** Permalink path, e.g. "/@dankhoia/post/DfzRL8_H6bw". */
  path: string;
  author: string;
  /** Post number as the site shows it ("#5" on forums); used as the row's No. */
  ordinal?: string;
  /** Headline, for sites whose posts have one (Reddit, forum threads). */
  title?: string;
  avatar?: string;
  topic?: string;
  /** ISO timestamp from <time datetime>. */
  time?: string;
  /** Relative label shown by Threads, e.g. "14 giờ". */
  timeLabel?: string;
  text: string;
  media: Media[];
  /** Position in a multi-part post by the same author, e.g. "1/2". */
  part?: string;
  counts: Counts;
  quoted?: Post;
  /** Link preview card under the text. */
  link?: { url: string; title: string; domain: string };
  /** Small context label above/inside the post ("Cuộc trò chuyện đầu tiên", "Tác giả gốc đã thích"). */
  badges: string[];
}

/** A unit in a list: a post plus the replies Threads chose to show right under it. */
export interface PostGroup {
  posts: Post[];
}

export type PageKind = 'feed' | 'thread' | 'profile' | 'other';

export interface ThreadRow {
  post: Post;
  /** 0 = focal post or its ancestors, 1 = direct reply, 2+ = nested. */
  depth: number;
  /** True for ancestors shown above the focal post. */
  ancestor?: boolean;
  focal?: boolean;
}
