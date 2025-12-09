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
        selectedAspect: 'landscape',
        startTime: 0,
        successMessage: '',
        errorMessage: '',
        showModal: false,
        modalImage: '',
        modalPrompt: '',
        fileInput: null,

        // ===== INIT =====
        init() {
            this.fileInput = this.$refs.fileInput;
            this.loadDraft();
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

        // ===== IMAGE GENERATION - DIRECT FETCH (KHÔNG CẦN SW) =====
        async generateImages() {
            if (!this.canGenerate) return;

            this.isGenerating = true;
            this.startTime = Date.now();
            this.successMessage = '';
            this.errorMessage = '';

            try {
                // Tạo FormData
                const formData = new FormData();
                formData.append('prompt', this.prompt.trim());
                formData.append('aspect_ratio', this.selectedAspect);
                
                // Thêm reference images
                this.images.forEach((img, index) => {
                    formData.append(`images[${index}][name]`, img.name);
                    formData.append(`images[${index}][size]`, img.size);
                    if (img.file) {
                        formData.append(`images[${index}][file]`, img.file);
                    }
                });

                // Fetch với keepalive + timeout cho background
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

                const response = await fetch(CONFIG.WEBHOOK_URL, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal,
                    keepalive: true, // Quan trọng cho background
                    cache: 'no-cache'
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                
                if (result.images && result.images.length > 0) {
                    const newResults = result.images.map(img => ({
                        id: Date.now() + Math.random(),
                        url: img.url || img,
                        prompt: this.prompt.trim()
                    }));
                    
                    this.results = [...this.results, ...newResults];
                    this.successMessage = `✅ Tạo thành công ${newResults.length} ảnh!`;
                    
                    // LƯU DRAFT - KHÔNG CLEAR FORM
                    this.saveDraft();
                } else {
                    throw new Error('Không nhận được ảnh từ server');
                }

            } catch (error) {
                if (error.name === 'AbortError') {
                    this.showError('⏰ Timeout - Server quá chậm');
                } else {
                    this.showError('❌ Lỗi tạo ảnh: ' + error.message);
                }
            } finally {
                this.isGenerating = false;
            }
        },

        // ===== UI HELPERS =====
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
            document.body.style.overflow = 'hidden'; // Prevent scroll
        },

        closeModal() {
            this.showModal = false;
            document.body.style.overflow = ''; // Restore scroll
        },

        // ===== COPY PROMPT =====
        copyPrompt() {
            navigator.clipboard.writeText(this.modalPrompt).then(() => {
                this.successMessage = '✅ Đã copy prompt!';
                setTimeout(() => { this.successMessage = ''; }, 2000);
            }).catch(() => {
                this.showError('Không thể copy prompt');
            });
        },

        // ===== HELPERS =====
        showError(message) {
            this.errorMessage = message;
            setTimeout(() => { this.errorMessage = ''; }, 5000);
        },

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        // ===== DRAFT (GIỮ FORM STATE) =====
        saveDraft() {
            try {
                const draft = {
                    prompt: this.prompt,
                    images: this.images.map(img => ({ 
                        name: img.name, 
                        size: img.size 
                    })),
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
                    // Không restore images vì cần file objects mới
                }
            } catch (e) {}
        }
    }
}
