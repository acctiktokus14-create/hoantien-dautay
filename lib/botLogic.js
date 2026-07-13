/**
 * lib/botLogic.js
 * ────────────────────────────────────────────────────────────────
 * Port 1:1 từ logic tính ví tiền / đơn hàng trong bot_v23.py
 * (hàm _calc_vitien, _get_da_nhan, _load_da_nhan, _format_donhang).
 *
 * ⚠️ Nếu sau này sửa công thức trong bot_v23.py, nhớ sửa lại y hệt ở đây,
 * để web và bot luôn hiển thị cùng 1 con số cho cùng 1 My ID / sub_id.
 * ────────────────────────────────────────────────────────────────
 */

// Chuẩn hoá key da_nhan: mỗi sub_id map sang {t0: n, t6: n, t7: n, ...}
// (t0 = ghi cũ trước khi tách theo tháng, t<N> = tháng N trong năm)
function normalizeDaNhanEntry(raw) {
  if (raw == null) return {};
  if (typeof raw === "number") return { t0: raw };
  if (typeof raw === "object") {
    const out = {};
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
    return out;
  }
  return {};
}

/** Tổng đã nhận của 1 sub_id. thang=0 → cộng tất cả các tháng đã ghi. */
export function getDaNhan(daNhanData, subId, thang = 0) {
  const entry = normalizeDaNhanEntry(daNhanData?.[subId]);
  if (!entry || Object.keys(entry).length === 0) return 0;
  if (thang === 0) {
    const total = Object.values(entry).reduce((s, v) => s + v, 0);
    return Math.round(total * 100) / 100;
  }
  return Math.round((entry[`t${thang}`] || 0) * 100) / 100;
}

function parseNgayHoanThanh(ngayStr) {
  if (!ngayStr) return null;
  // Hỗ trợ "YYYY-MM-DD HH:MM:SS" hoặc "YYYY-MM-DD"
  const m = String(ngayStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysSince(date) {
  if (!date) return 0;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((a - b) / 86400000);
}

/**
 * Tính ví tiền cho 1 sub_id — giống hệt _calc_vitien() trong bot_v23.py:
 *   co_the_rut = tổng (hoa_hong * 90% * 80%) của đơn hoàn thành >= 1 ngày
 *   co_the_rut_hien = co_the_rut - da_nhan (không âm)
 * Trả về null nếu sub_id không có trong vitien_data (giống bot).
 */
export function calcVitien(vitienData, daNhanData, subId) {
  const v = vitienData?.[subId];
  if (!v) return null;

  const dangCho = Number(v.dang_cho || 0);

  let hoanThanhChuaRut = 0;
  let coTheRut = 0;
  for (const don of v.don_hoan_thanh || []) {
    const hh = Number(don.hoa_hong_rong ?? don.hoa_hong ?? 0);
    const ngayHT = parseNgayHoanThanh(don.ngay_hoan_thanh);
    const soNgay = ngayHT ? daysSince(ngayHT) : 0;
    if (soNgay >= 1) {
      coTheRut = Math.round((coTheRut + Math.round(hh * 0.9 * 0.8 * 100) / 100) * 100) / 100;
    } else {
      hoanThanhChuaRut = Math.round((hoanThanhChuaRut + hh) * 100) / 100;
    }
  }

  const daNhan = getDaNhan(daNhanData, subId, 0);
  const coTheRutHien = Math.max(0, Math.round((coTheRut - daNhan) * 100) / 100);

  return {
    dangCho,
    hoanThanhChuaRut,
    coTheRut,
    coTheRutHien,
    daNhan,
  };
}

function shortenName(name, limit = 60) {
  const cleaned = String(name || "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .trim()
    .replace(/\s+/g, " ");
  let cost = 0;
  let out = "";
  for (const ch of cleaned) {
    const w = ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 1.3 : 1.0;
    if (cost + w > limit) return out + "...";
    out += ch;
    cost += w;
  }
  return out;
}

/**
 * Lấy danh sách đơn hàng của 1 sub_id, sắp mới nhất trước — giống dữ liệu
 * hiển thị bởi lệnh #donhang trong bot (không kèm text formatting của Zalo).
 */
export function listDonHang(donhangData, subId) {
  const entry = donhangData?.[subId];
  if (!entry || !Array.isArray(entry.don_hang)) return [];

  return [...entry.don_hang]
    .sort((a, b) => String(b.ngay_dat_hang || "").localeCompare(String(a.ngay_dat_hang || "")))
    .map((don) => ({
      id: don.id_don_hang || "",
      productName: don.ten_san_pham_rut_gon || shortenName(don.ten_san_pham || ""),
      commission: Number(don.hoa_hong_rong || 0),
      status: don.trang_thai || "",
      orderedAt: don.ngay_dat_hang || null,
      completedAt: don.ngay_hoan_thanh || null,
    }));
}
