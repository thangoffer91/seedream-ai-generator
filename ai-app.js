console.log("🚀 AI App initializing...");

// ===== CONFIGURATION =====
const CONFIG = {
  WEBHOOK_URL: "https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855",
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB per file
  MAX_COMPRESSED_SIZE: 2 * 1024 * 1024,
  REQUEST_TIMEOUT: 150000,
  MAX_HISTORY_ITEMS: 50,
  HISTORY_EXPIRY: 24 * 60 * 60 * 1000,
  MAX_IMAGE_DIMENSION: 1920,
  COMPRESSION_QUALITY: 0.85,
  RATE_LIMIT_DELAY: 2000,
};

// ===== SECURITY & ANALYTICS =====
class SecurityMonitor {
  constructor() {
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.suspiciousActivity = [];
  }

  sanitizePrompt(prompt) {
    return prompt
      .trim()
      .replace(/[<>]/g, "")
      .slice(0, 2000);
  }

  trackRequest() {
    const now = Date.now();
    this.requestCount++;
    this.lastRequestTime = now;
  }
}

const security = new SecurityMonitor();

// ===== HELPER =====
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function formatTime(date) {
  return new Date(date).toLocaleString("vi-VN");
}

// ===== MAIN APP =====
function aiApp() {
  return {
    // STATE GỐC
    prompt: "",
    negativePrompt: "",
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

    // THÊM MỚI
    aspectRatio: "landscape",

    get hasAnyImage() {
      return this.imageSlots.some(s => !!s.file);
    },

    init() {
      this.addImageSlot();
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
      const cleanPrompt = security.sanitizePrompt(this.prompt);
      if (!cleanPrompt) {
        this.showError("Vui lòng nhập prompt hợp lệ.");
        return;
      }

      this.prompt = cleanPrompt;
      this.errorMessage = "";
      this.successMessage = "";
      this.isGenerating = true;
      this.startTimer();
      security.trackRequest();

      try {
        const formData = new FormData();
        formData.append("prompt", this.prompt);
        formData.append("negative_prompt", this.negativePrompt || "");

        // THÊM: gửi aspect_ratio
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

        const imageUrl = data.image_url || data.url || data.result_url || "";
        if (!imageUrl) {
          throw new Error("Webhook không trả về URL ảnh hợp lệ.");
        }

        const item = {
          id: uuid(),
          imageUrl,
          prompt: this.prompt,
          negative_prompt: this.negativePrompt,
          aspect_ratio: this.aspectRatio, // THÊM
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
        // GIỮ FORM, KHÔNG CLEAR:
        // this.prompt = "";
        // this.negativePrompt = "";
        // this.imageSlots = [];
      }
    },

    // HISTORY
    addHistoryItem() {
      const item = {
        id: uuid(),
        prompt: this.prompt,
        negative_prompt: this.negativePrompt,
        aspect_ratio: this.aspectRatio, // THÊM
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
    openPreview(result) {
      this.selectedResult = result;
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

    // MESSAGES
    showError(msg) {
      this.errorMessage = msg;
      setTimeout(() => {
        if (this.errorMessage === msg) this.errorMessage = "";
      }, 4000);
    },
  };
}
