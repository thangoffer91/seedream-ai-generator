console.log("🚀 AI App initializing...");

// ===== CONFIGURATION =====
const CONFIG = {
  WEBHOOK_URL: "https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855",
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB per file
  MAX_COMPRESSED_SIZE: 2 * 1024 * 1024,
  REQUEST_TIMEOUT: 60000,
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
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .substring(0, 2000);
  }

  canMakeRequest() {
    const now = Date.now();
    if (now - this.lastRequestTime < CONFIG.RATE_LIMIT_DELAY) {
      console.warn('⚠️ Rate limit: Too many requests');
      return false;
    }
    this.lastRequestTime = now;
    return true;
  }

  logSuspicious(type, details) {
    this.suspiciousActivity.push({
      type,
      details,
      timestamp: Date.now()
    });
    console.warn('🚨 Suspicious activity:', type, details);
  }

  trackEvent(eventName, data) {
    try {
      console.log(`📊 [Analytics] ${eventName}:`, data);
      
      const events = JSON.parse(localStorage.getItem('app_analytics') || '[]');
      events.push({
        event: eventName,
        data,
        timestamp: Date.now()
      });
      
      if (events.length > 100) events.shift();
      localStorage.setItem('app_analytics', JSON.stringify(events));
    } catch (e) {
      console.error('Analytics error:', e);
    }
  }
}

const security = new SecurityMonitor();

// ===== IMAGE COMPRESSION =====
class ImageCompressor {
  static async compress(file, options = {}) {
    const {
      maxWidth = CONFIG.MAX_IMAGE_DIMENSION,
      maxHeight = CONFIG.MAX_IMAGE_DIMENSION,
      quality = CONFIG.COMPRESSION_QUALITY,
    } = options;

    console.log(`🖼️ Compressing: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onerror = () => reject(new Error('Không đọc được file'));
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width *= ratio;
              height *= ratio;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Không thể nén ảnh'));
                  return;
                }

                const compressed = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });

                const sizeBefore = file.size / 1024;
                const sizeAfter = compressed.size / 1024;
                const saved = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1);

                console.log(`✅ Compressed: ${sizeBefore.toFixed(2)}KB → ${sizeAfter.toFixed(2)}KB (saved ${saved}%)`);
                
                security.trackEvent('image_compressed', {
                  original_size: sizeBefore,
                  compressed_size: sizeAfter,
                  savings_percent: saved
                });

                resolve(compressed);
              },
              'image/jpeg',
              quality
            );
          } catch (error) {
            reject(error);
          }
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  static formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

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
      security.trackEvent('history_cleared', {});
    }
  });
});

// ===== MAIN APP =====
function aiApp() {
  return {
    prompt: "",
    imageSlots: [],
    results: [],
    loading: false,
    errorMessage: "",
    successMessage: "",
    
    // Timer states
    timerInterval: null,
    elapsedTime: 0,
    
    get hasImages() {
      return this.imageSlots.some(s => s.file);
    },
    
    get canGenerate() {
      return !this.loading && this.prompt.trim().length > 0;
    },
    
    // Format elapsed time
    get formattedTime() {
      const ms = this.elapsedTime;
      const seconds = Math.floor(ms / 1000);
      const milliseconds = Math.floor((ms % 1000) / 10);
      return `${seconds}.${milliseconds.toString().padStart(2, '0')}s`;
    },
    
    init() {
      console.log("✅ App initialized");
      this.addImageSlot();
      this.loadResults();
      this.$store.imageHistory.init();
      security.trackEvent('app_initialized', { timestamp: Date.now() });
    },
    
    // Timer methods
    startTimer() {
      this.elapsedTime = 0;
      this.timerInterval = setInterval(() => {
        this.elapsedTime += 10;
      }, 10);
    },
    
    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    },
    
    addImageSlot() {
      const id = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      this.imageSlots.push({ 
        id, 
        file: null, 
        preview: null,
        loading: false,
        originalSize: 0,
        compressedSize: 0
      });
    },
    
    triggerFileInput(event) {
      const button = event.target.closest('button');
      if (!button) return;
      
      const container = button.parentElement;
      const fileInput = container.querySelector('input[type="file"]');
      
      if (fileInput) {
        fileInput.click();
      }
    },
    
    async handleFileSelect(slot, event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        this.showError('❌ Chỉ chấp nhận file: JPG, PNG, WebP, GIF');
        event.target.value = '';
        security.logSuspicious('invalid_file_type', { type: file.type });
        return;
      }
      
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        this.showError(`❌ File quá lớn (max 5MB)`);
        event.target.value = '';
        return;
      }
      
      slot.loading = true;
      slot.originalSize = file.size;
      
      try {
        const compressedFile = await ImageCompressor.compress(file);
        slot.compressedSize = compressedFile.size;
        slot.preview = await this.fileToDataURL(compressedFile);
        slot.file = compressedFile;
        
        this.showSuccess(`✅ Đã tải ảnh (${ImageCompressor.formatFileSize(compressedFile.size)})`);
        
        security.trackEvent('image_uploaded', {
          original_size: file.size,
          compressed_size: compressedFile.size,
          type: file.type
        });
      } catch (e) {
        this.showError('❌ Không thể xử lý ảnh: ' + e.message);
        console.error('File processing error:', e);
        security.logSuspicious('file_processing_error', { error: e.message });
      } finally {
        slot.loading = false;
      }
    },
    
    deleteImageSlot(id) {
      const newSlots = this.imageSlots.filter(s => s.id !== id);
      this.imageSlots = newSlots.length > 0 ? newSlots : [];
      
      if (this.imageSlots.length === 0) {
        this.addImageSlot();
      }
      
      security.trackEvent('image_deleted', { slot_id: id });
    },
    
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
    
    async generateImage() {
      if (!this.canGenerate) return;
      
      if (!security.canMakeRequest()) {
        this.showError('⚠️ Vui lòng đợi 2 giây giữa các lần tạo ảnh');
        return;
      }
      
      const sanitizedPrompt = security.sanitizePrompt(this.prompt);
      if (sanitizedPrompt !== this.prompt) {
        security.logSuspicious('prompt_sanitized', { 
          original: this.prompt.substring(0, 100) 
        });
      }
      
      this.loading = true;
      this.errorMessage = "";
      this.successMessage = "";
      
      // Start timer
      this.startTimer();
      
      const startTime = Date.now();
      
      try {
        const uploadedSlots = this.imageSlots.filter(s => s.file);
        
        let images = [];
        if (uploadedSlots.length > 0) {
          images = await Promise.all(
            uploadedSlots.map(async (slot) => ({
              base64: await this.fileToBase64(slot.file),
              filename: slot.file.name,
              mimetype: slot.file.type,
            }))
          );
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(CONFIG.WEBHOOK_URL, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt: sanitizedPrompt, 
            images: images
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
        
        const duration = Date.now() - startTime;
        
        security.trackEvent('image_generated', {
          duration_ms: duration,
          prompt_length: sanitizedPrompt.length,
          images_count: images.length,
          success: true
        });
        
        this.showSuccess(`✅ Tạo ảnh thành công trong ${(duration / 1000).toFixed(2)}s`);
        
        this.prompt = "";
        this.imageSlots = [];
        this.addImageSlot();
        
        console.log('✅ Image generated successfully');
        
      } catch (error) {
        console.error('Generation error:', error);
        
        const duration = Date.now() - startTime;
        
        security.trackEvent('image_generation_failed', {
          duration_ms: duration,
          error: error.message,
          error_type: error.name
        });
        
        if (error.name === 'AbortError') {
          this.showError("❌ Timeout - Server không phản hồi sau 60 giây");
        } else if (error.message.includes('Failed to fetch')) {
          this.showError("❌ Lỗi kết nối - Kiểm tra internet hoặc thử lại");
        } else {
          this.showError("❌ " + error.message);
        }
      } finally {
        this.loading = false;
        this.stopTimer();
      }
    },
    
    showError(message) {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = "";
      }, 5000);
    },
    
    showSuccess(message) {
      this.successMessage = message;
      setTimeout(() => {
        this.successMessage = "";
      }, 3000);
    },
    
    openModal(url) {
      window.dispatchEvent(new CustomEvent('modal-open', { detail: url }));
      security.trackEvent('image_viewed', { url });
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
    <div class="container" x-data="aiApp()" x-init="init()" x-cloak>
      <h1>🎨 AI Image Generator</h1>

      <div x-show="errorMessage" x-text="errorMessage" class="error-message" x-transition></div>
      <div x-show="successMessage" x-text="successMessage" class="success-message" x-transition></div>

      <textarea 
        x-model="prompt" 
        placeholder="Mô tả ảnh bạn muốn tạo..."
        :disabled="loading"
        rows="3"
      ></textarea>

      <div class="image-slots-container">
        <button class="add-image-btn" @click="addImageSlot()" :disabled="loading">
          ➕ Thêm ảnh (tùy chọn)
        </button>
        
        <template x-for="slot in imageSlots" :key="slot.id">
          <div class="image-item">
            <div class="image-preview">
              <template x-if="slot.loading">
                <span class="loading-text">⏳ Đang nén...</span>
              </template>
              <template x-if="!slot.loading && slot.preview">
                <div style="position: relative; width: 100%; height: 100%;">
                  <img :src="slot.preview" :alt="slot.file?.name" />
                  <span x-show="slot.compressedSize" class="image-size-badge" x-text="'💾 ' + (slot.compressedSize / 1024).toFixed(0) + 'KB'"></span>
                </div>
              </template>
              <template x-if="!slot.loading && !slot.preview">
                <span class="placeholder-text">📷 Chưa chọn</span>
              </template>
            </div>
            
            <div class="image-actions">
              <button 
                class="btn-upload" 
                @click="triggerFileInput($event)"
                :disabled="loading"
                type="button"
              >
                📁 Chọn ảnh
              </button>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp,image/gif" 
                @change="handleFileSelect(slot, $event)" 
                style="display: none;"
              />
              <button 
                class="btn-delete" 
                @click="deleteImageSlot(slot.id)"
                :disabled="loading"
                type="button"
              >
                🗑️ Xóa
              </button>
            </div>
          </div>
        </template>
      </div>

      <button 
        class="btn-generate" 
        @click="generateImage()" 
        :disabled="!canGenerate"
        type="button"
      >
        <template x-if="loading">
          <span>
            <span class="loading-spinner"></span>
            Đang xử lý... <span class="timer-badge" x-text="formattedTime"></span>
          </span>
        </template>
        <template x-if="!loading">
          <span>🚀 Tạo ảnh</span>
        </template>
      </button>

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

    <div class="history-panel" x-data="aiAppHistory()" x-cloak>
      <div class="history-header">
        <h3>🕒 Lịch sử</h3>
        <button 
          x-show="hasHistory" 
          @click="clearHistory()" 
          class="btn-clear-history"
          type="button"
        >
          Xóa tất cả
        </button>
      </div>
      
      <template x-if="!hasHistory">
        <div class="empty-state">
          <p>Chưa có ảnh</p>
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
  
  if (typeof Alpine !== 'undefined' && !Alpine.version) {
    Alpine.start();
    console.log("✅ Alpine running - App ready!");
  } else if (typeof Alpine !== 'undefined') {
    console.log("✅ Alpine already started - App ready!");
  }
});
