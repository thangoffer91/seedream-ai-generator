console.log("🚀 AI App initializing...");

// ===== CONFIGURATION =====
const CONFIG = {
  WEBHOOK_URL: "https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855",
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  REQUEST_TIMEOUT: 60000, // 60 seconds
  MAX_HISTORY_ITEMS: 50,
  HISTORY_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
};

// ===== ALPINE STORE =====
document.addEventListener('alpine:init', () => {
  Alpine.store('imageHistory', {
    items: [],
    
    init() {
      this.load();
    },
    
    load() {
      try {
        const raw = JSON.parse(sessionStorage.getItem("ai_image_history") || "[]");
        const now = Date.now();
        this.items = raw.filter(h => now - h.time < CONFIG.HISTORY_EXPIRY);
        
        if (this.items.length !== raw.length) {
          this.save();
        }
      } catch (e) {
        console.error('Error loading history:', e);
        this.items = [];
      }
    },
    
    add(url) {
      const newItem = { url, time: Date.now() };
      this.items.unshift(newItem);
      
      if (this.items.length > CONFIG.MAX_HISTORY_ITEMS) {
        this.items = this.items.slice(0, CONFIG.MAX_HISTORY_ITEMS);
      }
      
      this.save();
    },
    
    save() {
      try {
        sessionStorage.setItem("ai_image_history", JSON.stringify(this.items));
      } catch (e) {
        console.error('Error saving history:', e);
      }
    },
    
    clear() {
      this.items = [];
      sessionStorage.removeItem("ai_image_history");
    }
  });
});

// ===== MAIN APP COMPONENT =====
function aiApp() {
  return {
    // State
    prompt: "",
    imageSlots: [],
    results: [],
    loading: false,
    errorMessage: "",
    
    // Computed
    get hasImages() {
      return this.imageSlots.some(s => s.file);
    },
    
    get canGenerate() {
      return !this.loading && this.prompt.trim() && this.hasImages;
    },
    
    // Lifecycle
    init() {
      console.log("✅ App initialized");
      this.addImageSlot();
      this.loadResults();
      this.$store.imageHistory.init();
    },
    
    // Image Slots Management
    addImageSlot() {
      const id = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      this.imageSlots.push({ 
        id, 
        file: null, 
        preview: null,
        loading: false 
      });
    },
    
    // FIX: Trigger file input bằng cách truyền $event.target
    triggerFileInput(event) {
      const button = event.target;
      const fileInput = button.nextElementSibling;
      if (fileInput && fileInput.type === 'file') {
        fileInput.click();
      }
    },
    
    async handleFileSelect(slot, event) {
      const file = event.target.files[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.showError('❌ Vui lòng chọn file ảnh hợp lệ');
        event.target.value = '';
        return;
      }
      
      // Validate file size
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        this.showError(`❌ File quá lớn (max ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`);
        event.target.value = '';
        return;
      }
      
      slot.loading = true;
      
      try {
        slot.preview = await this.fileToDataURL(file);
        slot.file = file;
      } catch (e) {
        this.showError('❌ Không thể đọc file: ' + e.message);
        console.error('File read error:', e);
      } finally {
        slot.loading = false;
      }
    },
    
    deleteImageSlot(id) {
      this.imageSlots = this.imageSlots.filter(s => s.id !== id);
      
      // Always keep at least one slot
      if (this.imageSlots.length === 0) {
        this.addImageSlot();
      }
    },
    
    // File Utilities
    fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Không đọc được file'));
        reader.readAsDataURL(file);
      });
    },
    
    async fileToBase64(file) {
      const dataURL = await this.fileToDataURL(file);
      return dataURL.split(",")[1];
    },
    
    // Main Generation Function
    async generateImage() {
      if (!this.canGenerate) return;
      
      this.loading = true;
      this.errorMessage = "";
      
      try {
        const uploadedSlots = this.imageSlots.filter(s => s.file);
        const images = await Promise.all(
          uploadedSlots.map(async (slot) => ({
            base64: await this.fileToBase64(slot.file),
            filename: slot.file.name,
            mimetype: slot.file.type,
          }))
        );
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(CONFIG.WEBHOOK_URL, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt: this.prompt.trim(), 
            images 
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const imageUrl = data.imageUrl || data.url || data.fileUrl;
        
        if (!imageUrl) {
          throw new Error("Không nhận được URL ảnh từ server");
        }
        
        this.results.unshift(imageUrl);
        this.$store.imageHistory.add(imageUrl);
        
        // Reset form
        this.prompt = "";
        this.imageSlots = [];
        this.addImageSlot();
        
        console.log('✅ Image generated successfully');
        
      } catch (error) {
        console.error('Generation error:', error);
        
        if (error.name === 'AbortError') {
          this.showError("❌ Timeout - Server không phản hồi sau 60 giây");
        } else if (error.message.includes('Failed to fetch')) {
          this.showError("❌ Lỗi kết nối - Kiểm tra internet của bạn");
        } else {
          this.showError("❌ " + error.message);
        }
      } finally {
        this.loading = false;
      }
    },
    
    showError(message) {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = "";
      }, 5000);
    },
    
    openModal(url) {
      window.dispatchEvent(new CustomEvent('modal-open', { detail: url }));
    },
    
    loadResults() {
      this.results = this.$store.imageHistory.items.map(h => h.url);
    },
  };
}

// ===== HISTORY COMPONENT =====
function aiAppHistory() {
  return {
    get history() {
      return this.$store.imageHistory.items;
    },
    
    get hasHistory() {
      return this.history.length > 0;
    },
    
    openModal(url) {
      window.dispatchEvent(new CustomEvent('modal-open', { detail: url }));
    },
    
    clearHistory() {
      if (confirm('Xóa toàn bộ lịch sử?')) {
        this.$store.imageHistory.clear();
      }
    }
  };
}

// ===== MODAL COMPONENT =====
function imageModal() {
  return {
    show: false,
    imageUrl: '',
    
    init() {
      window.addEventListener('modal-open', (e) => {
        this.open(e.detail);
      });
    },
    
    open(url) {
      this.imageUrl = url;
      this.show = true;
      document.body.style.overflow = 'hidden';
    },
    
    close() {
      this.show = false;
      document.body.style.overflow = '';
    },
    
    handleKeydown(e) {
      if (e.key === 'Escape') {
        this.close();
      }
    }
  };
}

// ===== DOM RENDERING =====
window.addEventListener("DOMContentLoaded", () => {
  console.log("⚙️ Mounting app...");
  
  const root = document.getElementById("app-root");
  
  root.innerHTML = `
    <!-- Main Container -->
    <div class="container" x-data="aiApp()" x-init="init()" x-cloak>
      <h1>🎨 AI Image Generator</h1>

      <!-- Error Message -->
      <div x-show="errorMessage" x-text="errorMessage" class="error-message" x-transition></div>

      <!-- Prompt Input -->
      <textarea 
        x-model="prompt" 
        placeholder="Mô tả ảnh bạn muốn tạo..."
        :disabled="loading"
      ></textarea>

      <!-- Image Slots -->
      <div class="image-slots-container">
        <button class="add-image-btn" @click="addImageSlot()" :disabled="loading">
          ➕ Thêm ảnh
        </button>
        
        <template x-for="slot in imageSlots" :key="slot.id">
          <div class="image-item">
            <div class="image-preview">
              <template x-if="slot.loading">
                <span>Đang tải...</span>
              </template>
              <template x-if="!slot.loading && slot.preview">
                <img :src="slot.preview" :alt="slot.file?.name" />
              </template>
              <template x-if="!slot.loading && !slot.preview">
                <span>Chưa chọn ảnh</span>
              </template>
            </div>
            
            <div class="image-actions">
              <button 
                class="btn-upload" 
                @click="triggerFileInput($event)"
                :disabled="loading"
              >
                📁 Chọn ảnh
              </button>
              <input 
                type="file" 
                accept="image/*" 
                @change="handleFileSelect(slot, $event)" 
                style="display: none;"
              />
              <button 
                class="btn-delete" 
                @click="deleteImageSlot(slot.id)"
                :disabled="loading || imageSlots.length === 1"
              >
                🗑️ Xóa
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Generate Button -->
      <button 
        class="btn-generate" 
        @click="generateImage()" 
        :disabled="!canGenerate"
      >
        <template x-if="loading">
          <span><span class="loading-spinner"></span>Đang xử lý...</span>
        </template>
        <template x-if="!loading">
          <span>🚀 Tạo ảnh</span>
        </template>
      </button>

      <!-- Results -->
      <div x-show="results.length > 0" class="results-section" x-transition>
        <h3>✨ Kết quả</h3>
        <div class="results-grid">
          <template x-for="url in results" :key="url">
            <img 
              :src="url" 
              class="result-thumb" 
              @click="openModal(url)"
              loading="lazy"
              alt="Generated image"
            >
          </template>
        </div>
      </div>
    </div>

    <!-- History Panel -->
    <div class="history-panel" x-data="aiAppHistory()" x-cloak>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>🕒 Lịch sử ảnh</h3>
        <button 
          x-show="hasHistory" 
          @click="clearHistory()" 
          class="btn-delete"
          style="padding: 6px 12px; font-size: 12px;"
        >
          Xóa tất cả
        </button>
      </div>
      
      <template x-if="!hasHistory">
        <div class="empty-state">
          <p>Chưa có ảnh nào được tạo</p>
        </div>
      </template>
      
      <template x-if="hasHistory">
        <div class="results-grid">
          <template x-for="item in history" :key="item.url">
            <img 
              :src="item.url" 
              class="result-thumb" 
              @click="openModal(item.url)"
              loading="lazy"
              alt="History image"
            >
          </template>
        </div>
      </template>
    </div>

    <!-- Modal -->
    <div 
      x-data="imageModal()" 
      x-init="init()"
      x-show="show" 
      x-cloak
      class="modal"
      style="display: flex;"
      @click.self="close()"
      @keydown.window="handleKeydown($event)"
      x-transition
    >
      <div class="modal-overlay"></div>
      <div class="modal-content-box" @click.stop>
        <span class="close-btn" @click="close()">&times;</span>
        <img :src="imageUrl" class="modal-image" alt="Preview" />
        <a 
          :href="imageUrl" 
          download 
          target="_blank" 
          class="download-btn"
        >
          💾 Tải ảnh về
        </a>
      </div>
    </div>
  `;
  
  // FIX: Kiểm tra Alpine đã tồn tại chưa trước khi start
  if (typeof Alpine !== 'undefined' && !Alpine.version) {
    Alpine.start();
    console.log("✅ Alpine running - App ready!");
  } else if (typeof Alpine !== 'undefined') {
    console.log("✅ Alpine already started - App ready!");
  }
});
