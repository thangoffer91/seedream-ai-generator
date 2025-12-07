console.log("🚀 AI App initializing...");

const WEBHOOK_URL = "https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855";

function aiApp() {
  return {
    prompt: "",
    imageSlots: [],
    results: [],
    loading: false,
    errorMessage: "",
    modalImage: null,

    init() {
      console.log("✅ App initialized");
      this.addImageSlot();
      this.loadHistory();
    },

    addImageSlot() {
      const id = Date.now() + "-" + Math.random().toString(36).substr(2, 5);
      this.imageSlots.push({ id, file: null, preview: null });
    },

    handleFileSelect(slot, e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (x) => (slot.preview = x.target.result);
      reader.readAsDataURL(file);
      slot.file = file;
    },

    deleteImageSlot(id) {
      this.imageSlots = this.imageSlots.filter((s) => s.id !== id);
    },

    async fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    async generateImage() {
      if (!this.prompt.trim()) return this.showError("⚠️ Nhập prompt!");
      const uploaded = this.imageSlots.filter((s) => s.file);
      if (uploaded.length === 0) return this.showError("⚠️ Chọn ít nhất 1 ảnh!");
      this.loading = true;
      try {
        const imgs = await Promise.all(
          uploaded.map(async (s) => ({
            base64: await this.fileToBase64(s.file),
            filename: s.file.name,
            mimetype: s.file.type,
          }))
        );
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: this.prompt, images: imgs }),
        });
        const data = await res.json();
        const url = data.imageUrl || data.url || data.fileUrl;
        if (!url) throw new Error("Không có URL ảnh trả về");
        this.results.unshift(url);
        this.saveToHistory(url);
      } catch (e) {
        this.showError("❌ " + e.message);
      } finally {
        this.loading = false;
      }
    },

    showError(msg) {
      this.errorMessage = msg;
      setTimeout(() => (this.errorMessage = ""), 4000);
    },

    openModal(url) {
      let modal = document.querySelector("#aiModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "aiModal";
        modal.className = "modal";
        modal.innerHTML = `
          <div class="modal-overlay"></div>
          <div class="modal-content-box">
            <span class="close-btn">&times;</span>
            <img class="modal-image" />
            <a class="download-btn" href="#" download target="_blank">Tải ảnh về</a>
          </div>`;
        document.body.appendChild(modal);
        modal.querySelector(".close-btn").addEventListener("click", () => this.closeModal());
        modal.querySelector(".modal-overlay").addEventListener("click", () => this.closeModal());
      }
      modal.querySelector(".modal-image").src = url;
      modal.querySelector(".download-btn").href = url;
      modal.style.display = "flex";
    },

    closeModal() {
      const m = document.querySelector("#aiModal");
      if (m) m.style.display = "none";
    },

    saveToHistory(url) {
      const history = JSON.parse(sessionStorage.getItem("ai_image_history") || "[]");
      history.unshift({ url, time: Date.now() });
      sessionStorage.setItem("ai_image_history", JSON.stringify(history));
      window.dispatchEvent(new Event("ai-history-updated"));
    },

    loadHistory() {
      const raw = JSON.parse(sessionStorage.getItem("ai_image_history") || "[]");
      const now = Date.now();
      const valid = raw.filter((h) => now - h.time < 24 * 60 * 60 * 1000);
      sessionStorage.setItem("ai_image_history", JSON.stringify(valid));
      this.results = valid.map((h) => h.url);
    },
  };
}

function aiAppHistory() {
  return {
    history: [],
    init() {
      this.load();
      window.addEventListener("ai-history-updated", () => this.load());
    },
    load() {
      const data = JSON.parse(sessionStorage.getItem("ai_image_history") || "[]");
      const now = Date.now();
      this.history = data.filter((h) => now - h.time < 24 * 60 * 60 * 1000);
    },
    openModal(url) {
      if (window.appInstance) window.appInstance.openModal(url);
    },
  };
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("⚙️ Mounting app...");
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="container" x-data="aiApp()" x-init="init()">
      <h1>🎨 AI Image Generator</h1>

      <textarea x-model="prompt" placeholder="Mô tả ảnh bạn muốn tạo..."></textarea>

      <div>
        <button class="add-image-btn" @click="addImageSlot()">➕ Thêm ảnh</button>
        <template x-for="slot in imageSlots" :key="slot.id">
          <div class="image-item">
            <div class="image-preview">
              <template x-if="slot.preview">
                <img :src="slot.preview" />
              </template>
              <template x-if="!slot.preview">
                <span>Chưa chọn ảnh</span>
              </template>
            </div>
            <button class="btn-upload" @click="document.getElementById('file-'+slot.id).click()">📁 Chọn ảnh</button>
            <button class="btn-delete" @click="deleteImageSlot(slot.id)">🗑️ Xóa</button>
            <input type="file" accept="image/*" :id="'file-'+slot.id" @change="handleFileSelect(slot, $event)" hidden />
          </div>
        </template>
      </div>

      <button class="btn-generate" @click="generateImage()" :disabled="loading">
        <span x-show="!loading">🚀 Tạo ảnh</span>
        <span x-show="loading">✨ Đang xử lý...</span>
      </button>

      <div x-show="results.length > 0">
        <h3>Kết quả</h3>
        <template x-for="url in results" :key="url">
          <img :src="url" class="result-thumb" @click="openModal(url)">
        </template>
      </div>
    </div>

    <div class="history-panel" x-data="aiAppHistory()" x-init="init()">
      <h3>🕒 Lịch sử ảnh</h3>
      <template x-for="item in history" :key="item.url">
        <img :src="item.url" class="result-thumb" @click="openModal(item.url)">
      </template>
    </div>`;
  Alpine.start();
  console.log("✅ Alpine running");
});
