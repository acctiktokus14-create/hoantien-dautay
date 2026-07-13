// lib/botData.js
//
// [Khôi phục lại đúng cơ chế của web cũ "hoan-vi-web-main"/"phuongthaovip"]
//
// donhang/vitien/danhan giờ đọc TRỰC TIẾP từ API của ThuDauTay
// (mặc định https://thudautay.vercel.app/api/data/<type>) — GIỐNG HỆT cách
// hoan-vi-web-main cũ đọc từ phuongthaovip — thay vì chỉ trông chờ vào việc
// project ThuDauTay có POST đúng dữ liệu sang qua /api/sync-data hay không
// (DAUTAY_SYNC_URL) và/hoặc 2 project có trỏ đúng CHUNG 1 Upstash Redis hay
// không. Lý do quay lại cách này: dễ cấu hình sai 2 biến kia (quên set,
// gõ sai domain, SYNC_SECRET lệch...) khiến hoantien-dautay hiện đơn hàng
// rỗng dù dữ liệu vẫn có bên ThuDauTay — gọi thẳng API của ThuDauTay đảm bảo
// hoantien-dautay luôn thấy ĐÚNG dữ liệu bot đang có, không cần đoán.
//
// Nếu gọi ThuDauTay lỗi/timeout → fallback về Upstash Redis riêng của
// hoantien-dautay (dữ liệu được đồng bộ qua POST /api/sync-data nếu có cấu
// hình DAUTAY_SYNC_URL) để trang không bị sập hẳn.
//
// Bảng "users" (đăng ký/đăng nhập My ID) vẫn nằm trong Supabase như cũ,
// KHÔNG đổi — xem lib/supabase.js.

const VALID_KEYS = ["donhang_by_subid", "vitien_by_subid", "danhan_by_subid"];
const VALID_TYPES = ["donhang", "vitien", "danhan"];

// Khớp với VERCEL_BASE_URL trong bot_data_loader.py / README của ThuDauTay.
// Có thể override bằng biến môi trường THUDAUTAY_BASE_URL trên Vercel nếu
// domain của project ThuDauTay đổi khác domain mặc định bên dưới.
const THUDAUTAY_BASE_URL =
  process.env.THUDAUTAY_BASE_URL || "https://thudautay.vercel.app";

// donhang_by_subid -> "donhang", vitien_by_subid -> "vitien", danhan_by_subid -> "danhan"
const REMOTE_TYPE_BY_KEY = {
  donhang_by_subid: "donhang",
  vitien_by_subid: "vitien",
  danhan_by_subid: "danhan",
};

export function keyForType(type) {
  return `${type}_by_subid`;
}

/** GET {THUDAUTAY_BASE_URL}/api/data/<type> — giống hệt cách hoan-vi-web-main
 * cũ gọi phuongthaovip. Trả về null nếu lỗi/timeout (để code gọi fallback). */
async function fetchFromThuDauTay(type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${THUDAUTAY_BASE_URL}/api/data/${type}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[fetchFromThuDauTay] ${type} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data;
  } catch (err) {
    console.warn(`[fetchFromThuDauTay] ${type} lỗi:`, err?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Thiếu UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN trong biến môi trường."
    );
  }
  return { url, token };
}

/** Đọc 1 khoá bất kỳ trong Upstash Redis, tự parse JSON nếu value là chuỗi JSON. */
async function kvGet(key) {
  const { url, token } = upstashConfig();
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash GET "${key}" lỗi ${res.status}: ${text}`);
  }
  const json = await res.json();
  let result = json.result ?? null;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      return null;
    }
  }
  return result;
}

/** Ghi 1 khoá bất kỳ trong Upstash Redis (value được JSON.stringify trước khi lưu). */
async function kvSet(key, value) {
  const { url, token } = upstashConfig();
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(valueStr),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash SET "${key}" lỗi ${res.status}: ${text}`);
  }
  return true;
}

/** Đọc 1 blob JSON (donhang_by_subid | vitien_by_subid | danhan_by_subid).
 *
 * Luôn ƯU TIÊN gọi API của ThuDauTay trước (giống hệt web cũ) → fallback về
 * Upstash Redis riêng của hoantien-dautay nếu ThuDauTay lỗi/timeout. */
export async function getBotData(key) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`bot_data key không hợp lệ: ${key}`);
  }

  const remoteType = REMOTE_TYPE_BY_KEY[key];
  if (remoteType) {
    const remoteData = await fetchFromThuDauTay(remoteType);
    if (remoteData) return remoteData;
    console.warn(
      `[getBotData] Không lấy được "${remoteType}" từ ThuDauTay, fallback Redis riêng...`
    );
  }

  try {
    const data = await kvGet(key);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (err) {
    console.warn(`[getBotData] Fallback Redis "${key}" cũng lỗi:`, err?.message || err);
    return {};
  }
}

/** Đọc cả 3 blob cùng lúc — dùng cho trang dashboard. */
export async function getAllBotData() {
  const [donhang, vitien, danhan] = await Promise.all([
    getBotData("donhang_by_subid"),
    getBotData("vitien_by_subid"),
    getBotData("danhan_by_subid"),
  ]);
  return { donhang, vitien, danhan };
}

/** Ghi đè 1 blob JSON (được gọi từ /api/sync-data khi bot/uploader đẩy dữ liệu lên). */
export async function setBotData(type, value) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`type không hợp lệ: ${type}`);
  }
  const key = keyForType(type);
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const count = Object.keys(safeValue).length;
  const updated_at = new Date().toISOString();

  console.log("[setBotData] Chuẩn bị ghi vào Upstash Redis:", { key, count });

  await kvSet(key, safeValue);
  // Lưu thêm meta_<type> để dễ kiểm tra lần đồng bộ gần nhất từ Upstash
  // console nếu cần.
  await kvSet(`meta_${type}`, { updated_at, count });

  return { key, count };
}
