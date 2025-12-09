console.log("🚀 AI App initializing...");

// ===== CONFIGURATION =====
const CONFIG = {
  WEBHOOK_URL: "https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855",
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  MAX_COMPRESSED_SIZE: 2 * 1024 * 1024,
  REQUEST_TIMEOUT: 150000,
  MAX_HISTORY_ITEMS: 50,
  HISTORY_EXPIRY: 24 * 60 * 60 * 1000,
  MAX_IMAGE_DIMENSION: 1920,
  COMPRESSION_QUALITY: 0.85,
  RATE_LIMIT_DELAY: 2000,
};

// ===== UTIL =====
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function formatTime(date) {
  return new Date(date).toLocaleString("vi-VN");
}

// ===== MAIN APP (Alpine) =====
function aiApp() {
  return {
    // STATE
    prompt: "",
    negativePrompt: "",
    aspectRatio: "landscape",
    imageSlots: [],
    isGenerating: false,
    elapsedTime: "",
    timerInterval: null,
    errorMessage: "",
    successMessage: "",
    history: [],
    results: [],
    showModal: false,
    selectedResult: null,

    get hasAnyImage() {
      return this.imageSlots.some(s => !!s.file);
    },

    // INIT
    init() {
      this.addImageSlot(); // ít nhất 1 slot
      this.loadHistory();
      this.loadResults();
    },

    // IMAGE SLOTS
    addImageSlot() {
      this.imageSlots.push({
        id: uuid(),
        file: null,
        previewUrl: "",
        sizeInfo: "",
      });
    },

    clearImageSlot(index) {
      const slot = this.imageSlots[index];
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      this.imageSlots[index] = {
        id: slot.id,
        file: null,
        previewUrl: "",
        sizeInfo: "",
      };
    },

    handleFileChange(event, index) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.size > CONFIG.MAX_FILE_SIZE) {
        this.showError(`File quá lớn (>${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB).`);
        event.target.value = "";
        return;
      }

      const slot = this.imageSlots[index];
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);

      const url = URL.createObjectURL(file);
      this.imageSlots[index].file = file;
      this.imageSlots[index].previewUrl = url;
      this.imageSlots[index].sizeInfo = `${(file.size / 1024).toFixed(1)} KB`;
    },

    // GENERATE
    async generateImage() {
      if (this.isGenerating) return;
      if (!this.prompt.trim()) {
        this.showError("Vui lòng nhập prompt.");
        return;
      }

      this.errorMessage = "";
      this.successMessage = "";
      this.isGenerating = true;
      this.startTimer();

      try {
        const formData = new FormData();
        formData.append("prompt", this.prompt);
        formData.append("negative_prompt", this.negativePrompt || "");
        formData.append("aspect_ratio", this.aspectRatio);

        this.imageSlots.forEach((slot, idx) => {
          if (slot.file) {
            formData.append(`image_${idx}`, slot.file, slot.file.name);
          }
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const res = await fetch(CONFIG.WEBHOOK_URL, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Request failed with status ${res.status}`);
        }

        const data = await res.json();

        // data.image_url hoặc tương tự tùy webhook của bạn
        const imageUrl = data.image_url || data.url || "";
        if (!imageUrl) {
          throw new Error("Webhook không trả về URL ảnh hợp lệ.");
        }

        const item = {
          id: uuid(),
          imageUrl,
          prompt: this.prompt,
          negative_prompt: this.negativePrompt,
          aspect_ratio: this.aspectRatio,
          created_at: Date.now(),
        };

        this.results.unshift(item);
        this.results = this.results.slice(0, 30);
        this.saveResults();

        this.addHistoryItem();

        this.successMessage = "Tạo ảnh thành công.";
      } catch (err) {
        if (err.name === "AbortError") {
          this.showError("Request bị timeout. Vui lòng thử lại.");
        } else {
          this.showError(err.message || "Có lỗi xảy ra khi tạo ảnh.");
        }
      } finally {
        this.isGenerating = false;
        this.stopTimer();
        // KHÔNG CLEAR FORM: giữ nguyên prompt + ảnh
      }
    },

    // HISTORY
    addHistoryItem() {
      const item = {
        id: uuid(),
        prompt: this.prompt,
        negative_prompt: this.negativePrompt,
        aspect_ratio: this.aspectRatio,
        time: formatTime(Date.now()),
        created_at: Date.now(),
      };
      this.history.unshift(item);
      this.history = this.history.slice(0, CONFIG.MAX_HISTORY_ITEMS);
      this.saveHistory();
    },

    saveHistory() {
      const payload = {
        version: 1,
        items: this.history,
        saved_at: Date.now(),
      };
      localStorage.setItem("ai_history", JSON.stringify(payload));
    },

    loadHistory() {
      try {
        const raw = localStorage.getItem("ai_history");
        if (!raw) return;
        const payload = JSON.parse(raw);
        this.history = Array.isArray(payload.items) ? payload.items : [];
      } catch {
        this.history = [];
      }
    },

    clearHistory() {
      this.history = [];
      localStorage.removeItem("ai_history");
    },

    // RESULTS
    saveResults() {
      const payload = {
        version: 1,
        items: this.results,
        saved_at: Date.now(),
      };
      localStorage.setItem("ai_results", JSON.stringify(payload));
    },

    loadResults() {
      try {
        const raw = localStorage.getItem("ai_results");
        if (!raw) return;
        const payload = JSON.parse(raw);
        this.results = Array.isArray(payload.items) ? payload.items : [];
      } catch {
        this.results = [];
      }
    },

    // TIMER
    startTimer() {
      let start = Date.now();
      this.elapsedTime = "00:00";
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        const diff = Date.now() - start;
        const sec = Math.floor(diff / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        this.elapsedTime = `${m}:${s}`;
      }, 1000);
    },

    stopTimer() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = null;
      this.elapsedTime = "";
    },

    // MODAL
    openPreview(item) {
      this.selectedResult = item;
      this.showModal = true;
    },

    closePreview() {
      this.showModal = false;
      this.selectedResult = null;
    },

    copyPrompt() {
      if (!this.selectedResult || !this.selectedResult.prompt) return;
      navigator.clipboard.writeText(this.selectedResult.prompt).then(() => {
        this.successMessage = "Đã copy prompt.";
        setTimeout(() => {
          if (this.successMessage === "Đã copy prompt.") this.successMessage = "";
        }, 1500);
      });
    },

    // FORM CONTROL
    clearForm() {
      this.prompt = "";
      this.negativePrompt = "";
      this.aspectRatio = "landscape";
      this.imageSlots.forEach((slot, idx) => this.clearImageSlot(idx));
    },

    // MESSAGE
    showError(msg) {
      this.errorMessage = msg;
      setTimeout(() => {
        if (this.errorMessage === msg) this.errorMessage = "";
      }, 4000);
    },
  };
}
