const imagesInput = document.getElementById('images');
const fileDrop = document.getElementById('fileDrop');
const preview = document.getElementById('preview');
const imageError = document.getElementById('imageError');
const resultImages = document.getElementById('resultImages');
const resultsEmpty = document.getElementById('resultsEmpty');
const modalOverlay = document.getElementById('modalOverlay');
const modalImg = document.getElementById('modalImg');
const toast = document.getElementById('toast');
const IMGBB_KEY = '491b3ef8be2a261efff29b2af785c845';

let selectedFiles = [];

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function renderPreview() {
  preview.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = e => {
      const wrapper = document.createElement('div');
      wrapper.className = 'thumb';

      const img = document.createElement('img');
      img.src = e.target.result;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'thumb-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = 'Xóa ảnh này';
      removeBtn.onclick = () => {
        selectedFiles.splice(index, 1);
        renderPreview();
      };

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      preview.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
  });
}

function addFiles(files) {
  const incoming = Array.from(files);
  if (selectedFiles.length + incoming.length > 10) {
    imageError.textContent = 'Tối đa chỉ 10 ảnh tham chiếu.';
    return;
  }
  const valid = incoming.filter(f => /image\/(png|jpeg|jpg)/i.test(f.type));
  if (valid.length < incoming.length) {
    imageError.textContent = 'Một số ảnh không phải PNG/JPG nên đã bị bỏ qua.';
  }
  selectedFiles = selectedFiles.concat(valid);
  renderPreview();
}

fileDrop.addEventListener('click', () => {
  imagesInput.click();
});

imagesInput.addEventListener('change', (e) => {
  imageError.textContent = '';
  if (e.target.files && e.target.files.length > 0) {
    addFiles(e.target.files);
  }
  imagesInput.value = '';
});

['dragenter', 'dragover'].forEach(evt => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDrop.style.borderColor = '#3b82f6';
  });
});
['dragleave', 'drop'].forEach(evt => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDrop.style.borderColor = 'rgba(75, 85, 99, 0.9)';
  });
});
fileDrop.addEventListener('drop', (e) => {
  imageError.textContent = '';
  const dt = e.dataTransfer;
  if (dt && dt.files) {
    addFiles(dt.files);
  }
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  const files = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const blob = items[i].getAsFile();
      if (blob) {
        files.push(blob);
      }
    }
  }
  if (files.length > 0) {
    imageError.textContent = '';
    addFiles(files);
    showToast('✅ Đã paste ' + files.length + ' ảnh từ clipboard.');
  }
});

async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append('key', IMGBB_KEY);
  formData.append('image', file);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error('ImgBB upload failed');
  }
  return data.data.url;
}

async function downloadImage(url, filename = 'seedream-output.png', btnEl) {
  try {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Đang tải...';

    const res = await fetch(url);
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    showToast('✅ Đã tải ảnh: ' + filename);
  } catch (err) {
    showToast('❌ Lỗi tải ảnh: ' + err.message);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = '⬇ Tải ảnh';
  }
}

function openZoomModal(src) {
  modalImg.src = src;
  modalOverlay.classList.add('show');
}
function closeZoomModal() {
  modalOverlay.classList.remove('show');
  modalImg.src = '';
}
modalOverlay.addEventListener('click', closeZoomModal);

document.getElementById('aiForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  imageError.textContent = '';

  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) {
    alert('Prompt là bắt buộc.');
    return;
  }
  if (selectedFiles.length === 0) {
    imageError.textContent = 'Cần ít nhất 1 ảnh tham chiếu PNG/JPG.';
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');

  submitBtn.disabled = true;
  loading.style.display = 'block';
  resultImages.innerHTML = '';
  resultsEmpty.style.display = 'none';

  try {
    const imageUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const url = await uploadToImgBB(selectedFiles[i]);
      imageUrls.push(url);
    }

    const payload = {
      mode: document.getElementById('mode').value,
      prompt,
      image_size: document.getElementById('imageSize').value,
      image_resolution: document.getElementById('imageResolution').value,
      max_images: 1,
      seed: document.getElementById('seed').value || null,
      image_urls: imageUrls
    };

    const res = await fetch('https://rasp.nthang91.io.vn/webhook/60e246a1-1107-49ed-a729-19fc122fe0de', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Response from n8n:', data);

    resultImages.innerHTML = '';
    if (data.error) {
      resultsEmpty.style.display = 'block';
      resultsEmpty.textContent = 'Lỗi: ' + (data.error.state || data.error);
    } else if (data.images && data.images.length > 0) {
      data.images.forEach((url, idx) => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const img = document.createElement('img');
        img.src = url;
        img.onclick = () => openZoomModal(url);

        const btn = document.createElement('button');
        btn.className = 'download-btn';
        btn.type = 'button';
        btn.textContent = '⬇ Tải ảnh';
        btn.onclick = function() {
          downloadImage(url, `seedream-${idx + 1}.png`, btn);
        };

        card.appendChild(img);
        card.appendChild(btn);
        resultImages.appendChild(card);
      });
      resultsEmpty.style.display = 'none';
      showToast('✅ Hoàn thành! Nhấp vào ảnh để phóng to.');
    } else {
      resultsEmpty.style.display = 'block';
      resultsEmpty.textContent = 'Không nhận được URL ảnh từ server.';
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
    console.error(err);
    resultsEmpty.style.display = 'block';
    resultsEmpty.textContent = 'Đã xảy ra lỗi khi xử lý yêu cầu.';
  } finally {
    submitBtn.disabled = false;
    loading.style.display = 'none';
  }
});
