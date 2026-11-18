import { actions } from '../actions';
import { site } from '../site';
import type { UpdateInfo } from '../../shared/update';
import { I } from './common';

/** "New version" dialog, styled like the guide. Shown once a day at most, or from Help. */

/** GitHub's generated notes → readable lines ("* Fix x by @me in https://…" → "• Fix x"). */
function cleanNotes(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^##\s*What'?s Changed/i.test(l) && !/^##\s*New Contributors/i.test(l) && !/made their first contribution/i.test(l))
    .map((l) =>
      l
        .replace(/^[*-]\s+/, '• ')
        .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+$/i, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^#+\s*/, ''),
    )
    .slice(0, 14);
}

export function UpdateDialog({ info, current }: { info: UpdateInfo; current: string }) {
  const notes = cleanNotes(info.notes);
  const open = (url: string) => window.open(url, '_blank', 'noopener');
  return (
    <div class="scrim" onMouseDown={() => actions.closeUpdate('later')}>
      <div class="dialog guide update" onMouseDown={(e) => e.stopPropagation()}>
        <div class="g-head">
          <h2>Có bản cập nhật mới</h2>
          <button class="round-btn" title="Để sau (Esc)" onClick={() => actions.closeUpdate('later')}><I n="close" /></button>
        </div>
        <div class="g-content">
          <p class="up-ver">
            <b>threet v{info.version}</b> đã có. Bạn đang dùng <b>v{current}</b>.
          </p>
          {notes.length > 0 && (
            <>
              <div class="up-title">Có gì mới</div>
              <div class="up-notes">{notes.map((l) => <div>{l}</div>)}</div>
            </>
          )}
          <div class="up-title">Cách cập nhật</div>
          <ol class="up-steps">
            <li>Bấm <b>Tải bản mới</b> để tải file <code>threet-v{info.version}.zip</code>.</li>
            <li>Giải nén và <b>chép đè vào đúng thư mục</b> extension đang dùng (giữ thư mục cũ thì tên tài liệu, tên cột… vẫn còn).</li>
            <li>Mở <code>chrome://extensions</code>, bấm <b>Reload</b> ở threet, rồi tải lại tab {site().name}.</li>
          </ol>
        </div>
        <div class="foot">
          <span class="g-hint">
            <button class="up-link" onClick={() => actions.closeUpdate('skip')}>Bỏ qua bản này</button>
            {' · '}
            <button class="up-link" onClick={() => open(info.url)}>Xem trên GitHub</button>
          </span>
          <span class="up-actions">
            <button onClick={() => actions.closeUpdate('later')}>Để sau</button>
            <button class="primary" onClick={() => open(info.download)}>Tải bản mới</button>
          </span>
        </div>
      </div>
    </div>
  );
}
