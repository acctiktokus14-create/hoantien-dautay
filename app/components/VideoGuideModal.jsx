"use client";

// Modal hiển thị video "Hướng dẫn tạo link hoàn tiền".
// Giao diện lấy theo khung điện thoại giống AddToHomeScreenModal (video ở
// ngoài trang đăng nhập), nhưng KHÔNG có nút "Không hiển thị lại (vĩnh viễn)"
// vì modal này chỉ mở khi khách tự bấm vào chữ "Video hướng dẫn", không tự
// động hiện khi vào trang.
export default function VideoGuideModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3"
      onClick={onClose}
    >
      {/* Khung điện thoại — chặn sự kiện click nổi bọt để bấm vào trong
          khung không bị đóng modal ngoài ý muốn. */}
      <div
        className="relative w-full max-w-[300px] rounded-[46px] bg-gradient-to-b from-rose-300 via-pink-300 to-orange-200 p-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* nút nguồn/âm lượng trang trí */}
        <div className="absolute -left-[3px] top-20 h-8 w-[3px] rounded-full bg-rose-400/70" />
        <div className="absolute -left-[3px] top-32 h-12 w-[3px] rounded-full bg-rose-400/70" />
        <div className="absolute -right-[3px] top-28 h-16 w-[3px] rounded-full bg-rose-400/70" />

        {/* màn hình */}
        <div className="relative flex max-h-[92dvh] flex-col overflow-hidden rounded-[38px] bg-white p-4 pt-8 text-center">
          {/* dynamic island */}
          <div className="absolute left-1/2 top-2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-neutral-900/90" />

          {/* nút đóng góc phải */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
          >
            ✕
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            <div className="mb-1 text-2xl">🎀</div>
            <h2 className="mb-3 font-display text-[15px] font-semibold leading-snug text-neutral-800">
              Hướng dẫn tạo link hoàn tiền
            </h2>

            <video
              src="/huong-dan-tao-link.mp4"
              className="mx-auto w-full rounded-2xl object-contain"
              controls
              autoPlay
              playsInline
            />
          </div>

          <div className="mt-3 flex flex-shrink-0 flex-col gap-2">
            <button
              onClick={onClose}
              className="rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105"
            >
              Đã hiểu ✨
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
