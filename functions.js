const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';
let imageSlots = [];
let slotCounter = 0;
let historyImages = [];

function addImageSlot() {
    const slotId = slotCounter++;
    const slot = {
        id: slotId,
        file: null,
        preview: null,
    };
    imageSlots.push(slot);
    renderImageSlots();
}

function renderImageSlots() {
    const container = document.getElementById('imagesContainer');
    container.innerHTML = '';
    imageSlots.forEach((slot) => {
        const div = document.createElement('div');
        div.className = 'image-item';
        div.innerHTML = `
            <div class="image-preview" id="preview-${slot.id}">
                ${slot.preview ? `<img src="${slot.preview}">` : 'Chưa chọn ảnh'}
            </div>
            <input type="file" id="file-${slot.id}" accept="image/*" style="display:none"
                   onchange="handleFileSelect(${slot.id}, event)">
            <button class="btn-upload" onclick="document.getElementById('file-${slot.id}').click()">📁 Chọn ảnh</button>
            <button class="btn-delete" onclick="deleteImageSlot(${slot.id})">🗑️ Xóa</button>
        `;
        container.appendChild(div);
    });
}

function handleFileSelect(slotId, event) {
    const file = event.target.files[0];
    if (!file) return;
    const slot = imageSlots.find(s => s.id === slotId);
    slot.file = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        slot.preview = e.target.result;
        renderImageSlots();
    };
    reader.readAsDataURL(file);
}

function deleteImageSlot(slotId) {
    imageSlots = imageSlots.filter(s => s.id !== slotId);
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
    const el = document.getElementById('errorMessage');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
}

async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    if (!prompt) return showError('Vui lòng nhập prompt!');
    const files = imageSlots.filter(s => s.file);
    if (files.length === 0) return showError('Vui lòng upload ít nhất 1 ảnh!');

    document.getElementById('loading').style.display = 'block';
    document.getElementById('generateBtn').disabled = true;

    try {
        const images = await Promise.all(files.map(async (s) => ({
            base64: await fileToBase64(s.file),
            filename: s.file.name,
            mimetype: s.file.type
        })));

        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, images })
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        const imageUrl = data.fifeUrl || data.imageUrl || data.media?.[0]?.image?.generatedImage?.fifeUrl;

        if (imageUrl) {
            addResultImage(imageUrl);
            addHistoryImage(imageUrl);
        } else {
            showError('Không nhận được URL ảnh từ server');
        }

    } catch (err) {
        showError(err.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('generateBtn').disabled = false;
    }
}

function addResultImage(url) {
    const gallery = document.getElementById('resultsGallery');
    const img = document.createElement('img');
    img.src = url;
    img.className = 'result-thumb';
    img.alt = 'Generated';
    img.onclick = () => showModal(url);
    gallery.appendChild(img);
}

function addHistoryImage(url) {
    historyImages.push(url);
    const container = document.getElementById('historyList');
    const item = document.createElement('div');
    item.innerHTML = `<img src="${url}" width="60" style="border-radius:5px;margin-right:10px;">
                      <a href="${url}" target="_blank" download>Tải ảnh về</a>`;
    container.appendChild(item);
}

function showModal(url) {
    const modal = document.getElementById('imageModal');
    document.getElementById('modalImage').src = url;
    document.getElementById('downloadBtn').href = url;
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('imageModal').style.display = 'none';
}

addImageSlot();
