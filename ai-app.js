// ===============================
// AI IMAGE GENERATOR APP
// ===============================

// URL webhook n8n của bạn
const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';

// -------------------------------
// APP CHÍNH
// -------------------------------
function aiApp() {
  return {
    prompt: '',
    imageSlots: [],
    results: [],
    loading: false,
    errorMessage: '',
    modalImage: null,

    // Khởi tạo
    init() {
      console.log('Alpine App initialized');
      this.addImageSlot();
      this.loadHistory();
    },

    // Thêm slot ảnh
    addImageSlot() {
      const id = Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      this.imageSlots.push({ id, file: null, preview: null });
    },

    // Xử lý chọn file ảnh
    handleFileSelect(slot, event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        slot.preview = e.target.result;
      };
      reader.readAsDataURL(file);
      slot.file = file;
    },

    // Xóa slot
    deleteImageSlot(id) {
      this.imageSlots = this.imageSlots.filter((s) => s.id !== id);
    },

    // Đọc file sang base64
    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    // Gửi request đến webhook
    async generateImage() {
      if (!this.prompt.trim()) {
        this.showError('Vui lòng nhập prompt!');
        return;
      }

      const uploaded = this.imageSlots.filter((s) => s.file);
      if (uploaded.length === 0) {
        this.showError('Vui lòng chọn ít nhất một ảnh!');
        return;
      }

      this.loading = true;
      this.errorMessage = '';

      try {
        const images = await Promise.all(
          uploaded.map(async (s) => ({
            base64: await this.fileToBase64(s.file),
            filename: s.file.name,
            mimetype: s.file.type
          }))
        );

        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: this.prompt, images })
        });

        if (!response.ok) throw new Error(`Webhook trả về lỗi ${response.status}`);

        const result = await response.json();
        const url = result.imageUrl || result.url || result.fifeUrl;

        if (!url) throw new Error('Không nhận được URL ảnh từ server.');

        this.results.push(url);
        this.saveToHistory(url);
      } catch (err) {
        console.error(err);
        this.showError('Có lỗi xảy ra: ' + err.message);
      } finally {
        this.loading = false;
      }
    },

    // Hiển thị lỗi
    showError(msg) {
      this.errorMessage = msg;
      setTimeout(() => (this.errorMessage = ''), 4000);
    },

    // Popup ảnh lớn
    openModal(url) {
      this.modalImage = url;
    },
    closeModal() {
      this.modalImage = null;
    },

    // -------------------------------
    // LỊCH SỬ ẢNH
    // -------------------------------
    saveToHistory(url) {
      const item = { url, time: Date.now() };
      const history = JSON.parse(localStorage.getItem('ai_image_history') || '[]');

      history.push(item);
      localStorage.setItem('ai_image_history', JSON.stringify(history));
    },

    loadHistory() {
      const historyRaw = JSON.parse(localStorage.getItem('ai_image_history') || '[]');
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      // Giữ lại ảnh chưa quá 24h
      const validHistory = historyRaw.filter((h) => now - h.time < ONE_DAY);
      localStorage.setItem('ai_image_history', JSON.stringify(validHistory));

      // Gán vào kết quả hiển thị
      this.results = validHistory.map((h) => h.url);
    }
  };
}

// -------------------------------
// PANEL LỊCH SỬ
// -------------------------------
function aiAppHistory() {
  return {
    history: [],

    init() {
      console.log('Alpine App initialized');
      this.load();
    },

    load() {
      const data = JSON.parse(localStorage.getItem('ai_image_history') || '[]');
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      this.history = data.filter((h) => now - h.time < ONE_DAY);
    }
  };
}

// -------------------------------
// HÀM GLOBAL CHO POPUP
// -------------------------------
window.openModal = (url) => {
  const appRoot = document.querySelector('[x-data]');
  if (appRoot && appRoot.__x) {
    appRoot.__x.$data.modalImage = url;
  }
};

// -------------------------------
// GẮN RA GLOBAL
// -------------------------------
window.aiApp = aiApp;
window.aiAppHistory = aiAppHistory;

console.log('ai-app.js loaded');
