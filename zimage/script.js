/**
 * Zimage AI Generator Logic
 * Xử lý kết nối với n8n Webhook và cập nhật giao diện
 */

// ==========================================
// CẤU HÌNH (CONFIGURATION)
// ==========================================
const CONFIG = {
    // URL Webhook của bạn
    WEBHOOK_URL: 'https://rasp.nthang91.io.vn/webhook/65243e1e-19cb-405f-bbf4-4a0fd934c5dd',
    ERROR_MESSAGES: {
        MISSING_URL: 'Vui lòng kiểm tra cấu hình URL Webhook trong file script.js',
        SERVER_ERROR: 'Lỗi Server',
        NO_IMAGE: 'Không tìm thấy đường dẫn ảnh trong phản hồi. Server cần trả về format [{ "url": "..." }]',
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
        
        // Ẩn lỗi và kết quả cũ
        UI.errorMessage.classList.add('hidden');
        UI.resultArea.classList.add('hidden');
        UI.resultImage.classList.add('opacity-0'); // Reset độ mờ ảnh
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
 * Hàm trích xuất URL ảnh tối ưu cho format: [{ "url": "..." }]
 * @param {any} data Dữ liệu JSON từ n8n
 * @returns {string|null} URL ảnh hoặc null
 */
function extractImageUrl(data) {
    // 1. Kiểm tra chính xác format mảng object: [{ "url": "..." }]
    if (Array.isArray(data) && data.length > 0) {
        // Ưu tiên key 'url' như yêu cầu
        if (data[0].url) return data[0].url;
        
        // Fallback: Nếu lỡ server đổi tên key sang 'output' hoặc 'image'
        if (data[0].output) return data[0].output;
        if (data[0].image) return data[0].image;
    }

    // 2. Fallback cho trường hợp trả về object đơn lẻ: { "url": "..." }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (data.url) return data.url;
    }

    // 3. Nếu data chính là chuỗi URL
    if (typeof data === 'string' && data.startsWith('http')) {
        return data;
    }

    return null;
}

/**
 * Xử lý tải ảnh xuống
 */
function downloadImage() {
    if (!UI.resultImage.src) return;
    
    // Tạo tên file theo timestamp
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

// 1. Gắn sự kiện cho nút download
if(UI.downloadBtn) {
    UI.downloadBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        downloadImage();
    });
}

// 2. Xử lý sự kiện submit form
UI.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Kiểm tra cấu hình URL
    if (CONFIG.WEBHOOK_URL.includes('YOUR-N8N-INSTANCE')) {
        showError(CONFIG.ERROR_MESSAGES.MISSING_URL);
        return;
    }

    setLoading(true);

    // Thu thập dữ liệu form
    const formData = new FormData(UI.form);
    
    // Chuẩn bị payload gửi đi
    const requestData = {
        "field-0": formData.get('field-0'), // Prompt
        "field-1": formData.get('field-1'), // Aspect Ratio
        "field-2": formData.get('field-2')  // Model
    };

    try {
        console.log('Đang gửi dữ liệu:', requestData);

        // Gửi request đến n8n
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

        // Parse JSON phản hồi
        const result = await response.json();
        console.log('Kết quả trả về từ n8n:', result); 

        // Trích xuất URL ảnh với logic mới
        const imageUrl = extractImageUrl(result);
        console.log('URL ảnh tìm thấy:', imageUrl);
        
        if (imageUrl) {
            // Gán URL vào thẻ img
            UI.resultImage.src = imageUrl;
            
            // Xử lý sự kiện khi ảnh tải xong để hiện hiệu ứng fade-in
            UI.resultImage.onload = () => {
                UI.resultImage.classList.remove('opacity-0');
                console.log('Ảnh đã hiển thị thành công');
            };

            // Cập nhật link xem ảnh gốc
            UI.downloadLink.href = imageUrl;
            
            // Hiển thị vùng kết quả
            UI.resultArea.classList.remove('hidden');
            
            // Cuộn xuống vùng kết quả
            setTimeout(() => {
                UI.resultArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        } else {
            throw new Error(CONFIG.ERROR_MESSAGES.NO_IMAGE);
        }

    } catch (error) {
        console.error('Lỗi chi tiết:', error);
        showError(`Tạo ảnh thất bại. ${error.message}`);
        
        if (error.message.includes('Failed to fetch')) {
            showError(CONFIG.ERROR_MESSAGES.CORS);
        }
    } finally {
        setLoading(false);
    }
});
