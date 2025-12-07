// ✅ Webhook backend N8N của bạn
const WEBHOOK_URL = 'https://rasp.nthang91.io.vn/webhook/b35794c9-a28f-44ee-8242-983f9d7a4855';

let imageSlots = [];
let slotCounter = 0;

// ✅ Tạo slot ảnh đầu tiên khi load trang
addImageSlot();

// ✅ Thêm slot ảnh mới
function addImageSlot() {
  const slotId = slotCounter++;
  const slot = {
    id: slotId,
    file: null,
    preview: null,
    uploaded: false
  };
  imageSlots.push(slot);
  renderImageSlots();
}

// ✅ Vẽ lại giao diện các ảnh đã chọn
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
      </div>
    `;
    container.appendChild(div);
  });
}

// ✅ Xử lý khi người dùng chọn ảnh
function handleFileSelect(slotId, event) {
  const file = event.target.files[0];
  if (!file) return;

  const slot = imageSlots.find(s => s.id === slotId);
  if (!slot) return;

  slot.file = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    slot.preview = e.target.result;
    renderImageSlots();
  };
  reader.readAsDataURL(file);
}

// ✅ Xoá ảnh
function deleteImageSlot(slotId) {
  imageSlots = imageSlots.filter(s => s.id !== slotId);
  renderImageSlots();
}

// ✅ Chuyển file thành base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ✅ Hiển thị lỗi
function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

// ✅ Gửi yêu cầu tạo ảnh
async function generateImage() {
  const prompt = document.getElementById('prompt').value.trim();

  if (!prompt) {
    showError('Vui lòng nhập prompt!');
    return;
  }

  const uploadedImages = imageSlots.filter(s => s.file);
  if (uploadedImages.length === 0) {
    showError('Vui lòng upload ít nhất 1 ảnh!');
    return;
  }

  document.getElementById('loading').classList.add('show');
  document.getElementById('generateBtn').disabled = true;

  try {
    const images = await Promise.all(
      uploadedImages.map(async (slot) => ({
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const imageUrl = result.imageUrl || result.fifeUrl || result.url;

    if (imageUrl) {
      addResultImage(imageUrl);
    } else {
      throw new Error('Không nhận được URL ảnh từ server');
    }

  } catch (error) {
    console.error(error);
    showError('Có lỗi xảy ra: ' + error.message);
  } finally {
    document.getElementById('loading').classList.remove('show');
    document.getElementById('generateBtn').disabled = false;
  }
}

// ✅ Thêm ảnh kết quả vào giao diện + lịch sử
function addResultImage(imageUrl) {
  const gallery = document.getElementById('resultsGallery');
  const thumb = document.createElement('img');
  thumb.src = imageUrl;
  thumb.className = 'result-thumb';
  thumb.alt = 'Generated Image';
  thumb.onclick = () => showImageModal(imageUrl);
  gallery.prepend(thumb);

  const historyList = document.getElementById('historyList');
  const historyItem = document.createElement('div');
  historyItem.innerHTML = `
    <img src="${imageUrl}" class="result-thumb" onclick="showImageModal('${imageUrl}')">
  `;
  historyList.prepend(historyItem);

  document.getElementById('resultsSection').classList.add('show');
}

// ✅ Hiển thị popup preview
function showImageModal(url) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  const downloadBtn = document.getElementById('downloadBtn');

  modal.style.display = 'block';
  modalImg.src = url;
  downloadBtn.href = url;
}

// ✅ Đóng popup
function closeModal() {
  document.getElementById('imageModal').style.display = 'none';
}
