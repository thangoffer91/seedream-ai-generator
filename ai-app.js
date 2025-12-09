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

// ===== NOTIFICATION PERMISSION (NEW FEATURE 4) =====
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ===== WAKE LOCK API (NEW FEATURE 4) =====
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('🔒 Wake Lock activated');
      
      wakeLock.addEventListener('release', () => {
        console.log('🔓 Wake Lock released');
      });
    }
  } catch (err) {
    console.warn('Wake Lock failed:', err);
  }
}

async function releaseWakeLock() {
  if (wakeLock !== null) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      console.warn('Wake Lock release failed:', err);
    }
  }
}

// ===== SHOW NOTIFICATION (NEW FEATURE 4) =====
function showNotification(title, body, icon = '🎨') {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`,
        badge: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`,
        tag: 'ai-image-generator',
        requireInteraction: false
      });
    } catch (err) {
      console.warn('Notification failed:', err);
    }
  }
}

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
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .slice(0, 2000);
  }

  checkRateLimit() {
    const now = Date.now();
    if (now - this.lastRequestTime < CONFIG.RATE_LIMIT_DELAY) {
      return false;
    }
    this.lastRequestTime = now;
    this.requestCount++;
    return true;
  }

  logActivity(action, details) {
    console.log(`🔍 [Security] ${action}:`, details);
  }
}

const security = new SecurityMonitor();

// ===== IMAGE PROCESSING =====
class ImageProcessor {
  static async compressImage(file, maxDimension = CONFIG.MAX_IMAGE_DIMENSION, quality = CONFIG.COMPRESSION_QUALITY) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              if (blob.size > CONFIG.MAX_COMPRESSED_SIZE) {
                const newQuality = quality * (CONFIG.MAX_COMPRESSED_SIZE / blob.size);
                this.compressImage(file, maxDimension, Math.max(0.1, newQuality))
                  .then(resolve)
                  .catch(reject);
              } else {
                resolve(blob);
              }
            },
            file.type,
            quality
          );
        };
        
        img.onerror = () => reject(new Error('Không thể tải ảnh'));
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject(new Error('Không thể đọc file'));
      reader.readAsDataURL(file);
    });
  }

  // NEW: Convert blob to base64
  static async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Remove data:image/jpeg;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// ===== HISTORY MANAGER =====
class HistoryManager {
  constructor() {
    this.storageKey = 'aiImageHistory';
    this.cleanupOldEntries();
  }

  save(item) {
    try {
      const history = this.getAll();
      const newItem = {
        ...item,
        id: Date.now(),
        timestamp: new Date().toISOString()
      };
      
      history.unshift(newItem);
      
      if (history.length > CONFIG.MAX_HISTORY_ITEMS) {
        history.splice(CONFIG.MAX_HISTORY_ITEMS);
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(history));
      return newItem;
    } catch (error) {
      console.warn('Failed to save history:', error);
      return item;
    }
  }

  getAll() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load history:', error);
      return [];
    }
  }

  clear() {
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.warn('Failed to clear history:', error);
      return false;
    }
  }

  cleanupOldEntries() {
    try {
      const history = this.getAll();
      const now = Date.now();
      const filtered = history.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        return (now - itemTime) < CONFIG.HISTORY_EXPIRY;
      });
      
      if (filtered.length !== history.length) {
        localStorage.setItem(this.storageKey, JSON.stringify(filtered));
      }
    } catch (error) {
      console.warn('Failed to cleanup history:', error);
    }
  }
}

const historyManager = new HistoryManager();

// ===== ALPINE.JS APP DATA =====
function appData() {
  return {
    prompt: '',
    aspectRatio: '16:9',
    imageSlots: [{ file: null, preview: null, loading: false, size: null }],
    results: [],
    history: [],
    isGenerating: false,
    errorMessage: '',
    successMessage: '',
    modalOpen: false,
    modalImage: '',
    modalPrompt: '',
    promptCopied: false,
    elapsedTime: 0,
    timerInterval: null,

    init() {
      console.log('✅ App initialized');
      this.loadHistory();
      
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          console.log('🌙 Tab hidden - keeping request alive');
        } else {
          console.log('☀️ Tab visible');
        }
      });
    },

    triggerFileInput(index) {
      const fileInput = document.getElementById('fileInput-' + index);
      if (fileInput) {
        fileInput.click();
      } else {
        console.error('File input not found for index:', index);
      }
    },

    async handleFileSelect(event, index) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.size > CONFIG.MAX_FILE_SIZE) {
        this.showError(`File "${file.name}" quá lớn. Tối đa 5MB.`);
        return;
      }

      if (!file.type.startsWith('image/')) {
        this.showError('Vui lòng chọn file ảnh');
        return;
      }

      this.imageSlots[index].loading = true;
      
      try {
        const compressed = await ImageProcessor.compressImage(file);
        this.imageSlots[index].file = compressed;
        this.imageSlots[index].preview = URL.createObjectURL(compressed);
        this.imageSlots[index].size = ImageProcessor.formatFileSize(compressed.size);
        this.imageSlots[index].loading = false;
        
        security.logActivity('Image uploaded', { 
          index, 
          originalSize: file.size, 
          compressedSize: compressed.size 
        });
      } catch (error) {
        this.imageSlots[index].loading = false;
        this.showError('Không thể xử lý ảnh: ' + error.message);
      }
    },

    deleteImage(index) {
      if (this.imageSlots[index].preview) {
        URL.revokeObjectURL(this.imageSlots[index].preview);
      }
      this.imageSlots[index] = { 
        file: null, 
        preview: null, 
        loading: false, 
        size: null 
      };
    },

    addImageSlot() {
      if (this.imageSlots.length >= 5) {
        this.showError('Tối đa 5 ảnh');
        return;
      }
      this.imageSlots.push({ 
        file: null, 
        preview: null, 
        loading: false, 
        size: null 
      });
    },

    clearAll() {
      if (confirm('Bạn có chắc muốn xóa tất cả prompt và ảnh?')) {
        this.prompt = '';
        this.imageSlots.forEach((slot, index) => {
          if (slot.preview) {
            URL.revokeObjectURL(slot.preview);
          }
        });
        this.imageSlots = [{ file: null, preview: null, loading: false, size: null }];
        this.results = [];
        this.showSuccess('Đã xóa tất cả!');
      }
    },

    async generateImage() {
      if (this.isGenerating) return;
      if (!this.prompt.trim()) {
        this.showError('Vui lòng nhập prompt');
        return;
      }

      if (!security.checkRateLimit()) {
        this.showError('Vui lòng đợi 2 giây giữa các lần tạo ảnh');
        return;
      }

      this.isGenerating = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.elapsedTime = 0;
      
      await requestWakeLock();

      this.timerInterval = setInterval(() => {
        this.elapsedTime++;
      }, 1000);

      const sanitizedPrompt = security.sanitizePrompt(this.prompt);
      const currentPrompt = sanitizedPrompt;
      const aspectRatioPrompt = `${sanitizedPrompt} --ar ${this.aspectRatio}`;

      try {
        // FIX: Convert images to base64 array
        const imagesWithFiles = this.imageSlots.filter(slot => slot.file);
        const imagesBase64 = [];
        
        for (const slot of imagesWithFiles) {
          const base64 = await ImageProcessor.blobToBase64(slot.file);
          imagesBase64.push({ base64 });
        }

        // FIX: Send JSON instead of FormData
        const requestBody = {
          prompt: aspectRatioPrompt,
          images: imagesBase64
        };

        security.logActivity('Generate request', { 
          prompt: sanitizedPrompt, 
          aspectRatio: this.aspectRatio,
          imageCount: imagesBase64.length
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(CONFIG.WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
          keepalive: true
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Response:', result);

        if (result.imageUrl) {
          this.results = [{ 
            url: result.imageUrl, 
            prompt: currentPrompt,
            aspectRatio: this.aspectRatio,
            timestamp: new Date().toISOString()
          }];
          
          const historyItem = historyManager.save({ 
            url: result.imageUrl, 
            prompt: currentPrompt,
            aspectRatio: this.aspectRatio
          });
          this.history.unshift(historyItem);
          
          if (this.history.length > CONFIG.MAX_HISTORY_ITEMS) {
            this.history = this.history.slice(0, CONFIG.MAX_HISTORY_ITEMS);
          }
          
          this.showSuccess(`✨ Tạo ảnh thành công!`);
          
          if (document.hidden) {
            showNotification(
              '✅ Tạo ảnh thành công!',
              `Đã tạo xong ảnh từ prompt: "${currentPrompt.slice(0, 50)}..."`,
              '🎨'
            );
          }
          
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          throw new Error('Không nhận được ảnh từ server');
        }

      } catch (error) {
        console.error('❌ Error:', error);
        
        if (error.name === 'AbortError') {
          this.showError('⏱️ Timeout: Quá trình tạo ảnh mất quá nhiều thời gian (>2.5 phút)');
        } else {
          this.showError('❌ Lỗi: ' + error.message);
        }
        
        if (document.hidden) {
          showNotification(
            '❌ Lỗi khi tạo ảnh',
            error.message,
            '⚠️'
          );
        }
      } finally {
        this.isGenerating = false;
        clearInterval(this.timerInterval);
        this.elapsedTime = 0;
        await releaseWakeLock();
      }
    },

    showModal(result) {
      this.modalImage = result.url;
      this.modalPrompt = result.prompt || '';
      this.promptCopied = false;
      this.modalOpen = true;
      document.body.style.overflow = 'hidden';
    },

    closeModal() {
      this.modalOpen = false;
      this.modalPrompt = '';
      this.promptCopied = false;
      document.body.style.overflow = '';
    },

    async copyPrompt() {
      try {
        await navigator.clipboard.writeText(this.modalPrompt);
        this.promptCopied = true;
        setTimeout(() => {
          this.promptCopied = false;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        const textarea = document.createElement('textarea');
        textarea.value = this.modalPrompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.promptCopied = true;
        setTimeout(() => {
          this.promptCopied = false;
        }, 2000);
      }
    },

    loadHistory() {
      this.history = historyManager.getAll();
    },

    clearHistory() {
      if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử?')) {
        historyManager.clear();
        this.history = [];
        this.showSuccess('Đã xóa lịch sử');
      }
    },

    showError(message) {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = '';
      }, 5000);
    },

    showSuccess(message) {
      this.successMessage = message;
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  };
}

// ===== SERVICE WORKER REGISTRATION (FIX 404 ERROR) =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js') // Changed from '/sw.js' to './sw.js'
      .then(reg => console.log('✅ Service Worker registered'))
      .catch(err => console.warn('❌ SW registration failed:', err));
  });
}

console.log("✅ AI App loaded successfully");
