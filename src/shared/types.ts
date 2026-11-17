export interface Media {
  kind: 'image' | 'video';
  src: string;
  /** Larger rendition when the page exposes one (srcset). */
  full?: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface Counts {
  like: string;
  reply: string;
  repost: string;
  share: string;
}

export interface Post {
  /** Threads shortcode, e.g. "DfzRL8_H6bw". Unique key. */
  code: string;
  /** Permalink path, e.g. "/@dankhoia/post/DfzRL8_H6bw". */
  path: string;
  author: string;
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
