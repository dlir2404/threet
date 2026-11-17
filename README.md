# threet

**threads + sheet**: Chrome extension phủ một giao diện Google Sheets lên threads.com. Nội dung được đọc từ trang Threads thật đang chạy bên dưới. Đọc feed, mở thread và thread con thành các tab sheet, tải thêm bài khi cuộn, và có boss key.

## Cài đặt

```bash
npm install
npm run build        # -> dist/       bản dùng hằng ngày (không có phần debug)
npm run dev          # -> dist-dev/   bản dev, tự build lại khi sửa code, có cầu nối debug MCP
```

Vào `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked**, rồi chọn `dist/` (hoặc `dist-dev/` khi phát triển). Sau đó mở https://www.threads.com.

## Cách dùng

| Việc | Phím / chuột |
|---|---|
| Di chuyển giữa các ô | `↑ ↓ ← →`, `j k h l`, `Tab`, `PageUp/PageDown` |
| Mở thread hoặc thread con (tab sheet mới) | `Enter`, `o`, double-click, bấm vào Ticket ID |
| Quay lại (đóng tab thread hiện tại) | `Backspace`, `u`, `⌥←`, chuột phải vào tab (hoặc ▾) → Delete; menu đó còn có Rename, Move right/left |
| Đổi tên cột | double-click ô tiêu đề xanh (hàng 1) hoặc `Enter` khi đang chọn nó; Format → Reset column titles |
| Đọc toàn văn ngay trong ô | `F2`, `Space`, `e`, double-click ô Description |
| Mở rộng thanh công thức | `⌘⇧U` |
| Chuyển tab sheet | `[` `]`, `⌥↑` `⌥↓` |
| Tải thêm bài | tự động khi cuộn tới cuối, `m`, `End`, nút **Add 1000 more rows** |
| Lấy bài mới | `r`, hoặc Data → Refresh data |
| Bật/tắt xem trước ảnh khi rê chuột | `p` |
| Zoom | `⌘+` `⌘-`, menu 100% |
| **Boss key** (chuyển sang bảng ngân sách giả) | `Esc` |
| Tắt/bật hẳn overlay (hiện Threads thật) | `⌥T`, hoặc bấm icon extension |
| **Hướng dẫn sử dụng** (tự hiện ở lần đầu) | `F1`, `?`, `⌘/`, hoặc Help → Hướng dẫn threet |

- Có thể đổi tên tài liệu bằng cách bấm vào tiêu đề. Tên này cũng là tiêu đề tab của trình duyệt (`<tên> - Google Sheets`). Favicon cũng được đổi sang icon Sheets.
- Có thể kéo mép tiêu đề cột để đổi độ rộng. Độ rộng được lưu lại.
- Tam giác đen ở góc ô Description là **ghi chú**: nhãn Threads gắn cho bài ("Tác giả gốc đã thích", "Cuộc trò chuyện đầu tiên"…). Rê chuột vào để xem.
- Bạn tự reload (F5/⌘R) thì sheet bắt đầu lại từ đầu. Chỉ khi extension buộc phải tải lại trang (mở một bài mà link đã bị Threads gỡ khỏi DOM) thì bảng mới được giữ nguyên. Nó được lưu tạm vào `sessionStorage` của tab và đánh dấu "giữ lại" trong 20 giây.

## Kiến trúc

```
src/content/parser.ts    đọc DOM Threads ra Post/PostGroup/ThreadRow (không dựa vào class name)
src/content/driver.ts    điều khiển trang thật: MutationObserver, theo dõi route, cuộn để tải thêm, chuyển trang
src/content/frames.ts    mỗi tab thread là một iframe cùng origin nằm dưới sheet (tối đa 3); feed chính không bao giờ phải chuyển trang
src/content/store.ts     state: các tab, list (feed) và thread đã gặp; giữ lại cả bài đã bị Threads gỡ khỏi DOM
src/content/sheet.ts     ánh xạ post sang cột/hàng của sheet
src/content/ui/*         giao diện Sheets (Preact, nằm trong Shadow DOM)
src/content/keys.ts      phím tắt; chặn phím không cho tới trang Threads
src/content/devbridge.ts lệnh debug (chỉ có trong bản dev)
src/background/          bấm icon để bật/tắt; bản dev có thêm WebSocket client nối tới MCP
mcp/server.mjs           MCP server "threet-debug" (stdio + WebSocket 127.0.0.1:47321), không đóng gói vào extension
```

## Thread trong iframe

Mở thread hay thread con sẽ tạo một `<iframe>` của trang thread, nằm ngay dưới sheet (được render nhưng bị che, và đặt `inert`). Trang feed chính không bao giờ phải chuyển trang. Threads mặc định từ chối bị nhúng:
- Header `X-Frame-Options: DENY`.
- Server trả trang lỗi khi request có `Sec-Fetch-Dest: iframe`.

Vì vậy `rules.json` (sinh trong `scripts/build.mjs`) dùng `declarativeNetRequest`, **chỉ áp dụng cho iframe do chính threads.com mở**, để gỡ header đó và gửi `Sec-Fetch-Dest: document`. Trang web khác vẫn không nhúng được Threads.

Nếu iframe không render được trong 8 giây, extension quay về cách cũ là chuyển trang chính.

## Debug bằng MCP (chỉ khi phát triển)

`.mcp.json` khai báo server `threet-debug`. Khi Claude Code mở thư mục này, server tự chạy. Bản `dist-dev/` sẽ tự kết nối tới nó.

Kết nối chỉ được chấp nhận nếu đến từ origin `chrome-extension://` và có token trong `.threet-dev-token` (file này được tạo khi build dev và đã được gitignore). Bản `dist/` không chứa code debug và không xin quyền `debugger`.

Các tool:
- `threet_status`, `threet_state`, `threet_rows`
- `threet_content` (parse/dom/action…)
- `threet_eval` (chạy JS trong trang qua CDP)
- `threet_screenshot`
- `threet_input` (gửi phím/chuột thật)
- `threet_navigate`, `threet_reload`, `threet_logs`, `threet_detach`

## Test

```bash
npm test             # parser + store (fixture: test/fixtures/feed-home.html, chỉ để ở máy local)
node scripts/preview.mjs --dist dist-dev           # xem overlay trên trang Threads đã lưu, không cần extension
node scripts/smoke-mcp.mjs                         # smoke test MCP server với extension giả
```

`test/fixtures/` chứa trang Threads đã lưu, tức là bài viết của người khác. Thư mục này đã được gitignore, đừng commit.
