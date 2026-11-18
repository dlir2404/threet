import type { ComponentChildren } from 'preact';
import { actions } from '../actions';
import { site } from '../site';
import { store, type State } from '../store';
import { I } from './common';

/** In-app user guide (F1 / ? / ⌘/). Styled like a Google Sheets dialog. */

const K = ({ children }: { children: ComponentChildren }) => <kbd class="k">{children}</kbd>;

interface Section {
  title: string;
  body: () => ComponentChildren;
}

export const GUIDE: Section[] = [
  {
    title: 'Bắt đầu',
    body: () => (
      <>
        <p>
          <b>threet</b> phủ một bảng tính lên trang {site().name}. Nội dung lấy trực tiếp từ trang {site().name} thật bên dưới,
          nên bạn vẫn đăng nhập và đọc như bình thường, chỉ là nhìn giống đang làm việc. Hiện hỗ trợ Threads, Reddit và voz.vn.
        </p>
        <ul>
          <li>Mỗi <b>hàng</b> là một bài viết. Hàng <b>5.1</b> là trả lời hiện ngay dưới bài 5 (Threads), hay bình luận con của bình luận 5 (khi mở một bài).</li>
          <li>Mỗi <b>tab sheet</b> ở dưới cùng là một trang: <b>Overview</b> là feed, các tab khác là bài, thread hay chuyên mục bạn đã mở.</li>
          <li>Bấm vào một ô thì <b>thanh công thức</b> (fx) hiện đầy đủ nội dung ô đó.</li>
          <li>Kéo mép tiêu đề cột (A, B, C…) để đổi độ rộng. Bấm vào tên tài liệu để đổi tên, tên này cũng là tiêu đề tab trình duyệt.</li>
          <li><b>Đổi tên cột:</b> double-click ô tiêu đề màu xanh (hàng 1), hoặc chọn nó rồi <K>Enter</K>. Gõ tên mới, <K>Enter</K> để lưu, <K>Esc</K> để huỷ. Xoá trắng là về tên mặc định; Format → Reset column titles để đặt lại tất cả.</li>
          <li><b>Tab sheet:</b> chuột phải (hoặc bấm <b>▾</b>) vào tab → <b>Delete</b> để đóng, <b>Rename</b> để đổi tên, <b>Move right/left</b> để sắp xếp. Double-click tab cũng đổi tên được. <K>Backspace</K> đóng tab đang xem.</li>
        </ul>
        <p class="tip">Mở lại hướng dẫn này bất cứ lúc nào bằng <K>F1</K>, <K>?</K> hoặc menu <b>Help → Hướng dẫn threet</b>.</p>
      </>
    ),
  },
  {
    title: 'Các cột',
    body: () => (
      <table class="cols">
        <tbody>
          <tr><td>No</td><td>Số thứ tự. <b>5.1</b>, <b>2.1.1</b> là trả lời và trả lời lồng nhau.</td></tr>
          <tr><td>Reporter</td><td>Người đăng.</td></tr>
          <tr><td>Updated</td><td>Thời gian đăng.</td></tr>
          <tr><td>Function</td><td>Chủ đề (tag) của bài, hiện dạng chip màu.</td></tr>
          <tr><td>Description</td><td>Nội dung. <b>↳</b> là trả lời, <b>❝</b> là bài được trích dẫn, <b>[1/3]</b> là bài nhiều phần.</td></tr>
          <tr><td>Votes</td><td>Lượt thích.</td></tr>
          <tr><td>Comments</td><td>Số trả lời. Có số tức là mở được thread con.</td></tr>
          <tr><td>Reposts / Shares</td><td>Lượt đăng lại / chia sẻ.</td></tr>
          <tr><td>Attachment</td><td>Ảnh / video. Rê chuột để xem trước (bấm ‹ › hoặc ảnh nhỏ để chuyển, video phát ngay, mặc định tắt tiếng), <K>Enter</K> để xem lớn rồi dùng <K>←</K> <K>→</K>.</td></tr>
          <tr><td>Ticket ID</td><td>Mã bài. Bấm để mở thread.</td></tr>
          <tr><td><span class="tri" /> góc ô</td><td>Ghi chú (note): nhãn Threads gắn cho bài, ví dụ “Tác giả gốc đã thích”, “Cuộc trò chuyện đầu tiên”. Rê chuột vào ô để xem.</td></tr>
        </tbody>
      </table>
    ),
  },
  {
    title: 'Đọc feed & thread',
    body: () => (
      <ul>
        <li><b>Di chuyển:</b> <K>↑</K> <K>↓</K> <K>←</K> <K>→</K> hoặc <K>j</K> <K>k</K> <K>h</K> <K>l</K>, <K>PageUp</K>/<K>PageDown</K> nhảy 10 hàng.</li>
        <li><b>Đọc hết một bài dài:</b> <K>Space</K> / <K>F2</K> / double-click ô Description, nội dung mở ra ngay tại ô. Hoặc <K>⌘⇧U</K> để mở rộng thanh công thức.</li>
        <li><b>Mở thread / thread con:</b> <K>Enter</K> (hoặc bấm Ticket ID). Thread mở thành một tab sheet mới: bài cha màu xám, bài chính in đậm, trả lời đánh số theo cấp.</li>
        <li><b>Trong thread</b> chọn một trả lời rồi <K>Enter</K> để đi sâu vào thread con của nó.</li>
        <li><b>Quay lại:</b> <K>Backspace</K> hoặc <K>u</K>: đóng tab hiện tại, về tab trước (vẫn giữ chỗ đang đọc).</li>
        <li><b>Chuyển tab:</b> <K>[</K> <K>]</K> hoặc bấm tab ở dưới.</li>
        <li><b>Tải thêm:</b> cuộn hoặc đi xuống gần cuối là tự tải. Có thể bấm <K>m</K> hoặc nút <b>Add … more rows</b> cuối bảng. Trên voz thì không tự tải: mỗi lần một trang như voz, <K>m</K> sang trang sau.</li>
        <li><b>Bài mới:</b> <K>r</K> (Data → Refresh data).</li>
      </ul>
    ),
  },
  {
    title: 'Tìm & diễn đàn',
    body: () => (
      <ul>
        <li><b>Tìm trong thớt voz:</b> <K>⌘F</K> hoặc <K>/</K>, nhập <b>từ khoá</b> và/hoặc <b>người đăng</b>, bấm <K>Enter</K>. voz tìm trên cả thớt (đang ở box thì cả box), kết quả mở thành tab <b>🔍</b>; <K>Enter</K> ở một kết quả nhảy thẳng tới trang có bài đó.</li>
        <li><b>Threads, Reddit:</b> <K>⌘F</K> tìm trong các dòng đã tải (cả chữ lẫn tên người đăng), ô khớp tô xanh; <K>Enter</K> / <K>⇧Enter</K> tới kết quả sau / trước, nút phễu chỉ hiện dòng khớp.</li>
        <li>Gõ không dấu thì khớp mọi dấu (“sua” ra cả “sữa”, “sửa”), gõ có dấu thì khớp đúng dấu. <K>Esc</K> đóng ô tìm.</li>
        <li><b>Thớt nhiều trang:</b> mỗi lần hiện một trang như voz, góc phải dưới ghi <b>Trang 3 / 150</b>. <K>,</K> <K>.</K> sang trang trước / sau, <K>g</K> rồi gõ số trang (hoặc “cuối”) để nhảy tới. Hai nút ⏮ ⏭ về trang đầu / cuối.</li>
        <li><b>Trích dẫn:</b> khung xám ở đầu ô là đoạn bài đó trích. Bấm vào khung (hoặc <K>q</K>) để tới bài gốc: khác trang thì tự mở trang đó, khác thớt thì mở tab mới; <K>Backspace</K> để quay lại chỗ cũ.</li>
        <li><b>Mở thớt ở trang mới nhất:</b> <K>⇧Enter</K> trên một thớt trong danh sách (<K>Enter</K> mở từ trang 1).</li>
      </ul>
    ),
  },
  {
    title: 'Ẩn mình',
    body: () => (
      <ul>
        <li><b>Boss key</b> <K>Esc</K>: chuyển ngay sang bảng ngân sách “Q4 Budget” với số liệu giả. Bấm <K>Esc</K> lần nữa để quay lại. Trong chế độ này các phím khác bị vô hiệu, bấm nhầm cũng không lộ.</li>
        <li><b>Tắt / bật hẳn bảng tính</b> <K>⌥T</K> (hoặc bấm icon extension): hiện lại trang {site().name} thật, đúng trang đang xem (feed, hoặc chính thread của tab đó). Bấm <K>⌥T</K> lần nữa để quay lại bảng.</li>
        <li>Tab trình duyệt luôn mang tên <b>“tên tài liệu - Google Sheets”</b> và icon Sheets.</li>
        <li><K>p</K> bật/tắt xem trước ảnh khi rê chuột (tắt đi nếu ngồi chỗ đông người).</li>
        <li>Zoom bằng <K>⌘+</K> <K>⌘-</K> hoặc ô <b>100%</b> trên thanh công cụ.</li>
      </ul>
    ),
  },
  {
    title: 'Phím tắt',
    body: () => (
      <table class="cols keys">
        <tbody>
          {[
            ['Di chuyển', '↑ ↓ ← →  ·  j k h l  ·  Tab'],
            ['Nhảy 10 hàng / đầu / cuối', 'PageUp PageDown  ·  ⌘↑ ⌘↓ (Home/End)'],
            ['Mở thread / thread con', 'Enter  ·  o  ·  double-click'],
            ['Quay lại / đóng tab thread', 'Backspace  ·  u  ·  ⌥←  ·  chuột phải tab → Delete'],
            ['Đổi tên cột', 'Enter / double-click ở hàng 1'],
            ['Đọc toàn văn trong ô', 'Space  ·  F2  ·  e'],
            ['Mở rộng thanh công thức', '⌘⇧U'],
            ['Tab trước / sau', '[  ]  ·  ⌥↑ ⌥↓'],
            ['Tải thêm', 'm  ·  End'],
            ['Tìm (voz: tìm cả thớt)', '⌘F  ·  /'],
            ['Kết quả tô xanh sau / trước', 'n  N'],
            ['Trang trước / sau / đi tới trang', ',  .  ·  g'],
            ['Mở thớt ở trang mới nhất', '⇧Enter'],
            ['Tới bài gốc của trích dẫn / quay lại', 'q  ·  Backspace'],
            ['Bài mới', 'r'],
            ['Xem trước ảnh', 'p'],
            ['Copy ô', '⌘C'],
            ['Zoom', '⌘+  ⌘-'],
            ['Boss key', 'Esc'],
            ['Tắt / bật bảng tính', '⌥T'],
            ['Hướng dẫn này', 'F1  ·  ?  ·  ⌘/'],
          ].map(([a, b]) => (
            <tr><td>{a}</td><td><kbd class="k">{b}</kbd></td></tr>
          ))}
        </tbody>
      </table>
    ),
  },
];

export function Guide({ s }: { s: State }) {
  const tab = Math.min(s.guideTab ?? 0, GUIDE.length - 1);
  const sec = GUIDE[tab];
  return (
    <div class="scrim" onMouseDown={() => actions.toggleHelp()}>
      <div class="dialog guide" onMouseDown={(e) => e.stopPropagation()}>
        <div class="g-head">
          <h2>Hướng dẫn sử dụng</h2>
          <button class="round-btn" title="Close (Esc)" onClick={() => actions.toggleHelp()}><I n="close" /></button>
        </div>
        <div class="g-body">
          <nav class="g-nav">
            {GUIDE.map((g, i) => (
              <div class={`g-item ${i === tab ? 'on' : ''}`} onClick={() => store.set({ guideTab: i })}>{g.title}</div>
            ))}
          </nav>
          <div class="g-content">{sec.body()}</div>
        </div>
        <div class="foot">
          <span class="g-hint">← → chuyển mục · Esc đóng</span>
          <button onClick={() => actions.toggleHelp()}>Đã hiểu</button>
        </div>
      </div>
    </div>
  );
}
