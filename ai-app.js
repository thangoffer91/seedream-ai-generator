const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';

function aiApp() {
  return {
    prompt: '',
    imageSlots: [],
    results: [],
    loading: false,
    errorMessage: '',
    modalImage: null,

    init() {
      console.log('🟢 App khởi tạo (Dark Theme)');
      this.addImageSlot();
      this.loadHistory();
    },

    addImageSlot() {
      const id = Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      this.imageSlots.push({ id, file: null, preview: null });
    },

    handleFileSelect(slot, event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => (slot.preview = e.target.result);
      reader.readAsDataURL(file);
      slot.file = file;
    },

    deleteImageSlot(id) {
      this.imageSlots = this.imageSlots.filter((s) => s.id !== id);
    },

    async generateImage() {
      if (!this.prompt.trim()) {
        this.showError('⚠️ Nhập prompt trước khi tạo ảnh!');
        return;
      }
      const uploaded = this.imageSlots.filter((s) => s.file);
      if (uploaded.length === 0) {
        this.showError('⚠️ Hãy chọn ít nhất 1 ảnh!');
        return;
      }

      this.loading = true;
      this.errorMessage = '';

      try {
        const images = await Promise.all(
          uploaded.map(async (s) => ({
            base64: await this.fileToBase64(s.file),
            filename: s.file.name,
            mimetype: s.file.type,
          }))
        );

        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: this.prompt, images }),
        });

        if (!res.ok) throw new Error('Webhook lỗi ' + res.status);
        const data = await res.json();
        const url = data.imageUrl || data.url || data.fileUrl;
        if (!url) throw new Error('Không nhận URL ảnh từ server');

        this.results.unshift(url);
        this.saveToHistory(url);
      } catch (e) {
        this.showError('❌ ' + e.message);
      } finally {
        this.loading = false;
      }
    },

    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    showError(msg) {
      this.errorMessage = msg;
      setTimeout(() => (this.errorMessage = ''), 4000);
    },

    openModal(url) {
      let modal = document.querySelector('#aiImageModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'aiImageModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-overlay"></div>
          <div class="modal-content-box">
            <span class="close-btn">&times;</span>
            <img class="modal-image" />
            <a class="download-btn" href="#" download target="_blank">Tải ảnh về</a>
          </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-btn').addEventListener('click', () => window.closeModal());
        modal.querySelector('.modal-overlay').addEventListener('click', () => window.closeModal());
      }
      modal.querySelector('.modal-image').src = url;
      modal.querySelector('.download-btn').href = url;
      modal.style.display = 'flex';
    },

    closeModal() {
      const modal = document.querySelector('#aiImageModal');
      if (modal) modal.style.display = 'none';
    },

    saveToHistory(url) {
      const item = { url, time: Date.now() };
      const history = JSON.parse(sessionStorage.getItem('ai_image_history') || '[]');
      history.unshift(item);
      sessionStorage.setItem('ai_image_history', JSON.stringify(history));
      window.dispatchEvent(new Event('ai-history-updated'));
    },

    loadHistory() {
      const raw = JSON.parse(sessionStorage.getItem('ai_image_history') || '[]');
      const now = Date.now();
      const valid = raw.filter((h) => now - h.time < 24 * 60 * 60 * 1000);
      sessionStorage.setItem('ai_image_history', JSON.stringify(valid));
      this.results = valid.map((h) => h.url);
    },
  };
}

function aiAppHistory() {
  return {
    history: [],
    init() {
      this.load();
      window.addEventListener('ai-history-updated', () => this.load());
    },
    load() {
      const data = JSON.parse(sessionStorage.getItem('ai_image_history') || '[]');
      const now = Date.now();
      this.history = data.filter((h) => now - h.time < 24 * 60 * 60 * 1000);
    },
    openModal(url) {
      if (window.openModal) window.openModal(url);
    },
  };
}

window.openModal = (url) => {
  const modal = document.querySelector('#aiImageModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.querySelector('.modal-image').src = url;
    modal.querySelector('.download-btn').href = url;
  }
};

window.closeModal = () => {
  const modal = document.querySelector('#aiImageModal');
  if (modal) modal.style.display = 'none';
};

window.aiApp = aiApp;
window.aiAppHistory = aiAppHistory;
console.log('🌙 Dark theme app loaded');
