# WhereAmI ingest backend

Cloud Function nhận vị trí do Traccar Client SDK gửi và ghi vào Firestore.

App và SDK **không cần sửa dòng nào** — chỉ đổi `serverUrl` trong màn Settings
thành URL của function.

```
App Android ──POST form──> ingest (asia-southeast1) ──Admin SDK──> Firestore
              OsmAnd protocol       dịch + kiểm tra              rules: chặn client
```

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `functions/src/index.ts` | HTTP handler, transaction ghi Firestore |
| `functions/src/parse.ts` | Dịch payload OsmAnd → bản ghi chuẩn hoá (thuần, có test) |
| `functions/src/auth.ts` | Kiểm tra shared token trong URL |
| `firestore.rules` | Chặn mọi truy cập trực tiếp từ client |
| `firestore.indexes.json` | Index collection-group cho `positions` |
| `functions/src/bootstrap.ts` | Tạo admin đầu tiên, tự vô hiệu sau đó |
| `web/` | Trang xem lộ trình trên bản đồ (React + Leaflet) |
| `web/src/map/track.ts` | Lọc, sắp xếp, cắt đoạn, đơn giản hoá đường (thuần, có test) |
| `test-ingest.sh` | Gửi đúng các loại request mà SDK gửi |

## Triển khai

### 1. Tạo project Firebase

Vào <https://console.firebase.google.com> → **Add project**. Sau khi tạo:

- **Firestore Database** → Create database → chọn location `asia-southeast1`
  (Singapore). **Location không đổi được về sau**, chọn kỹ.
- Chế độ nào cũng được, vì `firestore.rules` trong repo này sẽ ghi đè ở bước 5.
- Nâng lên gói **Blaze**: Settings → Usage and billing → Modify plan.
  Cloud Functions bắt buộc có Blaze. Thực tế hoá đơn sẽ là 0đ ở mức dùng cá nhân
  (free tier 2 triệu lượt gọi/tháng), nhưng vẫn phải gắn thẻ.

Nên đặt luôn **budget alert** ở mức 1–2 USD trong Google Cloud Billing để yên tâm.

### 2. Đăng nhập và chọn project

```bash
cd whereami_backend && npx firebase login
```

```bash
cd whereami_backend && npx firebase use --add
```

### 3. Đặt token bí mật

Sinh một chuỗi ngẫu nhiên:

```bash
openssl rand -hex 16
```

Nạp vào Secret Manager (dán chuỗi vừa sinh khi được hỏi):

```bash
cd whereami_backend && npx firebase functions:secrets:set INGEST_TOKEN
```

### 4. Khai báo tham số

`functions/.env` là **bắt buộc** — thiếu nó thì `firebase deploy` chạy ngoài
terminal tương tác sẽ dừng với lỗi "no value for the following environment
variables".

```
ALLOWED_DEVICE_IDS=
RETENTION_DAYS=90
```

Bỏ trống `ALLOWED_DEVICE_IDS` thì nhận mọi id; điền vào để chỉ nhận đúng thiết
bị của bạn (lấy deviceId ở màn hình chính của app, phân tách bằng dấu phẩy).
`RETENTION_DAYS=0` thì không đặt hạn xoá.

### 5. Deploy

```bash
cd whereami_backend && npx firebase deploy --only functions,firestore:rules,firestore:indexes
```

Kết thúc sẽ in ra URL dạng:

```
https://asia-southeast1-<project-id>.cloudfunctions.net/ingest
```

### 6. Dọn image cũ

Cloud Functions giữ lại container image của mỗi lần deploy và tính tiền lưu trữ.
Đặt chính sách tự xoá một lần là xong:

```bash
cd whereami_backend && npx firebase functions:artifacts:setpolicy --location asia-southeast1 --force
```

TTL xoá lịch sử vị trí thì đã khai trong `firestore.indexes.json`
(`fieldOverrides` → `expireAt`, `ttl: true`) nên deploy là tự áp dụng, không
cần bấm tay trong console.

### 7. Kiểm tra

```bash
cd whereami_backend && ./test-ingest.sh "https://asia-southeast1-<project-id>.cloudfunctions.net/ingest/<TOKEN>"
```

Kỳ vọng: các case hợp lệ trả `200 {"status":"ok"}`, case hỏng trả
`200 {"status":"ignored"}`, sai token trả `403`.

### 8. Trỏ app vào function

Trong app: **Settings → Server URL**, dán:

```
https://asia-southeast1-<project-id>.cloudfunctions.net/ingest/<TOKEN>
```

Token nằm ngay trong URL vì SDK không gửi được header tuỳ chỉnh. Bấm Save rồi
bật tracking. Xem log ở màn hình Status, hoặc:

```bash
cd whereami_backend && npx firebase functions:log --only ingest
```

## Chạy thử offline (không cần project thật)

```bash
cd whereami_backend && printf 'INGEST_TOKEN=local-test-token\n' > functions/.secret.local
```

```bash
cd whereami_backend/functions && npm install && npm run build
```

```bash
cd whereami_backend && npx firebase emulators:start --project demo-whereami --only functions,firestore
```

Emulator Firestore cần Java. Nếu máy chưa có, dùng JBR của Android Studio:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Rồi bắn thử:

```bash
cd whereami_backend && ./test-ingest.sh "http://127.0.0.1:5001/demo-whereami/asia-southeast1/ingest/local-test-token"
```

Xem dữ liệu tại <http://127.0.0.1:4000/firestore>.

Muốn app Android bắn vào emulator thì dùng `http://10.0.2.2:5001/...` (emulator
Android nhìn máy host qua địa chỉ này), hoặc IP LAN của máy Mac nếu là điện
thoại thật.

Android **chặn HTTP cleartext theo mặc định**, và biểu hiện duy nhất là dòng
`Upload error: Cleartext HTTP traffic ... not permitted` trong tab Log. Bản
debug của app đã bật `usesCleartextTraffic` sẵn cho việc này
(`app/src/debug/AndroidManifest.xml`); bản release thì không, và chỉ nói
chuyện được với HTTPS.

Đổi URL nhanh mà không phải gõ tay:

```bash
cd /Users/truonganim/code/android/WhereAmI && ~/Library/Android/sdk/platform-tools/adb shell am start -a android.intent.action.VIEW -d "whereami://config?url=http://10.0.2.2:5001/demo-whereami/asia-southeast1/ingest/local-test-token"
```

## Chạy unit test

```bash
cd whereami_backend/functions && npm test
```

## Cấu trúc dữ liệu

```
devices/{deviceId}
  deviceId, lastSeenAt, updatedAt
  battery, charging
  lastFixTime, lastFixTimeMs
  location            GeoPoint — vị trí mới nhất
  lastPosition        { lat, lon, accuracy, altitude, speed, bearing }
  lastAlarm           { type, time }

devices/{deviceId}/positions/{deviceId}_{giây}[_hb|_sos]
  time, timeMs, lat, lon, location, accuracy, altitude
  speed               m/s (wire format là knots, đã quy đổi)
  bearing, battery, charging, alarm
  heartbeat           true khi SDK gửi keep-alive không toạ độ
  receivedAt, expireAt
```

Doc id tất định theo `deviceId_giây` để lần retry ghi đè thay vì nhân bản —
SDK đảm bảo at-least-once chứ không phải exactly-once. Hậu tố `_hb` / `_sos`
tránh việc heartbeat hay SOS rơi trùng giây với một fix thường rồi đè lên nhau.

## Vì sao mã lỗi lại chọn như vậy

Vòng `syncLoop` trong `TrackerEngine.kt` của SDK chỉ `peek()` phần tử đầu hàng
đợi, xoá khi nhận 2xx và **giữ lại khi nhận bất kỳ mã nào khác**. Do đó:

| Tình huống | Trả về | Lý do |
|---|---|---|
| Ghi thành công | `200` | SDK xoá khỏi hàng đợi |
| Payload hỏng vĩnh viễn | `200 ignored` | Trả 4xx sẽ khiến SDK retry mãi và **kẹt cả hàng đợi** phía sau |
| Sai token | `403` | Dữ liệu nằm yên trong hàng đợi, sửa token xong là đẩy lên đủ |
| deviceId không nằm trong allow-list | `403` | Nếu lỡ quên khai báo thiết bị thật thì dữ liệu không bị mất âm thầm |
| Firestore lỗi | `503` | SDK retry với backoff 5s → 5 phút |

## Bảo mật

- Token nằm trong URL. Mà `serverUrl` lại được nhúng vào **QR chia sẻ config**,
  nên QR đó chính là chìa khoá ghi dữ liệu. Ổn cho phạm vi cá nhân/gia đình,
  không ổn nếu phát hành công khai.
- `firestore.rules` chặn `read, write` với mọi client. Chỉ Admin SDK phía
  function ghi được.
- `maxInstances: 10` chặn trần chi phí nếu URL bị lộ và có người spam.
- Không dùng được App Check vì cơ chế đó cần custom header.
- Đổi token: chạy lại `functions:secrets:set`, deploy, rồi cập nhật `serverUrl`
  trong app. Dữ liệu đang nằm trong hàng đợi trên máy sẽ tự đẩy lên sau đó.

## Chi phí tham khảo

Một thiết bị báo mỗi 5 phút ≈ 8.600 lượt gọi/tháng, mỗi lượt 1 read + 2 write.
Free tier: 2 triệu lượt gọi/tháng, 20.000 write + 50.000 read mỗi ngày.
Còn rất xa mới chạm trần.


## Trang xem bản đồ

<https://whereami-1c55e.web.app>

React + Leaflet + tile OpenStreetMap, đọc thẳng Firestore qua Firebase Auth.

### Phân quyền

Quyền gắn theo **địa chỉ e-mail**, nên cấp được cho người chưa từng đăng nhập.

```
access/{email}    { role: 'admin' | 'viewer', addedBy, addedAt }
config/access     { allowAllAuthenticated: bool }
config/map        mặc định hiển thị cho mọi viewer
```

- Tài khoản chưa được cấp quyền vẫn đăng nhập được, nhưng thấy màn hình báo
  cần liên hệ quản trị viên.
- Admin quản lý danh sách ngay trong tab **Quản trị** của web.
- Công tắc **Mở cho tất cả** cho phép mọi tài khoản Google đăng nhập đều xem
  được, không cần có tên trong danh sách.

### Tạo admin đầu tiên

Rules chỉ cho admin ghi vào `access/`, mà lúc đầu chưa có admin nào. Endpoint
`bootstrap` giải quyết đúng một lần:

```bash
curl -X POST -d "email=ban@gmail.com" \
  https://asia-southeast1-whereami-1c55e.cloudfunctions.net/bootstrap/<TOKEN>
```

Sau khi đã có admin, endpoint này chỉ còn trả 409 nên không phải cửa hậu.

### Cài đặt hiển thị

Mọi lựa chọn gây tranh cãi đều là setting, không hard-code. Mặc định nằm ở
`config/map` (admin sửa được ngay trên web, không cần deploy lại), mỗi người
xem có thể ghi đè riêng và lưu trong localStorage của trình duyệt mình.

Đáng chú ý là **cách xử lý khoảng trống**: khi máy đứng yên, SDK tắt GPS nên
dữ liệu có lỗ hổng hàng giờ. `gapBehavior` chọn giữa *ngắt đoạn* (đúng với dữ
liệu thật) và *nối thẳng* (đường liền mạch nhưng là suy đoán). Số liệu thống kê
không đổi giữa hai chế độ.

`tileUrl` cũng nằm trong remote config, nên đổi nhà cung cấp bản đồ chỉ là sửa
một ô trong tab Quản trị.

### Phát triển tại chỗ

```bash
cd whereami_backend/web && npm install && npm run dev
```

```bash
cd whereami_backend/web && npm test
```
