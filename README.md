<div align="center">

# threet

**Read Threads in a Google Sheets disguise: your feed, threads, and replies as rows in a spreadsheet, right on threads.com.**

![status: alpha](https://img.shields.io/badge/status-alpha-orange)
![browser: Chrome](https://img.shields.io/badge/browser-Chrome%20(MV3)-lightgrey)
![runs on: threads.com](https://img.shields.io/badge/runs%20on-threads.com-black)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/dlir2404)

[About](#about) · [Install](#install) · [Quick start](#quick-start) · [Features](#features) · [Keys](#keys) · [How it works](#how-it-works) · [Privacy](#privacy-and-safety) · [Development](#development)

</div>

```text
┌ ▦ Q4 Planning - Tracker  ☆ ⇥ ☁                                  H N T +4   ⟲  ▤  ▭▾  [🔒 Share ▾]  D ┐
│   File  Edit  View  Insert  Format  Data  Tools  Extensions  Help                                     │
│ ( ⌕ ↶ ↷ ⎙ ⌁ 100%▾ │ $ % .0 .00 123▾ │ Arial ▾ │ − 10 + │ B I S A │ ◧ ▦ ⊞ │ ≡ ⊥ ↵ ⟳ │ ⛓ ⊕ ▥ ⊽ Σ )  │
│ E3  ▾ │ fx  Every Monday I write down the three things that would make the week a win…               │
├───┬─────┬──────────────┬──────────────┬──────────────┬─────────────────────────────┬───────┬────────┤
│   │  A  │      B       │      C       │      D       │              E              │   F   │   G    │
│ 1 │ No  │   Reporter   │   Updated    │   Function   │         Description         │ Votes │Comments│
│ 2 │   1 │ maya.codes   │ 16/11 18:39  │ (Design ▾)   │ Shipped the new onboarding… │   14K │    262 │
│ 3 │   2 │ ben_writes   │ 16/11 23:45  │              │ [1/2] Every Monday I write… │  1,2K │      9 │
│ 4 │   3 │ ana.k        │ 15/11 15:36  │ (Jobs ▾)     │ Interviewers who skip th… ❝↓│  1,3K │     34 │
│ 5 │ 3.q │ leo_dev      │ 14/11 16:21  │ (Jobs ▾)     │ ❝ Why did you leave your…   │  1,5K │     17 │
│ 6 │ 3.1 │ sam.hr       │ 16/11 17:43  │              │ ↳ Same here, I never ask… ◥ │     2 │        │
├───┴─────┴──────────────┴──────────────┴──────────────┴─────────────────────────────┴───────┴────────┤
│  +  ≡   [ Overview ▾ ]   @ben_writes ▾                                                Count: 7  ‹ ›  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
  Enter open thread · Backspace back · Space read cell · Esc boss key · ⌥T show Threads · F1 guide
```

## About

threet is a Chrome extension for reading Threads without looking like you are reading Threads. On threads.com it covers the page with a working copy of the Google Sheets interface (title bar, menus, toolbar, formula bar, grid, sheet tabs), and fills the grid with what the real Threads page underneath is showing: one post per row, replies and quoted posts on their own rows, threads and sub-threads as extra sheet tabs.

It is inspired by [Stealth Reader](https://thedeceiver.site), which does the same for novels. The name is *threads* + *sheet*. The Sheets look is the first skin; others (Docs, Excel, an editor) may follow.

There is no API key or threet backend: posts are parsed and displayed locally in your browser, using your existing Threads session. Loading threads and previewing media still makes requests to Threads and its media hosts.

## Install

threet is not on the Chrome Web Store yet. Build it and load it unpacked:

```sh
git clone https://github.com/dlir2404/threet.git
cd threet
npm install
npm run build          # → dist/
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → choose the `dist/` folder.
3. Open [threads.com](https://www.threads.com) and log in as usual.

**Requirements:** Chrome (or another Chromium browser with Manifest V3). For the current build and test toolchain, use Node.js 24.15.0 or later within the 24.x series. Node.js 22.22.2 or later within 22.x, and Node.js 26+, are also supported by the installed Vitest and jsdom versions.

## Quick start

Open threads.com. The sheet appears immediately (the real page never flashes) and a short guide opens the first time. Then:

- Move with the arrow keys; the formula bar shows the full text of the selected cell. Press **Space** to read a long post inside its cell.
- Press **Enter** on a post to open its thread as a new sheet tab; **Enter** on a reply opens that sub-thread. **Backspace** closes the tab and goes back.
- Scroll to the bottom (or press **m**) to load more; **r** fetches new posts.
- Someone walks by: **Esc** switches to a boring "Q4 Budget" sheet. **Esc** again to come back.
- **⌥T** (Alt+T) turns the sheet off and shows the real Threads page: the feed, or the thread you were on.

## Features

- **Looks like Sheets.** The browser tab reads `<title> - Google Sheets` with a Sheets icon; the doc title and column titles are editable (double-click) and remembered; columns resize; zoom works.
- **Feed as rows.** Author, time, topic (as a dropdown chip), text, likes, replies, reposts, shares, attachments, and post ID. Replies Threads surfaces under a post become `5.1`; quoted posts get their own `5.q` row.
- **Threads and sub-threads as sheet tabs.** Ancestors in grey, the post in bold, replies numbered by depth (`2.1.1`). Right-click a tab for Delete / Rename / Move, just like Sheets.
- **Nothing skipped while scrolling.** Threads renders only the posts near the screen; threet walks the list step by step so every post lands in the sheet.
- **Media and links.** Image and video chips with a hover preview and a viewer; link previews as link chips; Threads labels ("Original author liked") as cell notes.
- **Boss key and a real "show original".** Esc for the decoy sheet, ⌥T for the real page.
- **Keyboard first.** Every action has a key; F1 lists them.

## Keys

| Key | Action |
|---|---|
| `↑ ↓ ← →` · `j k h l` · `Tab` | Move between cells (`PageUp`/`PageDown` jump 10 rows) |
| `Enter` · `o` · double-click | Open the thread / sub-thread in a new sheet tab (on an attachment: view it) |
| `Backspace` · `u` · `⌥←` | Close the current thread tab and go back |
| `Space` · `F2` · `e` | Read the whole cell in place |
| `⌘⇧U` | Expand the formula bar |
| `[` `]` · `⌥↑` `⌥↓` | Previous / next sheet tab |
| `m` · `End` | Load more |
| `r` | New posts (Data → Refresh data) |
| `p` | Image previews on hover on/off |
| `⌘+` `⌘-` | Zoom |
| `⌘C` | Copy the cell |
| `Esc` | Boss key |
| `⌥T` | Turn the sheet off / on |
| `F1` · `?` · `⌘/` | Guide and shortcuts |

Clicking the extension icon also toggles the sheet.

## How it works

```text
 threads.com tab
 ├── the real Threads page        ← driver: watches the DOM, scrolls to load more
 ├── thread iframes (≤ 3, hidden) ← one per open thread sheet, same origin, inert
 └── <threet-root> shadow DOM     ← the Sheets UI, covering everything
          ▲
          └── parser → store → sheet model → grid
```

- **Parser** reads posts from the live DOM without relying on Threads' generated class names: `data-pressable-container`, permalinks with `<time>`, `dir="auto"` text runs, and the like/reply/repost/share button group.
- **Driver** follows the page's client-side routing, walks the virtualised list to load more, and keeps every post it has seen, even after Threads unmounts it.
- **Thread sheets** are backed by a same-origin `<iframe>` of the thread page, laid out under the sheet, so opening a thread never navigates the feed underneath. Threads normally refuses to be framed (`X-Frame-Options: DENY`, and an error page for `Sec-Fetch-Dest: iframe`); a [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) rule lifts that **only for frames that threads.com opens itself**, so other sites still cannot frame Threads. If a frame does not render within 8 seconds, threet falls back to navigating the page.
- **UI** is Preact in a shadow root, styled after the current Sheets design; icons are Material Symbols and the UI font is Google Sans.

## Privacy and safety

- **Local processing and network requests.** threet has no backend or analytics service; it parses and displays posts locally. Opening thread sheets loads real Threads pages in iframes, scrolling can trigger Threads to fetch more posts, and media previews load images from their source URLs. These requests use the normal Threads pages and media hosts. Fonts and icons are bundled with the extension.
- **Storage.** Settings (doc title, column titles and widths, zoom) are kept in `chrome.storage.local`. Read rows, open sheet tabs, and selections are kept in memory and saved to the tab's `sessionStorage` after relevant state changes (with an 800 ms debounce). The snapshot is restored only when threet triggers a full page navigation and leaves a marker less than 20 seconds old; an ordinary reload starts fresh and clears the snapshot. This cache belongs to the Threads page's origin, so it is accessible to that page's scripts.
- **Permissions.** `storage`, host access to `threads.com` / `threads.net`, and `declarativeNetRequestWithHostAccess` for the framing rule above. The release build has no `debugger` permission and no debug code.
- **Read-only.** threet does not like, post, follow, or reply on your behalf.
- **Use it responsibly.** It is a personal reading tool. Respect Threads' terms and your workplace's rules; it may break whenever Threads changes its page.

## Roadmap

- [x] Sheets skin: feed, threads, sub-threads, quotes, media, links
- [x] Infinite scroll without gaps; thread tabs in iframes
- [x] Boss key, show original, in-app guide
- [ ] Reply and like from the sheet (comments as Sheets comments)
- [ ] Profiles and search as sheets
- [ ] More skins: Google Docs, Excel, VS Code
- [ ] Settings page; Chrome Web Store release

## Development

```sh
npm run dev          # watch build → dist-dev/ (load this one unpacked while developing)
npm test             # parser and store tests
npm run typecheck
```

- `dist-dev/` includes a debug bridge to the **threet-debug** MCP server (`mcp/server.mjs`, declared in `.mcp.json`), so an agent such as Claude Code can inspect state, read the live DOM, evaluate JS, take screenshots, send input, and reload the extension in your Chrome. It only accepts connections from a `chrome-extension://` origin carrying the token in `.threet-dev-token` (generated, gitignored). `dist/` contains none of it.
- `node scripts/preview.mjs [saved-page.html] --dist dist-dev` serves a saved Threads page (scripts stripped) with the built overlay for offline checks; `node scripts/smoke-mcp.mjs` smoke-tests the MCP server.
- Eight parser tests run against a page you save yourself to `test/fixtures/feed-home.html`. Fixtures contain other people's posts, so they are gitignored. On a fresh clone, those eight tests are skipped; the remaining ten tests run without the fixture. Check the skipped count before treating a passing run as full parser coverage.
- Automated tests currently cover parser helpers, the saved feed fixture, store merging, and sheet row modeling. Navigation, iframe fallback, keyboard interactions, and the UI still need manual checks in Chrome against live Threads. No CI workflow is configured yet.

Source layout:

```text
src/content/parser.ts   DOM → posts, groups, thread rows
src/content/driver.ts   page routing, loading more, navigation fallbacks
src/content/frames.ts   thread iframes
src/content/store.ts    tabs, lists, threads, settings
src/content/sheet.ts    posts → columns and rows
src/content/ui/         the Sheets UI (Preact)
src/background/         toolbar toggle; dev-only debug link
mcp/server.mjs          dev-only MCP server
```

## Contributing

Issues and pull requests are welcome. Threads changes its markup often; parser fixes with a test (and a description of the DOM you saw) are especially useful.

```sh
npm run typecheck && npm test && npm run build
```

## Support

threet is free and open source. If it makes your day a little better, you can support its development:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/dlir2404)

Bug reports, ideas, and pull requests help just as much.

## Security

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/dlir2404/threet/security/advisories/new) rather than public issues.

## Disclaimer

threet is an independent project. It is not affiliated with, endorsed by, or sponsored by Google or Meta. Google Sheets is a trademark of Google LLC; Threads is a trademark of Meta Platforms, Inc. The Sheets-like interface is recreated from scratch; no code or assets from Google Sheets are included. The icon set and UI font are Google's open-source releases, used under their licenses below.

Third-party components: [Google Sans](https://fonts.google.com/specimen/Google+Sans) (SIL Open Font License 1.1, via Fontsource), [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0), [Preact](https://preactjs.com) (MIT).

## License

Copyright 2026 dlir2404.

Licensed under the [Apache License, Version 2.0](LICENSE). Contributions are accepted under the same license.
