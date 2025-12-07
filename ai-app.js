function aiApp() {
  return {
    WEBHOOK_URL: 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855',

    prompt: '',
    imageSlots: [],
    loading: false,
    errorMessage: '',
    results: [],
    modalImage: null,

    init() {
      this.addImageSlot();
    },

    addImageSlot() {
      const id = Date.now() + '-' + Math.random().toString(36).slice(2);
      this.imageSlots.push({ id, file: null, preview: null });
    },

    deleteImageSlot(id) {
      this.imageSlots = this.imageSlots.filter(slot => slot.id !== id);
    },

    handleFileSelect(slot, event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => slot.preview = e.target.result;
      reader.readAsDataURL(file);
      slot.file = file;
    },

    async fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    showError(message) {
      this.errorMessage = message;
      setTimeout(() => (this.errorMessage = ''), 4000);
    },

    async generateImage() {
      if (!this.prompt.trim()) return this.showError('Vui lòng nhập prompt!');
      const files = this.imageSlots.filter(s => s.file);
      if (files.length === 0) return this.showError('Vui lòng upload ít nhất 1 ảnh!');
      
      this.loading = true;
      try {
        const images = await Promise.all(
          files.map(async f => ({
            base64: await this.fileToBase64(f.file),
            filename: f.file.name,
            mimetype: f.file.type
          }))
        );

        const res = await fetch(this.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: this.prompt, images })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const imageUrl = data.imageUrl || data.fifeUrl || data.url;

        if (!imageUrl) throw new Error('Không nhận được URL ảnh từ server');

        this.results.unshift(imageUrl);
        saveHistory(imageUrl);

      } catch (err) {
        console.error(err);
        this.showError(err.message);
      } finally {
        this.loading = false;
      }
    },

    openModal(url) {
      this.modalImage = url;
    },

    closeModal() {
      this.modalImage = null;
    }
  };
}

// Lưu lịch sử ảnh (dùng localStorage)
function aiAppHistory() {
  return {
    history: loadHistory(),
    openModal(url) {
      const app = Alpine.store('main');
      app.modalImage = url;
    }
  };
}

function saveHistory(url) {
  const key = 'ai_image_history';
  const history = loadHistory();
  history.unshift(url);
  localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('ai_image_history') || '[]');
  } catch {
    return [];
  }
}
