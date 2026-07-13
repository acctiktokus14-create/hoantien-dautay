// lib/botData.js
//
// [Bản hoantien-dautay — web độc lập, KHÔNG dùng chung dữ liệu với
// phuongthaovip/hoan-vi-web cũ]
//
// donhang_by_subid / vitien_by_subid / danhan_by_subid đọc THẲNG từ Upstash
// Redis riêng của web này (UPSTASH_REDIS_REST_URL/TOKEN trong biến môi
// trường). Dữ liệu được ghi vào Redis này bởi chính bot/uploader riêng của
// hệ thống (project "thudautay") mỗi khi gọi POST /api/sync-data.
//
// Mặc định KHÔNG gọi sang bất kỳ web nào khác (như phuongthaovip.vercel.app)
// để tránh lấy nhầm dữ liệu của hệ thống khác. Nếu sau này bạn có 1 API
// nguồn riêng muốn ưu tiên đọc trước Redis, có thể đặt biến môi trường
// REMOTE_SYNC_BASE_URL trỏ tới domain đó — để trống (mặc định) thì code chỉ
// đọc Redis, không gọi ra ngoài.
//
// Bảng "users" (đăng ký/đăng nhập My ID) vẫn nằm trong Supabase như cũ,
// KHÔNG đổi — xem lib/supabase.js.

const VALID_KEYS = ["donhang_by_subid", "vitien_by_subid", "danhan_by_subid"];
const VALID_TYPES = ["donhang", "vitien", "danhan"];

// Nếu muốn đọc dữ liệu từ 1 web nguồn khác thay vì Redis, đặt biến môi
// trường REMOTE_SYNC_BASE_URL trên Vercel. Mặc định để trống — nghĩa là
// KHÔNG gọi ra ngoài, chỉ đọc thẳng Redis riêng của web này.
const REMOTE_SYNC_BASE_URL = process.env.REMOTE_SYNC_BASE_URL || "";

// donhang_by_subid -> "donhang", vitien_by_subid -> "vitien", danhan_by_subid -> "danhan"
//
// Chỉ dùng để gọi ra ngoài NẾU REMOTE_SYNC_BASE_URL được cấu hình. Mặc định
// (REMOTE_SYNC_BASE_URL rỗng) code bỏ qua bước này và đọc thẳng Redis.
const REMOTE_TYPE_BY_KEY = {
  donhang_by_subid: "donhang",
  vitien_by_subid: "vitien",
  danhan_by_subid: "danhan",
};

export function keyForType(type) {
  return `${type}_by_subid`;
}

/** GET {REMOTE_SYNC_BASE_URL}/api/data/<type> — CHỈ chạy nếu bạn có cấu hình
 * REMOTE_SYNC_BASE_URL. Mặc định biến này rỗng nên hàm trả về null ngay,
 * để getBotData() đọc thẳng Redis riêng bên dưới. */
async function fetchFromRemoteSync(type) {
  if (!REMOTE_SYNC_BASE_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${REMOTE_SYNC_BASE_URL}/api/data/${type}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[fetchFromRemoteSync] ${type} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data;
  } catch (err) {
    console.warn(`[fetchFromRemoteSync] ${type} lỗi:`, err?.message || err);
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
 * Mặc định đọc THẲNG Redis riêng của web này. Chỉ gọi ra ngoài (qua
 * REMOTE_SYNC_BASE_URL) nếu bạn có cấu hình biến đó — dùng cho trường hợp
 * đặc biệt muốn ưu tiên 1 nguồn khác trước Redis. */
export async function getBotData(key) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`bot_data key không hợp lệ: ${key}`);
  }

  const remoteType = REMOTE_TYPE_BY_KEY[key];
  if (remoteType && REMOTE_SYNC_BASE_URL) {
    const remoteData = await fetchFromRemoteSync(remoteType);
    if (remoteData) return remoteData;
    console.warn(
      `[getBotData] Không lấy được "${remoteType}" từ REMOTE_SYNC_BASE_URL, fallback Redis riêng...`
    );
  }

  try {
    const data = await kvGet(key);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (err) {
    console.warn(`[getBotData] Đọc Redis "${key}" lỗi:`, err?.message || err);
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
