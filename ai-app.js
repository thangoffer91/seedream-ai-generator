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

// ===== MAIN APP =====
function aiApp() {
    return {
        // ===== STATE =====
        prompt: '',
        images: [],
        results: [],
        isGenerating: false,
        selectedAspect: 'landscape', // Mới: landscape hoặc portrait
        startTime: 0,
        successMessage: '',
        errorMessage: '',
        showModal: false,
        modalImage: '',
        modalPrompt: '',
        
        // File input ref
        fileInput: null,

        // ===== INIT =====
        init() {
            this.fileInput = this.$refs.fileInput;
            this.loadHistory();
            this.$watch('prompt', () => this.saveDraft());
            this.$watch('images', () => this.saveDraft());
            this.$watch('selectedAspect', () => this.saveDraft());
        },

        // ===== ASPECT RATIO =====
        get aspectRatio() {
            return this.selectedAspect === 'landscape' ? '16:9' : '9:16';
        },

        // ===== VALIDATION =====
        get canGenerate() {
            return this.prompt.trim().length > 5 && !this.isGenerating;
        },

        // ===== IMAGE UPLOAD =====
        addImage() {
            this.fileInput?.click();
        },

        handleFiles(event) {
            const files = Array.from(event.target.files);
            files.forEach(file => {
                if (file.size > CONFIG.MAX_FILE_SIZE) {
                    this.showError(`File ${file.name} quá lớn (${this.formatFileSize(file.size)})`);
                    return;
                }
                const url = URL.createObjectURL(file);
                this.images.push({
                    id: Date.now() + Math.random(),
                    file,
                    url,
                    name: file.name,
                    size: file.size,
                    loaded: false
                });
            });
            event.target.value = '';
        },

        removeImage(index) {
            const image = this.images[index];
            if (image.url.startsWith('blob:')) {
                URL.revokeObjectURL(image.url);
            }
            this.images.splice(index, 1);
        },

        onImageLoad(event, index) {
            this.images[index].loaded = true;
        },

        // ===== IMAGE GENERATION =====
        async generateImages() {
            if (!this.canGenerate) return;

            this.isGenerating = true;
            this.startTime = Date.now();
            this.successMessage = '';
            this.errorMessage = '';

            try {
                // Post message to Service Worker cho background processing
                const generationId = Date.now();
                const payload = {
                    id: generationId,
                    prompt: this.prompt.trim(),
                    images: this.images.map(img => ({
                        name: img.name,
                        size: img.size
                    })),
                    aspect_ratio: this.selectedAspect, // Thêm aspect ratio
                    timestamp: new Date().toISOString()
                };

                // Gửi đến Service Worker
                const registration = await navigator.serviceWorker.ready;
                registration.active.postMessage({
                    type: 'GENERATE_IMAGES',
                    payload
                });

                // Listen cho kết quả từ Service Worker
                navigator.serviceWorker.addEventListener('message', this.handleSWMessage.bind(this));
                
            } catch (error) {
                this.showError('Lỗi khởi tạo: ' + error.message);
                this.isGenerating = false;
            }
        },

        handleSWMessage(event) {
            if (event.data.type === 'GENERATION_RESULT') {
                const { success, results, error } = event.data;
                
                if (success && results) {
                    this.results = [...this.results, ...results];
                    this.saveHistory({ prompt: this.prompt, images: this.images.length, aspect: this.selectedAspect, results });
                    this.successMessage = `✅ Tạo thành công ${results.length} ảnh!`;
                } else {
                    this.showError(error || 'Lỗi từ server');
                }
                
                this.isGenerating = false;
            }
        },

        formatTimer() {
            if (!this.isGenerating || !this.startTime) return '';
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        },

        onResultLoad(event) {
            event.target.style.opacity = '1';
        },

        // ===== MODAL =====
        openModal(imageUrl, prompt) {
            this.modalImage = imageUrl;
            this.modalPrompt = prompt;
            this.showModal = true;
        },

        closeModal() {
            this.showModal = false;
        },

        // ===== COPY PROMPT =====
        copyPrompt() {
            navigator.clipboard.writeText(this.modalPrompt).then(() => {
                const original = this.successMessage;
                this.successMessage = '✅ Đã copy prompt!';
                setTimeout(() => {
                    this.successMessage = original;
                }, 2000);
            }).catch(() => {
                this.showError('Không thể copy prompt');
            });
        },

        // ===== HELPERS =====
        showError(message) {
            this.errorMessage = message;
            setTimeout(() => {
                this.errorMessage = '';
            }, 5000);
        },

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        // ===== HISTORY & DRAFT =====
        saveDraft() {
            try {
                const draft = {
                    prompt: this.prompt,
                    images: this.images.map(img => ({ name: img.name, size: img.size })),
                    aspect: this.selectedAspect,
                    timestamp: Date.now()
                };
                localStorage.setItem('aiapp_draft', JSON.stringify(draft));
            } catch (e) {}
        },

        loadDraft() {
            try {
                const draft = localStorage.getItem('aiapp_draft');
                if (draft) {
                    const data = JSON.parse(draft);
                    this.prompt = data.prompt || '';
                    this.selectedAspect = data.aspect || 'landscape';
                }
            } catch (e) {}
        },

        saveHistory(entry) {
            try {
                let history = JSON.parse(localStorage.getItem('aiapp_history') || '[]');
                history.unshift({
                    ...entry,
                    id: Date.now(),
                    timestamp: Date.now()
                });
                history = history.slice(0, CONFIG.MAX_HISTORY_ITEMS);
                localStorage.setItem('aiapp_history', JSON.stringify(history));
            } catch (e) {}
        },

        loadHistory() {
            this.loadDraft();
        }
    }
}
