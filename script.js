// Thumbnail Maker - multi-image canvas editor
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const imageInput = document.getElementById('image-input');
  const openEditorBtn = document.getElementById('openEditorBtn');
  const editorContainer = document.getElementById('editor-container');
  const canvas = document.getElementById('imageCanvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const cropOverlay = document.getElementById('cropOverlay');
  const layersList = document.getElementById('layersList');
  const thumbnailGrid = document.querySelector('.thumbnail-grid');

  // Controls (guard each selector)
  const tabButtons = document.querySelectorAll('.tab-btn');
  const rotateLeftBtn = document.getElementById('rotateLeft');
  const rotateRightBtn = document.getElementById('rotateRight');
  const flipHorizontalBtn = document.getElementById('flipHorizontal');
  const flipVerticalBtn = document.getElementById('flipVertical');
  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');
  const brightnessSlider = document.getElementById('brightness');
  const contrastSlider = document.getElementById('contrast');
  const saturationSlider = document.getElementById('saturation');
  const grayscaleSlider = document.getElementById('grayscale');
  const blurSlider = document.getElementById('blur');
  const cropToggle = document.getElementById('cropToggle');
  const applyCrop = document.getElementById('applyCrop');
  const cancelCrop = document.getElementById('cancelCrop');
  const saveEditBtn = document.getElementById('saveEdit');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewImage = document.getElementById('previewImage');
  const savePreview = document.getElementById('savePreview');
  const downloadPreview = document.getElementById('downloadPreview');
  const textInput = document.getElementById('textInput');
  const addTextBtn = document.getElementById('addTextBtn');
  const fontFamily = document.getElementById('fontFamily');
  const fontSize = document.getElementById('fontSize');
  const textColor = document.getElementById('textColor');

  if (!canvas || !ctx) return console.error('Canvas not found or context unavailable');

  // State
  const layers = []; // { img, name, x, y, width, height, scale, rotation, visible }
  let selectedLayerIndex = -1;
  let dragging = false;
  const dragOffset = { x: 0, y: 0 };
  let cropMode = false;
  let cropRect = null;
  let cropStart = null;
  const undoStack = [];
  const thumbnails = [];

  // Tab switching
  function switchTab(name) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
  }
  tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Helpers
  function pushUndo() {
    try {
      if (undoStack.length > 30) undoStack.shift();
      undoStack.push(canvas.toDataURL('image/png'));
      if (undoBtn) undoBtn.disabled = false;
    } catch (e) { /* ignore */ }
  }
  function undo() {
    if (!undoStack.length) return;
    const data = undoStack.pop();
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
      refreshLayersList();
    };
    img.src = data;
    if (undoBtn && !undoStack.length) undoBtn.disabled = true;
  }

  function applyFilterString() {
    const b = brightnessSlider ? brightnessSlider.value : 100;
    const c = contrastSlider ? contrastSlider.value : 100;
    const s = saturationSlider ? saturationSlider.value : 100;
    const g = grayscaleSlider ? grayscaleSlider.value : 0;
    const bl = blurSlider ? blurSlider.value : 0;
    return `brightness(${b}%) contrast(${c}%) saturate(${s}%) grayscale(${g}%) blur(${bl}px)`;
  }

  // Layers UI
  function refreshLayersList() {
    if (!layersList) return;
    layersList.innerHTML = '';
    // show top layer first for user; map index accordingly
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idx = i;
      const el = document.createElement('div');
      el.className = 'layer-item' + (idx === selectedLayerIndex ? ' selected' : '');
      el.innerHTML = `
        <span class="layer-name">${layer.name}</span>
        <div class="layer-controls">
          <button data-action="select" data-index="${idx}">Select</button>
          <button data-action="vis" data-index="${idx}">${layer.visible ? 'Hide' : 'Show'}</button>
          <button data-action="up" data-index="${idx}">Up</button>
          <button data-action="down" data-index="${idx}">Down</button>
          <button data-action="del" data-index="${idx}">Del</button>
        </div>
      `;
      layersList.appendChild(el);
    }
  }
  if (layersList) {
    layersList.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = Number(btn.dataset.index);
      if (action === 'select') selectedLayerIndex = idx;
      else if (action === 'vis') { layers[idx].visible = !layers[idx].visible; }
      else if (action === 'del') { layers.splice(idx, 1); if (selectedLayerIndex === idx) selectedLayerIndex = -1; pushUndo(); }
      else if (action === 'up' && idx < layers.length - 1) { [layers[idx], layers[idx+1]] = [layers[idx+1], layers[idx]]; }
      else if (action === 'down' && idx > 0) { [layers[idx], layers[idx-1]] = [layers[idx-1], layers[idx]]; }
      refreshLayersList(); updateCanvas();
    });
  }

  // Load multiple images
  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      pushUndo();
      let loaded = 0;
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const layer = {
              img,
              name: file.name || `img${layers.length+1}`,
              width: img.width,
              height: img.height,
              scale: 1,
              rotation: 0,
              x: (layers.length + 1) * 40 + img.width/2,
              y: (layers.length + 1) * 40 + img.height/2,
              visible: true
            };
            layers.push(layer);
            loaded++;
            if (loaded === files.length) {
              adjustCanvasToFitLayers();
              refreshLayersList();
              updateCanvas();
              if (editorContainer) editorContainer.classList.remove('hidden');
              switchTab('editor');
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    });
  }

  if (openEditorBtn) {
    openEditorBtn.addEventListener('click', () => {
      const files = Array.from(imageInput.files || []);
      if (!files.length) return imageInput.click();
      const evt = new Event('change'); imageInput.dispatchEvent(evt);
    });
  }

  function adjustCanvasToFitLayers() {
    if (layers.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layers.forEach(l => {
      const w = l.width * l.scale, h = l.height * l.scale;
      minX = Math.min(minX, l.x - w/2);
      minY = Math.min(minY, l.y - h/2);
      maxX = Math.max(maxX, l.x + w/2);
      maxY = Math.max(maxY, l.y + h/2);
    });
    const margin = 40;
    const newW = Math.max(400, Math.ceil(maxX - minX + margin * 2));
    const newH = Math.max(300, Math.ceil(maxY - minY + margin * 2));
    const offsetX = Math.abs(Math.min(0, minX - margin));
    const offsetY = Math.abs(Math.min(0, minY - margin));
    layers.forEach(l => { l.x += offsetX; l.y += offsetY; });
    canvas.width = newW; canvas.height = newH;
  }

  // Drawing
  function updateCanvas() {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    try { ctx.filter = applyFilterString(); } catch (e) { ctx.filter = 'none'; }

    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l.visible) continue;

      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate((l.rotation || 0) * Math.PI / 180);
      ctx.scale(l.scale || 1, l.scale || 1);

      if (l.type === 'text') {
        // Draw text
        ctx.font = l.font;
        ctx.fillStyle = l.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.text, 0, 0);
      } else {
        // Draw image
        ctx.drawImage(l.img, -l.width/2, -l.height/2, l.width, l.height);
      }
      ctx.restore();
    }

    // Draw selection rectangle
    if (selectedLayerIndex >= 0 && layers[selectedLayerIndex]) {
      const s = layers[selectedLayerIndex];
      ctx.save();
      ctx.strokeStyle = 'rgba(255,0,0,0.8)';
      ctx.lineWidth = 2;
      ctx.translate(s.x, s.y);
      ctx.rotate((s.rotation || 0) * Math.PI / 180);
      const w = s.type === 'text' ? s.width : s.width;
      const h = s.type === 'text' ? s.height : s.height;
      ctx.strokeRect(-w/2, -h/2, w, h);
      ctx.restore();
    }

    drawCropOverlay();
    if (previewImage) previewImage.src = canvas.toDataURL('image/png');
  }

  // Interaction: pick and drag
  function getCanvasPoint(evt) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (canvas.width / r.width),
      y: (evt.clientY - r.top) * (canvas.height / r.height)
    };
  }
  function hitTestLayer(layer, px, py) {
    const dx = px - layer.x, dy = py - layer.y;
    const angle = - (layer.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const lx = (dx * cos - dy * sin) / (layer.scale || 1);
    const ly = (dx * sin + dy * cos) / (layer.scale || 1);
    return lx >= -layer.width/2 && lx <= layer.width/2 && ly >= -layer.height/2 && ly <= layer.height/2;
  }

  canvas.addEventListener('mousedown', (e) => {
    const p = getCanvasPoint(e);
    if (cropMode) {
      cropStart = { x: p.x, y: p.y }; cropRect = { x: p.x, y: p.y, w: 0, h: 0 };
      drawCropOverlay(); return;
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      if (!layers[i].visible) continue;
      if (hitTestLayer(layers[i], p.x, p.y)) {
        selectedLayerIndex = i;
        dragOffset.x = p.x - layers[i].x; dragOffset.y = p.y - layers[i].y;
        dragging = true; pushUndo(); refreshLayersList(); updateCanvas();
        return;
      }
    }
    selectedLayerIndex = -1; refreshLayersList(); updateCanvas();
  });

  window.addEventListener('mousemove', (e) => {
    const p = getCanvasPoint(e);
    if (cropMode && cropStart) {
      const x0 = Math.min(cropStart.x, p.x), y0 = Math.min(cropStart.y, p.y);
      cropRect = { x: x0, y: y0, w: Math.abs(p.x - cropStart.x), h: Math.abs(p.y - cropStart.y) };
      drawCropOverlay(); return;
    }
    if (!dragging) return;
    if (selectedLayerIndex >= 0) {
      layers[selectedLayerIndex].x = p.x - dragOffset.x;
      layers[selectedLayerIndex].y = p.y - dragOffset.y;
      updateCanvas();
    }
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    if (cropMode) cropStart = null;
  });

  canvas.addEventListener('wheel', (e) => {
    if (selectedLayerIndex < 0) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const layer = layers[selectedLayerIndex];
    layer.scale = Math.max(0.05, (layer.scale || 1) + delta);
    updateCanvas();
  });

  // Crop UI
  function enableCropMode(enabled) {
    cropMode = enabled;
    if (cropOverlay) cropOverlay.classList.toggle('hidden', !enabled);
    if (applyCrop) applyCrop.disabled = !enabled;
    if (cancelCrop) cancelCrop.disabled = !enabled;
    if (cropToggle) cropToggle.classList.toggle('active', enabled);
    if (!enabled) { cropRect = null; cropStart = null; drawCropOverlay(); }
  }
  function drawCropOverlay() {
    if (!cropOverlay) return;
    if (!cropMode || !cropRect) { cropOverlay.style.display = 'none'; return; }
    cropOverlay.style.display = 'block';
    const rect = canvas.getBoundingClientRect();
    const left = rect.left + (cropRect.x / canvas.width) * rect.width;
    const top = rect.top + (cropRect.y / canvas.height) * rect.height;
    const w = (cropRect.w / canvas.width) * rect.width;
    const h = (cropRect.h / canvas.height) * rect.height;
    cropOverlay.style.left = left + 'px';
    cropOverlay.style.top = top + 'px';
    cropOverlay.style.width = w + 'px';
    cropOverlay.style.height = h + 'px';
  }

  if (applyCrop) applyCrop.addEventListener('click', () => {
    if (!cropRect || cropRect.w === 0 || cropRect.h === 0) return alert('Make selection first');
    pushUndo();
    const tmp = document.createElement('canvas'); tmp.width = Math.round(cropRect.w); tmp.height = Math.round(cropRect.h);
    const tctx = tmp.getContext('2d');
    tctx.drawImage(canvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, tmp.width, tmp.height);
    const img = new Image();
    img.onload = () => {
      layers.length = 0;
      layers.push({ img, name: 'cropped.png', width: img.width, height: img.height, scale:1, rotation:0, x: img.width/2, y: img.height/2, visible:true });
      selectedLayerIndex = 0; adjustCanvasToFitLayers(); refreshLayersList(); updateCanvas(); enableCropMode(false);
    };
    img.src = tmp.toDataURL('image/png');
  });
  if (cancelCrop) cancelCrop.addEventListener('click', () => enableCropMode(false));
  if (cropToggle) cropToggle.addEventListener('click', () => enableCropMode(!cropMode));

  // Controls
  if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', () => {
    if (selectedLayerIndex < 0) return alert('Select a layer');
    pushUndo(); layers[selectedLayerIndex].rotation -= 90; updateCanvas();
  });
  if (rotateRightBtn) rotateRightBtn.addEventListener('click', () => {
    if (selectedLayerIndex < 0) return alert('Select a layer');
    pushUndo(); layers[selectedLayerIndex].rotation += 90; updateCanvas();
  });
  if (flipHorizontalBtn) flipHorizontalBtn.addEventListener('click', () => {
    if (selectedLayerIndex < 0) return alert('Select a layer');
    pushUndo(); layers[selectedLayerIndex].scale = -(layers[selectedLayerIndex].scale || 1); updateCanvas();
  });
  if (flipVerticalBtn) flipVerticalBtn.addEventListener('click', () => {
    if (selectedLayerIndex < 0) return alert('Select a layer');
    pushUndo(); layers[selectedLayerIndex].rotation += 180; updateCanvas();
  });

  [brightnessSlider, contrastSlider, saturationSlider, grayscaleSlider, blurSlider].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => updateCanvas());
  });

  if (undoBtn) undoBtn.addEventListener('click', () => undo());
  if (resetBtn) resetBtn.addEventListener('click', () => {
    pushUndo();
    if (brightnessSlider) brightnessSlider.value = 100;
    if (contrastSlider) contrastSlider.value = 100;
    if (saturationSlider) saturationSlider.value = 100;
    if (grayscaleSlider) grayscaleSlider.value = 0;
    if (blurSlider) blurSlider.value = 0;
    updateCanvas();
  });

  // Save / download
  if (saveEditBtn) saveEditBtn.addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const name = 'composite-' + Date.now() + '.jpg';
    addThumbnailToGallery({ url: dataUrl, name, date: new Date().toLocaleString() });
    alert('Saved to gallery');
  });
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    const a = document.createElement('a'); a.download = 'composite.png'; a.href = canvas.toDataURL('image/png'); a.click();
  });

  if (savePreview) savePreview.addEventListener('click', () => {
    if (!previewImage || !previewImage.src) return alert('Nothing to save');
    addThumbnailToGallery({ url: previewImage.src, name: 'preview-' + Date.now() + '.png', date: new Date().toLocaleString() });
  });
  if (downloadPreview) downloadPreview.addEventListener('click', () => {
    if (!previewImage || !previewImage.src) return alert('No preview');
    const a = document.createElement('a'); a.href = previewImage.src; a.download = 'preview.png'; a.click();
  });

  // Text handling
  if (addTextBtn) {
    addTextBtn.addEventListener('click', () => {
      if (!textInput || !textInput.value.trim()) {
        alert('Please enter some text');
        return;
      }

      const text = textInput.value;
      const font = `${fontSize.value}px ${fontFamily.value}`;
      
      // Measure text for initial sizing
      ctx.font = font;
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = parseInt(fontSize.value);

      // Create text layer
      const textLayer = {
        type: 'text', // Add type to distinguish from image layers
        text,
        font,
        color: textColor.value,
        name: 'Text: ' + text.substring(0, 20),
        width: textWidth,
        height: textHeight,
        scale: 1,
        rotation: 0,
        x: canvas.width / 2,
        y: canvas.height / 2,
        visible: true
      };

      pushUndo();
      layers.push(textLayer);
      selectedLayerIndex = layers.length - 1;
      refreshLayersList();
      updateCanvas();
      textInput.value = '';
    });
  }

  // Gallery functions
  function addThumbnailToGallery(thumbnail) {
    thumbnails.push(thumbnail);
    if (!thumbnailGrid) return;
    const el = document.createElement('div'); el.className = 'thumbnail';
    el.innerHTML = `<img src="${thumbnail.url}" alt="${thumbnail.name}"><div class="thumbnail-info"><p>${thumbnail.name}</p><small>${thumbnail.date}</small></div>`;
    thumbnailGrid.appendChild(el);
    saveThumbnails();
  }
  function saveThumbnails() { try { localStorage.setItem('thumbnails', JSON.stringify(thumbnails)); } catch (e) {} }
  function loadThumbnails() {
    try {
      const saved = JSON.parse(localStorage.getItem('thumbnails') || '[]');
      saved.forEach(t => addThumbnailToGallery(t));
    } catch (e) {}
  }
  loadThumbnails();

  // initialize canvas with sensible size
  canvas.width = 1000; canvas.height = 600;
  updateCanvas();
});