/**
 * Zimage AI Generator Logic
 * Xử lý kết nối với n8n Webhook và cập nhật giao diện
 */

// ==========================================
// CẤU HÌNH (CONFIGURATION)
// ==========================================
const CONFIG = {
    WEBHOOK_URL: 'https://rasp.nthang91.io.vn/webhook/65243e1e-19cb-405f-bbf4-4a0fd934c5dd',
    ERROR_MESSAGES: {
        MISSING_URL: 'Vui lòng kiểm tra cấu hình URL Webhook trong file script.js',
        SERVER_ERROR: 'Lỗi Server',
        NO_IMAGE: 'Không tìm thấy ảnh trong phản hồi từ Server.',
        CORS: 'Lỗi kết nối (CORS). Vui lòng kiểm tra cấu hình n8n webhook "Allowed Origins" là "*" hoặc domain của GitHub Pages.'
    }
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const UI = {
    form: document.getElementById('aiForm'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.getElementById('btnText'),
    btnIcon: document.getElementById('btnIcon'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    resultArea: document.getElementById('resultArea'),
    resultImage: document.getElementById('resultImage'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    downloadLink: document.getElementById('downloadLink'),
    downloadBtn: document.getElementById('downloadBtn')
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Điều khiển trạng thái Loading của nút Submit
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
    if (isLoading) {
        UI.submitBtn.disabled = true;
        UI.submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Đang khởi tạo...';
        UI.btnIcon.classList.add('hidden');
        UI.loadingSpinner.classList.remove('hidden');
        UI.errorMessage.classList.add('hidden');
        UI.resultArea.classList.add('hidden');
    } else {
        UI.submitBtn.disabled = false;
        UI.submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Tạo ảnh ngay';
        UI.btnIcon.classList.remove('hidden');
        UI.loadingSpinner.classList.add('hidden');
    }
}

/**
 * Hiển thị thông báo lỗi
 * @param {string} msg 
 */
function showError(msg) {
    UI.errorMessage.classList.remove('hidden');
    UI.errorText.textContent = msg;
}

/**
 * Xử lý tải ảnh xuống
 */
function downloadImage() {
    if (!UI.resultImage.src) return;
    
    const imgUrl = UI.resultImage.src;
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `zimage-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// 1. Gắn sự kiện cho nút download
UI.downloadBtn.addEventListener('click', downloadImage);

// 2. Xử lý sự kiện submit form
UI.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Kiểm tra cấu hình
    if (CONFIG.WEBHOOK_URL.includes('YOUR-N8N-INSTANCE')) {
        showError(CONFIG.ERROR_MESSAGES.MISSING_URL);
        return;
    }

    setLoading(true);

    // Thu thập dữ liệu form
    const formData = new FormData(UI.form);
    const requestData = {
        "field-0": formData.get('field-0'), // Prompt
        "field-1": formData.get('field-1'), // Aspect Ratio
        "field-2": formData.get('field-2')  // Model
    };

    try {
        // Gửi request đến n8n
        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`${CONFIG.ERROR_MESSAGES.SERVER_ERROR}: ${response.status}`);
        }

        const result = await response.json();
        
        // Logic tìm URL ảnh trong JSON trả về
        let imageUrl = null;
        if (result.output) imageUrl = result.output;
        else if (result.url) imageUrl = result.url;
        else if (result.image) imageUrl = result.image;
        else if (Array.isArray(result) && result[0].url) imageUrl = result[0].url;
        
        if (imageUrl) {
            // Hiển thị ảnh
            UI.resultImage.src = imageUrl;
            
            // Xử lý khi ảnh load xong (tránh hiện khung trống)
            UI.resultImage.onload = () => {
                UI.resultImage.classList.remove('opacity-0');
            };
            
            UI.downloadLink.href = imageUrl;
            UI.resultArea.classList.remove('hidden');
            
            // Cuộn xuống kết quả
            setTimeout(() => {
                UI.resultArea.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } else {
            throw new Error(CONFIG.ERROR_MESSAGES.NO_IMAGE);
        }

    } catch (error) {
        console.error('Error:', error);
        showError(`Tạo ảnh thất bại. ${error.message}`);
        
        if (error.message.includes('Failed to fetch')) {
            showError(CONFIG.ERROR_MESSAGES.CORS);
        }
    } finally {
        setLoading(false);
    }
});