const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';

let imageSlots = [];
let slotCounter = 0;

function addImageSlot() {
  const slotId = slotCounter++;
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
      <span class="image-label">${isBase ? '🎯 Ảnh gốc (Base Image)' : `📷 Ảnh tham khảo ${index}`}</span>
      <div class="image-preview ${slot.preview ? '' : 'empty'}" id="preview-${slot.id}">
        ${slot.preview ? `<img src="${slot.preview}">` : 'Chưa chọn ảnh'}
      </div>
      <input type="file" id="file-${slot.id}" accept="image/*" onchange="handleFileSelect(${slot.id}, event)">
      <div class="image-actions">
        <button class="btn-upload" onclick="document.getElementById('file-${slot.id}').click()">
          ${slot.file ? '🔄 Đổi ảnh' : '📁 Chọn ảnh'}
        </button>
        <button class="btn-delete" onclick="deleteImageSlot(${slot.id})" ${isBase && imageSlots.length === 1 ? 'disabled' : ''}>
          🗑️ Xóa
        </button>
      </div>`;
    container.appendChild(div);
  });
}

function handleFileSelect(slotId, event) {
  const file = event.target.files[0];
  if (!file) return;
  const slot = imageSlots.find(s => s.id === slotId);
  if (!slot) return;
  slot.file = file;
  const reader = new FileReader();
  reader.onload = e => {
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

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

async function generateImage() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) return showError('Vui lòng nhập prompt!');
  const uploadedImages = imageSlots.filter(s => s.file);
  if (uploadedImages.length === 0) return showError('Vui lòng upload ít nhất 1 ảnh!');

  document.getElementById('loading').classList.add('show');
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('resultSection').classList.remove('show');

  try {
    const images = await Promise.all(
      uploadedImages.map(async slot => ({
        base64: await fileToBase64(slot.file),
        filename: slot.file.name,
        mimetype: slot.file.type
      }))
    );

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, images })
    });

    if (!response.ok) throw new Error(`Webhook error: ${response.status}`);

    const result = await response.json();
    const imageUrl = result?.media?.[0]?.image?.generatedImage?.fifeUrl || result.imageUrl || result.url;

    if (!imageUrl) throw new Error('Không nhận được URL ảnh từ server');

    document.getElementById('resultImage').src = imageUrl;
    document.getElementById('resultUrl').textContent = imageUrl;
    document.getElementById('resultSection').classList.add('show');

    // ✅ Show floating preview panel
    document.getElementById('previewPanel').style.display = 'block';
    document.getElementById('previewPanelImage').src = imageUrl;
    document.getElementById('previewPanelUrl').textContent = imageUrl;

  } catch (error) {
    console.error(error);
    showError('Có lỗi xảy ra: ' + error.message);
  } finally {
    document.getElementById('loading').classList.remove('show');
    document.getElementById('generateBtn').disabled = false;
  }
}

addImageSlot();
