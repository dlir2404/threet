import { useEffect, useMemo, useRef } from 'preact/hooks';
import { actions, currentSel, MIN_COLS } from '../actions';
import { buildModel, cellFull, colLetter, type SheetModel } from '../sheet';
import { store, type State } from '../store';
import { Grid } from './Grid';
import { TitleBar, Toolbar } from './Chrome';
import { Guide } from './Guide';
import { VideoMirror } from './Video';
import { I, openMenu, useStore, type MenuItem } from './common';

export function App() {
  const s = useStore();
  const model = useMemo(
    () => buildModel(s),
    [s.boss, s.active, s.tabs, s.lists, s.threads, s.settings.colWidths],
  );

  if (!s.settings.enabled || !s.visible) return null;

  const zoomMenu = (anchor: Element) =>
    openMenu(
      [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2].map((z) => ({
        label: `${Math.round(z * 100)}%`,
        checked: Math.abs((s.settings.zoom ?? 1) - z) < 0.01,
        action: () => actions.setZoom(z),
      })),
      anchor,
      { id: 'zoom' },
    );

  return (
    <div
      class="app"
      onMouseDown={(e) => {
        if (s.menu && !(e.target as HTMLElement).closest('.menu, .mi, .tb, .stab, .round-btn')) store.set({ menu: undefined });
      }}
    >
      <TitleBar s={s} />
      <Toolbar s={s} onZoom={zoomMenu} />
      <FormulaBar s={s} model={model} />
      <Grid s={s} model={model} />
      <SheetTabs s={s} />
      {s.menu && <Menu />}
      {s.toast && !s.boss && <div class="toast">{s.toast}</div>}
      {s.help && <Guide s={s} />}
      {s.lightbox && <Lightbox lb={s.lightbox} />}
    </div>
  );
}

function Lightbox({ lb }: { lb: NonNullable<State['lightbox']> }) {
  const cur = lb.items[lb.index];
  const many = lb.items.length > 1;
  const stop = (e: Event) => e.stopPropagation();
  return (
    <div class="lightbox" onMouseDown={() => store.set({ lightbox: undefined })}>
      <div class="lb-stage" onMouseDown={stop}>
        {cur.video && cur.vkey && cur.code ? (
          <VideoMirror key={cur.vkey} vkey={cur.vkey} code={cur.code} poster={cur.src || undefined} />
        ) : (
          <img src={cur.src} alt={cur.alt ?? ''} referrerpolicy="origin-when-cross-origin" />
        )}
      </div>
      {many && (
        <>
          <button class="round-btn lb-nav prev" title="Previous (←)" onMouseDown={(e) => { stop(e); actions.stepMedia(-1); }}><I n="chevronLeft" /></button>
          <button class="round-btn lb-nav next" title="Next (→)" onMouseDown={(e) => { stop(e); actions.stepMedia(1); }}><I n="chevronRight" /></button>
          <div class="lb-count">{lb.index + 1} / {lb.items.length}</div>
          <div class="lb-strip" onMouseDown={stop}>
            {lb.items.map((it, i) => (
              <button class={`lb-thumb ${i === lb.index ? 'on' : ''}`} onMouseDown={() => store.set({ lightbox: { ...lb, index: i } })}>
                {it.src ? <img src={it.src} referrerpolicy="origin-when-cross-origin" /> : <span class="lb-noimg" />}
                {it.video && <I n="playCircle" />}
              </button>
            ))}
          </div>
        </>
      )}
      {cur.alt && <div class="lb-cap">{cur.alt}</div>}
      <button class="round-btn x" title="Close (Esc)"><I n="close" /></button>
    </div>
  );
}

function FormulaBar({ s, model }: { s: State; model: SheetModel }) {
  const sel = currentSel();
  const cols = model.columns;
  const col = cols[sel.c];
  const row = model.rows[sel.r - 1];
  let text = '';
  if (sel.r === 0) text = col?.header ?? '';
  else if (row && col) text = cellFull(row, col);
  const ref = `${colLetter(Math.min(sel.c, MIN_COLS - 1))}${sel.r + 1}`;
  const expanded = s.settings.formulaExpanded;
  return (
    <div class={`fbar ${expanded ? 'expanded' : ''}`}>
      <div class="namebox">
        <span>{ref}</span>
        <I n="dropDown" />
      </div>
      <div class="div" />
      <div class="fx">fx</div>
      <div class="content">{text}</div>
      <button class="expand" title="Expand formula bar (⌘⇧U)" onClick={() => actions.toggleFormula()}>
        <I n={expanded ? 'chevronUp' : 'chevronDown'} />
      </button>
    </div>
  );
}

function SheetTabs({ s }: { s: State }) {
  const tabs = s.boss
    ? [{ id: 'boss', title: 'Q4 Budget' }, { id: 'boss2', title: 'Headcount' }, { id: 'boss3', title: 'Assumptions' }]
    : s.tabs;
  const active = s.boss ? 'boss' : s.active;
  const allSheets = (anchor: Element) =>
    openMenu(
      tabs.map((t) => ({ label: t.title, checked: t.id === active, action: () => !s.boss && actions.activateTab(t.id) })),
      anchor,
      { above: true, id: 'sheets' },
    );
  // Same menu as Google Sheets' sheet-tab menu (▾ or right-click).
  const tabMenu = (anchor: Element, id: string) => {
    const i = tabs.findIndex((t) => t.id === id);
    const locked = s.boss;
    const items: MenuItem[] = [
      { label: 'Delete', disabled: locked || id === '/', action: () => actions.closeTab(id) },
      { label: 'Duplicate' },
      { label: 'Copy to', sub: true },
      { label: 'Rename', disabled: locked, action: () => store.set({ renamingTab: id }) },
      { label: 'Change color', sub: true },
      { label: 'Protect sheet' },
      { label: 'Hide sheet', disabled: locked || id === '/', action: () => actions.closeTab(id) },
      { label: 'View comments', disabled: true },
      { sep: true },
      { label: 'Move right', disabled: locked || i >= tabs.length - 1, action: () => actions.moveTab(id, 1) },
      { label: 'Move left', disabled: locked || i <= 0, action: () => actions.moveTab(id, -1) },
    ];
    openMenu(items, anchor, { above: true, id: `tab:${id}`, compact: true });
  };
  const tab = s.tabs.find((t) => t.id === s.active);
  const list = tab?.kind === 'list' ? s.lists[tab.id] : undefined;
  const count = s.boss ? 0 : tab?.kind === 'list' ? list?.keys.length ?? 0 : (tab?.code && s.threads[tab.code]?.length) || 0;
  return (
    <div class="tabs">
      <button class="round-btn" title="Add Sheet"><I n="add" /></button>
      <button class="round-btn" title="All Sheets" onMouseDown={(e) => { e.preventDefault(); allSheets(e.currentTarget); }}><I n="menu" /></button>
      <div class="lst">
        {tabs.map((t) => (
          <div
            class={`stab ${t.id === active ? 'on' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault();
              tabMenu(e.currentTarget as Element, t.id);
            }}
            onDblClick={() => !s.boss && store.set({ renamingTab: t.id })}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest('.dd, .tab-rename')) return;
              if (e.button === 2) return;
              if (e.button === 1) return actions.closeTab(t.id);
              if (!s.boss) actions.activateTab(t.id);
            }}
          >
            {s.renamingTab === t.id ? <TabRename id={t.id} title={t.title} /> : t.title}
            <span class="dd" onMouseDown={(e) => { e.preventDefault(); tabMenu((e.currentTarget as Element).closest('.stab')!, t.id); }}><I n="dropDown" /></span>
          </div>
        ))}
      </div>
      {count > 0 && <div class="status-right">Count: {count}</div>}
      <div class="nav">
        <button class="round-btn" title="Previous sheet" onClick={() => actions.nextTab(-1)}><I n="chevronLeft" /></button>
        <button class="round-btn" title="Next sheet" onClick={() => actions.nextTab(1)}><I n="chevronRight" /></button>
      </div>
      <div class="vsep" />
      <button class="round-btn" title="Explore"><I n="chevronLeft" /></button>
    </div>
  );
}

function TabRename({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (v: string | null) => {
    if (store.state.renamingTab !== id) return;
    store.set((st) => ({
      renamingTab: undefined,
      tabs: v != null && v.trim() && v.trim() !== title ? st.tabs.map((t) => (t.id === id ? { ...t, title: v.trim(), renamed: true } : t)) : st.tabs,
    }));
    actions.focusGrid();
  };
  return (
    <input
      class="tab-rename"
      ref={ref}
      defaultValue={title}
      size={Math.max(4, title.length + 1)}
      spellcheck={false}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') done(null);
      }}
      onBlur={(e) => done((e.target as HTMLInputElement).value)}
    />
  );
}

function Menu() {
  const m = store.state.menu!;
  const style: Record<string, string> = { left: `${m.x}px` };
  if (m.y != null) style.top = `${m.y}px`;
  if (m.bottom != null) style.bottom = `${m.bottom}px`;
  return (
    <div class={`menu ${m.compact ? 'compact' : ''}`} style={style} onMouseDown={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      {(m.items as MenuItem[]).map((it) =>
        it.sep ? (
          <div class="hr" />
        ) : (
          <div
            class={`it ${it.disabled ? 'dis' : ''}`}
            onClick={() => {
              if (it.disabled) return;
              store.set({ menu: undefined });
              it.action?.();
              actions.focusGrid();
            }}
          >
            <span class="ic">{it.checked ? <I n="check" /> : it.icon ? <I n={it.icon} /> : null}</span>
            <span class="lb">{it.label}</span>
            {it.shortcut && <span class="sc">{it.shortcut}</span>}
            {it.sub && <span class="sub"><I n="arrowRight" /></span>}
          </div>
        ),
      )}
    </div>
  );
}
