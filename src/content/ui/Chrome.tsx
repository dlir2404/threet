import { useEffect, useRef, useState } from 'preact/hooks';
import { actions } from '../actions';
import { store, type State } from '../store';
import { I, openMenu, SheetsLogo, type MenuItem } from './common';

const dummy = (label: string, shortcut?: string, extra: Partial<MenuItem> = {}): MenuItem => ({ label, shortcut, ...extra });
const SEP: MenuItem = { sep: true };

function menus(s: State): Record<string, MenuItem[]> {
  return {
    File: [
      dummy('New', undefined, { sub: true }), dummy('Open', '⌘O'), dummy('Import'), dummy('Make a copy'), SEP,
      dummy('Share', undefined, { sub: true }), dummy('Email', undefined, { sub: true }), dummy('Download', undefined, { sub: true }), SEP,
      { label: 'Rename', action: () => actions.focusTitle() }, dummy('Move'), dummy('Add shortcut to Drive'), dummy('Move to trash'), SEP,
      dummy('Version history', undefined, { sub: true }), dummy('Make available offline'), SEP,
      dummy('Details'), dummy('Settings'), SEP, dummy('Print', '⌘P', { icon: 'print' }),
    ],
    Edit: [
      dummy('Undo', '⌘Z', { icon: 'undo' }), dummy('Redo', '⌘Y', { icon: 'redo' }), SEP,
      dummy('Cut', '⌘X'), { label: 'Copy', shortcut: '⌘C', action: () => actions.copyCell() }, dummy('Paste', '⌘V'), dummy('Paste special', undefined, { sub: true }), SEP,
      dummy('Move', undefined, { sub: true }), dummy('Delete', undefined, { sub: true }), SEP, dummy('Find and replace', '⌘⇧H'),
    ],
    View: [
      dummy('Show', undefined, { sub: true }), dummy('Freeze', undefined, { sub: true }), dummy('Group', undefined, { sub: true }), SEP,
      { label: 'Expanded formula bar', shortcut: '⌘⇧U', checked: s.settings.formulaExpanded, action: () => actions.toggleFormula() },
      { label: 'Image previews on hover', shortcut: 'P', checked: s.settings.showPreviews, action: () => actions.togglePreviews() },
      SEP, dummy('Hidden sheets', undefined, { disabled: true, sub: true }), dummy('Zoom', undefined, { sub: true }), dummy('Full screen'),
    ],
    Insert: [dummy('Cells', undefined, { sub: true }), dummy('Rows', undefined, { sub: true }), dummy('Columns', undefined, { sub: true }), dummy('Sheet', '⇧F11'), SEP, dummy('Chart', undefined, { icon: 'insertChart' }), dummy('Pivot table'), dummy('Image', undefined, { sub: true, icon: 'image' }), dummy('Drawing'), SEP, dummy('Function', undefined, { sub: true, icon: 'functions' }), dummy('Link', '⌘K', { icon: 'link' }), SEP, dummy('Checkbox'), dummy('Dropdown'), dummy('Emoji'), dummy('Smart chips', undefined, { sub: true }), SEP, { label: 'Comment', shortcut: '⌘⌥M', icon: 'addComment', action: () => actions.openCurrent() }, dummy('Note', '⇧F2')],
    Format: [dummy('Theme'), SEP, dummy('Number', undefined, { sub: true }), dummy('Text', undefined, { sub: true }), dummy('Alignment', undefined, { sub: true }), dummy('Wrapping', undefined, { sub: true }), dummy('Rotation', undefined, { sub: true }), SEP, dummy('Font size', undefined, { sub: true }), dummy('Merge cells', undefined, { sub: true }), dummy('Convert to table', '⌘⌥T'), SEP, dummy('Conditional formatting'), dummy('Alternating colors'), SEP, { label: 'Rename column', shortcut: 'Enter on row 1', action: () => actions.editHeader() }, { label: 'Reset column titles', disabled: !Object.keys(s.settings.colTitles ?? {}).length, action: () => actions.resetHeaders() }, SEP, dummy('Clear formatting', '⌘\\')],
    Data: [dummy('Sort sheet', undefined, { sub: true }), dummy('Sort range', undefined, { sub: true }), SEP, dummy('Create a filter', undefined, { icon: 'filter' }), dummy('Create group by view'), dummy('Create filter view'), dummy('Add a slicer'), SEP, dummy('Protect sheets and ranges'), dummy('Named ranges'), dummy('Named functions'), dummy('Randomize range'), SEP, dummy('Column stats'), dummy('Data validation'), dummy('Data cleanup', undefined, { sub: true }), dummy('Split text to columns'), dummy('Data extraction'), SEP, { label: 'Refresh data', icon: 'refresh', shortcut: 'R', action: () => actions.refresh() }, { label: 'Clear loaded rows', action: () => actions.clearRows() }],
    Tools: [dummy('Create a new form'), SEP, dummy('Spelling', undefined, { sub: true }), dummy('Suggestion controls', undefined, { sub: true }), dummy('Notification settings', undefined, { sub: true }), SEP, dummy('Accessibility')],
    Extensions: [
      dummy('Add-ons', undefined, { sub: true }), dummy('Macros', undefined, { sub: true }), SEP, dummy('Apps Script'), dummy('AppSheet', undefined, { sub: true }), SEP,
      { label: 'Show original (threet off)', shortcut: '⌥T', action: () => actions.toggleVisible() },
      { label: 'Load more rows', shortcut: 'M', action: () => actions.loadMore() },
    ],
    Help: [dummy('Search the menus', '⌥/'), SEP, dummy('Help'), dummy('Training'), dummy('Updates'), SEP, dummy('Help Sheets improve'), SEP, dummy('Privacy Policy'), dummy('Terms of Service'), SEP, dummy('Function list'), { label: 'Keyboard shortcuts', shortcut: '⌘/', icon: 'keyboard', action: () => actions.toggleHelp() }, SEP, { label: 'Hướng dẫn threet', shortcut: 'F1', action: () => actions.toggleHelp() }],
  };
}

export function TitleBar({ s }: { s: State }) {
  const [title, setTitle] = useState(s.settings.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setTitle(s.settings.title), [s.settings.title]);
  useEffect(() => {
    actions.focusTitle = () => {
      input.current?.focus();
      input.current?.select();
    };
  }, []);
  const commit = () => {
    const t = title.trim() || 'Untitled spreadsheet';
    setTitle(t);
    actions.saveSettings({ title: t });
  };
  const all = menus(s);
  return (
    <div class="titlebar">
      <div class="logo" title="Sheets home"><SheetsLogo /></div>
      <div class="title-col">
        <div class="title-row">
          <input
            ref={input}
            class="doc-title"
            value={title}
            size={Math.max(4, title.length + 1)}
            spellcheck={false}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                if (e.key === 'Escape') setTitle(s.settings.title);
                (e.target as HTMLInputElement).blur();
                actions.focusGrid();
              }
            }}
          />
          <button class="title-icon" title="Star"><I n="star" /></button>
          <button class="title-icon" title="Move"><I n="driveMove" /></button>
          <button class="title-icon" title="All changes saved to Drive"><I n="cloudDone" /></button>
        </div>
        <div class="menubar">
          {Object.keys(all).map((name) => (
            <div
              class={`mi ${s.menu?.id === name ? 'open' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                if (s.menu?.id === name) store.set({ menu: undefined });
                else openMenu(all[name], e.currentTarget as Element, { id: name });
              }}
              onMouseEnter={(e) => {
                if (s.menu?.id && s.menu.id !== name && all[s.menu.id]) openMenu(all[name], e.currentTarget as Element, { id: name });
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
      <div class="title-right">
        <div class="collab">
          <div class="av" style="background:#0b8043">H</div>
          <div class="av" style="background:#8430ce">N</div>
          <div class="av" style="background:#e37400">T</div>
          <div class="av more">+4</div>
        </div>
        <button class="round-btn" title="Last edit was seconds ago"><I n="history" /></button>
        <button class="round-btn" title="Open comment history"><I n="comment" /></button>
        <button class="meet-btn" title="Join a call here or present this tab to the call"><I n="videocam" /><span class="dd"><I n="dropDown" /></span></button>
        <div class="share">
          <button class="main"><I n="lock" />Share</button>
          <button class="side"><I n="dropDown" /></button>
        </div>
        <div class="me">D</div>
      </div>
    </div>
  );
}

function Tb({ n, title, on, onClick, dd }: { n: Parameters<typeof I>[0]['n']; title?: string; on?: boolean; onClick?: () => void; dd?: boolean }) {
  return (
    <button class={`tb ${on ? 'on' : ''}`} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <I n={n} />
      {dd && <span class="dd"><I n="dropDown" /></span>}
    </button>
  );
}

export function Toolbar({ s, onZoom }: { s: State; onZoom: (anchor: Element) => void }) {
  const zoom = Math.round((s.settings.zoom ?? 1) * 100);
  return (
    <div class="toolbar">
      <Tb n="search" title="Search the menus (Option+/)" />
      <Tb n="undo" title="Back (Backspace)" onClick={() => actions.back()} />
      <Tb n="redo" title="Redo (⌘Y)" />
      <Tb n="print" title="Print (⌘P)" />
      <Tb n="formatPaint" title="Paint format" />
      <button class="tb txt zoom" title="Zoom" onMouseDown={(e) => { e.preventDefault(); onZoom(e.currentTarget); }}>
        {zoom}%<span class="dd"><I n="dropDown" /></span>
      </button>
      <div class="sep" />
      <Tb n="attachMoney" title="Format as currency" />
      <Tb n="percent" title="Format as percent" />
      <Tb n="decimalDecrease" title="Decrease decimal places" />
      <Tb n="decimalIncrease" title="Increase decimal places" />
      <button class="tb txt num123" title="More formats">123<span class="dd"><I n="dropDown" /></span></button>
      <div class="sep" />
      <button class="tb txt font" title="Font">Arial<span class="dd"><I n="dropDown" /></span></button>
      <div class="sep" />
      <div class="fsize">
        <Tb n="remove" title="Decrease font size (⌘⇧,)" onClick={() => actions.zoomBy(-0.1)} />
        <div class="box">{Math.round(10 * (s.settings.zoom ?? 1))}</div>
        <Tb n="add" title="Increase font size (⌘⇧.)" onClick={() => actions.zoomBy(0.1)} />
      </div>
      <div class="sep" />
      <Tb n="bold" title="Bold (⌘B)" />
      <Tb n="italic" title="Italic (⌘I)" />
      <Tb n="strike" title="Strikethrough (⌘⇧X)" />
      <button class="tb" title="Text color" onMouseDown={(e) => e.preventDefault()}>
        <span class="underline"><I n="formatColorText" /></span>
      </button>
      <div class="sep" />
      <Tb n="colorFill" title="Fill color" />
      <Tb n="borderAll" title="Borders" />
      <Tb n="cellMerge" title="Merge cells" dd />
      <div class="sep" />
      <Tb n="alignLeft" title="Horizontal align" dd />
      <Tb n="valignBottom" title="Vertical align" dd />
      <Tb n="wrapText" title="Text wrapping" dd />
      <Tb n="textRotation" title="Text rotation" dd />
      <div class="sep" />
      <Tb n="link" title="Insert link (⌘K)" onClick={() => actions.openCurrent()} />
      <Tb n="addComment" title="Insert comment (⌘⌥M)" />
      <Tb n="insertChart" title="Insert chart" />
      <Tb n="filter" title="Create a filter" />
      <Tb n="filterViews" title="Filter views" dd />
      <Tb n="functions" title="Functions" dd />
      <div class="tb-spacer" />
      <Tb n="chevronUp" title="Hide the menus (Ctrl+Shift+F)" />
    </div>
  );
}
