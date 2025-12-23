/**
 * Zimage AI Generator Logic - Split View
 * Đã cập nhật: Xử lý triệt để lỗi ký tự đặc biệt (%) bằng Unicode Escape
 */
const CONFIG = {
    // URL Webhook của bạn
    WEBHOOK_URL: 'https://rasp.nthang91.io.vn/webhook/65243e1e-19cb-405f-bbf4-4a0fd934c5dd',
    ERROR_MESSAGES: {
        MISSING_URL: 'Chưa cấu hình Webhook URL.',
        SERVER_ERROR: 'Lỗi máy chủ',
        NO_IMAGE: 'Server không trả về link ảnh hợp lệ.',
        CORS: 'Lỗi kết nối (CORS). Kiểm tra n8n webhook.'
    }
};

const UI = {
    form: document.getElementById('aiForm'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.getElementById('btnText'),
    btnIcon: document.getElementById('btnIcon'),
    btnSpinner: document.getElementById('btnSpinner'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    
    // Right Panel States
    placeholderState: document.getElementById('placeholderState'),
    loadingState: document.getElementById('loadingState'),
    resultState: document.getElementById('resultState'),
    
    resultImage: document.getElementById('resultImage'),
    downloadLink: document.getElementById('downloadLink'),
    downloadBtn: document.getElementById('downloadBtn')
};

// Hàm điều khiển hiển thị panel phải
function setRightPanelState(state) {
    if (!UI.placeholderState || !UI.loadingState || !UI.resultState) return;

    UI.placeholderState.classList.add('hidden');
    UI.loadingState.classList.add('hidden');
    UI.resultState.classList.add('hidden');
    
    if (state === 'placeholder') UI.placeholderState.classList.remove('hidden');
    if (state === 'loading') {
        UI.loadingState.classList.remove('hidden');
        UI.loadingState.classList.add('flex');
    }
    if (state === 'result') UI.resultState.classList.remove('hidden');
}

function setLoading(isLoading) {
    if (isLoading) {
        UI.submitBtn.disabled = true;
        UI.submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Đang khởi tạo...';
        UI.btnIcon.classList.add('hidden');
        if(UI.btnSpinner) UI.btnSpinner.classList.remove('hidden');
        
        UI.errorMessage.classList.add('hidden');
        setRightPanelState('loading'); 
    } else {
        UI.submitBtn.disabled = false;
        UI.submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        UI.btnText.textContent = 'Tạo ảnh ngay';
        UI.btnIcon.classList.remove('hidden');
        if(UI.btnSpinner) UI.btnSpinner.classList.add('hidden');
    }
}

function showError(msg) {
    UI.errorMessage.classList.remove('hidden');
    UI.errorText.textContent = msg;
    setRightPanelState('placeholder');
}

function extractImageUrl(data) {
    if (Array.isArray(data) && data.length > 0) {
        if (data[0].url) return data[0].url;
        if (data[0].output) return data[0].output;
    }
    if (data && typeof data === 'object') {
        if (data.url) return data.url;
    }
    if (typeof data === 'string' && data.startsWith('http')) return data;
    return null;
}

function downloadImage() {
    if (!UI.resultImage.src) return;
    const a = document.createElement('a');
    a.href = UI.resultImage.src;
    a.download = `zimage-${Date.now()}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

if(UI.downloadBtn) {
    UI.downloadBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        downloadImage();
    });
}

// Hàm an toàn để chuyển object thành JSON String mà không bị lỗi ký tự đặc biệt
// khi đi qua các lớp mạng hoặc browser extension
function safeJsonStringify(data) {
    // Bước 1: Chuyển thành JSON bình thường
    let json = JSON.stringify(data);
    
    // Bước 2: Mã hóa ký tự % thành \u0025 (Unicode Escape)
    // Các trình duyệt/extension sẽ thấy chuỗi "\u0025" (an toàn) thay vì "%" (dễ gây lỗi decode)
    // Backend n8n khi parse JSON sẽ tự động hiểu \u0025 chính là %
    json = json.replace(/%/g, '\\u0025');
    
    return json;
}

UI.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (CONFIG.WEBHOOK_URL.includes('YOUR-N8N')) {
        showError(CONFIG.ERROR_MESSAGES.MISSING_URL);
        return;
    }

    setLoading(true);

    const formData = new FormData(UI.form);
    
    // Lấy nguyên gốc dữ liệu người dùng nhập (bao gồm %, emoji...)
    const requestData = {
        "field-0": formData.get('field-0'), 
        "field-1": formData.get('field-1'),
        "field-2": formData.get('field-2')
    };

    console.log("Sending:", requestData);

    try {
        // Sử dụng hàm safeJsonStringify thay vì JSON.stringify thuần
        const safeBody = safeJsonStringify(requestData);

        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: safeBody
        });

        if (!response.ok) throw new Error(`${CONFIG.ERROR_MESSAGES.SERVER_ERROR}: ${response.status}`);

        const result = await response.json();
        const imageUrl = extractImageUrl(result);
        
        if (imageUrl) {
            const imgLoader = new Image();
            imgLoader.src = imageUrl;
            imgLoader.onload = () => {
                UI.resultImage.src = imageUrl;
                UI.downloadLink.href = imageUrl;
                setRightPanelState('result');
                setLoading(false);
            };
            imgLoader.onerror = () => {
                throw new Error("Link ảnh bị lỗi, không thể tải.");
            };
        } else {
            throw new Error(CONFIG.ERROR_MESSAGES.NO_IMAGE);
        }

    } catch (error) {
        console.error(error);
        showError(error.message.includes('Failed to fetch') ? CONFIG.ERROR_MESSAGES.CORS : error.message);
        setLoading(false);
    }
});
