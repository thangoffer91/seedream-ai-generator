const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';

let imageSlots = [];
let slotCounter = 0;

// === Upload/Prompt ===
function addImageSlot() {
    const slotId = slotCounter++;
    const isBase = imageSlots.length === 0;
    const slot = { id: slotId, file: null, preview: null };
    imageSlots.push(slot);
    renderImageSlots();
}
function renderImageSlots() {
    const container = document.getElementById('imagesContainer');
    container.innerHTML = '';
    imageSlots.forEach((slot, index) => {
        const isBase = index === 0;
        const div = document.createElement('div');
        div.className = `image-item ${isBase ? 'base-image' : ''}`;
        div.innerHTML = `
            <span class="image-label">${isBase ? '🎯 Ảnh gốc' : `📷 Ảnh tham khảo ${index}`}</span>
            <div class="image-preview" id="preview-${slot.id}">
                ${slot.preview ? `<img src="${slot.preview}">` : 'Chưa chọn ảnh'}
            </div>
            <input type="file" id="file-${slot.id}" accept="image/*" onchange="handleFileSelect(${slot.id}, event)">
            <button class="btn-upload" onclick="document.getElementById('file-${slot.id}').click()">📁 Chọn</button>
            <button class="btn-delete" onclick="deleteImageSlot(${slot.id})">🗑️ Xóa</button>
        `;
        container.appendChild(div);
    });
}
function handleFileSelect(id, e) {
    const file = e.target.files[0];
    if (!file) return;
    const slot = imageSlots.find(s => s.id === id);
    slot.file = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        slot.preview = e.target.result;
        renderImageSlots();
    };
    reader.readAsDataURL(file);
}
function deleteImageSlot(id) {
    imageSlots = imageSlots.filter(s => s.id !== id);
    renderImageSlots();
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function showError(msg) {
    const div = document.getElementById('errorMessage');
    div.textContent = msg;
    div.classList.add('show');
    setTimeout(() => div.classList.remove('show'), 4000);
}

// === Main action ===
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    if (!prompt) return showError('Vui lòng nhập prompt!');
    const images = imageSlots.filter(s => s.file);
    if (images.length === 0) return showError('Vui lòng upload ít nhất 1 ảnh!');

    document.getElementById('loading').classList.add('show');
    document.getElementById('generateBtn').disabled = true;

    try {
        const base64Images = await Promise.all(
            images.map(async s => ({
                base64: await fileToBase64(s.file),
                filename: s.file.name,
                mimetype: s.file.type
            }))
        );

        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, images: base64Images })
        });

        const data = await res.json();
        const url = data.fifeUrl || data.imageUrl || data.url;
        if (!url) return showError('Không nhận được URL ảnh từ webhook');

        addResultImage(url);
    } catch (err) {
        console.error(err);
        showError('Lỗi tạo ảnh: ' + err.message);
    } finally {
        document.getElementById('loading').classList.remove('show');
        document.getElementById('generateBtn').disabled = false;
    }
}

// === UI Results ===
function addResultImage(url) {
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.className = 'thumbnail';
    thumb.onclick = () => showModal(url);
    document.getElementById('resultsGrid').appendChild(thumb);

    const hist = document.createElement('img');
    hist.src = url;
    hist.onclick = () => showModal(url);
    document.getElementById('historyContainer').prepend(hist);
}

// === Modal ===
function showModal(url) {
    document.getElementById('modalImage').src = url;
    document.getElementById('downloadBtn').href = url;
    document.getElementById('imageModal').style.display = 'block';
}
function closeModal() {
    document.getElementById('imageModal').style.display = 'none';
}

// Init
addImageSlot();
