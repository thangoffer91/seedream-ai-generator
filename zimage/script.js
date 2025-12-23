/**
 * Zimage AI Generator Logic - Split View Layout
 * Xử lý logic cho giao diện 2 cột: Form bên trái, Kết quả bên phải.
 */

// ==========================================
// CẤU HÌNH (CONFIGURATION)
// ==========================================
const CONFIG = {
    // URL Webhook của bạn
    WEBHOOK_URL: 'https://rasp.nthang91.io.vn/webhook/65243e1e-19cb-405f-bbf4-4a0fd934c5dd',
    ERROR_MESSAGES: {
        MISSING_URL: 'Chưa cấu hình Webhook URL.',
        SERVER_ERROR: 'Lỗi máy chủ',
        NO_IMAGE: 'Server không trả về link ảnh hợp lệ.',
        CORS: 'Lỗi CORS. Kiểm tra cấu hình n8n.'
    }
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const UI = {
    // Left Panel Elements
    form: document.getElementById('aiForm'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.getElementById('btnText'),
    btnIcon: document.getElementById('btnIcon'),
    btnSpinner: document.getElementById('btnSpinner'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    
    // Right Panel Elements (States)
    placeholderState: document.getElementById('placeholderState'),
    loadingState: document.getElementById('loadingState'),
    resultState: document.getElementById('resultState'),
    
    // Result Elements
    resultImage: document.getElementById('resultImage'),
    downloadLink: document.getElementById('downloadLink'),
    downloadBtn: document.getElementById('downloadBtn')
};

// ==========================================
// STATE MANAGEMENT
// ==========================================

/**
 * Chuyển đổi trạng thái hiển thị của Panel bên phải
 * @param {'placeholder'|'loading'|'result'} state 
 */
function setRightPanelState(state) {
    // Ẩn tất cả trước
    UI.placeholderState.classList.add('hidden');
    UI.loadingState.classList.add('hidden');
    UI.resultState.classList.add('hidden');
    
    // Hiện trạng thái mong muốn
    if (state === 'placeholder') {
        UI.placeholderState.classList.remove('hidden');
    } else if (state === 'loading') {
        UI.loadingState.classList.remove('hidden');
        UI.loadingState.classList.add('flex'); // Sử dụng flex để căn giữa nội dung loading
    } else if (state === 'result') {
        UI.resultState.classList.remove('hidden');
    }
}

/**
 * Điều khiển trạng thái Loading của nút Submit và Panel phải
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
    if (isLoading) {
        // Button State
        UI.submitBtn.disabled = true;
        UI.submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Đang khởi tạo...';
        UI.btnIcon.classList.add('hidden');
        UI.btnSpinner.classList.remove('hidden');
        
        // Reset Error
        UI.errorMessage.classList.add('hidden');
        
        // Switch Right Panel to Loading
        setRightPanelState('loading'); 
    } else {
        // Reset Button State
        UI.submitBtn.disabled = false;
        UI.submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Tạo ảnh ngay';
        UI.btnIcon.classList.remove('hidden');
        UI.btnSpinner.classList.add('hidden');
    }
}

/**
 * Hiển thị lỗi
 */
function showError(msg) {
    UI.errorMessage.classList.remove('hidden');
    UI.errorText.textContent = msg;
    setRightPanelState('placeholder'); // Quay về trạng thái chờ nếu lỗi
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Trích xuất URL ảnh từ phản hồi n8n
 */
function extractImageUrl(data) {
    // 1. Array format: [{ "url": "..." }]
    if (Array.isArray(data) && data.length > 0) {
        if (data[0].url) return data[0].url;
        if (data[0].output) return data[0].output;
        if (data[0].image) return data[0].image;
    }

    // 2. Object format: { "url": "..." }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (data.url) return data.url;
        if (data.output) return data.output;
    }

    // 3. String format
    if (typeof data === 'string' && data.startsWith('http')) {
        return data;
    }

    return null;
}

/**
 * Tải ảnh xuống máy
 */
function downloadImage() {
    if (!UI.resultImage.src) return;
    
    const fileName = `zimage-${Date.now()}.png`;
    const a = document.createElement('a');
    a.href = UI.resultImage.src;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Nút Download
if(UI.downloadBtn) {
    UI.downloadBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        downloadImage();
    });
}

// Form Submit
UI.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (CONFIG.WEBHOOK_URL.includes('YOUR-N8N')) {
        showError(CONFIG.ERROR_MESSAGES.MISSING_URL);
        return;
    }

    setLoading(true);

    const formData = new FormData(UI.form);
    const requestData = {
        "field-0": formData.get('field-0'),
        "field-1": formData.get('field-1'),
        "field-2": formData.get('field-2')
    };

    try {
        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`${CONFIG.ERROR_MESSAGES.SERVER_ERROR}: ${response.status}`);
        }

        const result = await response.json();
        const imageUrl = extractImageUrl(result);
        
        if (imageUrl) {
            // Preload ảnh: Chỉ hiện kết quả khi ảnh đã tải xong hoàn toàn
            const imgLoader = new Image();
            imgLoader.src = imageUrl;
            
            imgLoader.onload = () => {
                UI.resultImage.src = imageUrl;
                UI.downloadLink.href = imageUrl;
                
                // Chuyển sang trạng thái Result và tắt Loading
                setRightPanelState('result');
                setLoading(false);
            };
            
            imgLoader.onerror = () => {
                throw new Error("Không thể tải hình ảnh từ URL trả về.");
            };
        } else {
            throw new Error(CONFIG.ERROR_MESSAGES.NO_IMAGE);
        }

    } catch (error) {
        console.error(error);
        showError(`${error.message}`);
        setLoading(false);
    }
});
