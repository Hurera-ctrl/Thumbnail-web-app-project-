// Simple canvas thumbnail editor with multiple images and text (draggable/resizable), RTL support

const canvas = document.getElementById('canvas');
// allow transparency on canvas
const ctx = canvas.getContext('2d', { alpha: true });

const bgInput = document.getElementById('bg-color');
const imageUpload = document.getElementById('image-upload');
const textInput = document.getElementById('text-input');
const addTextBtn = document.getElementById('add-text');
const fontSelect = document.getElementById('font-select');
const fontSizeInput = document.getElementById('font-size');
const fontColorInput = document.getElementById('font-color');
const rtlToggle = document.getElementById('rtl-toggle');
const shadowToggle = document.getElementById('shadow-toggle');
const downloadBtn = document.getElementById('download');
const clearBtn = document.getElementById('clear');
const bringFrontBtn = document.getElementById('bring-front');
const sendBackBtn = document.getElementById('send-back');
const deleteBtn = document.getElementById('delete-obj');

let backgroundColor = bgInput.value;
let backgroundImage = null; // optional raster preview for transparent bg
let objects = []; // { type:'image'|'text', x,y,width,height, ... }
let selected = null;
let dragging = false;
let resizing = false;
let resizeHandle = null;
let offsetX = 0, offsetY = 0;
const handleSize = 10;

// --- Selection tool (top-center) ---
// toggle selection mode and multi-select / marquee support
let selectionMode = false;
let selectedObjects = []; // when selectionMode active, holds multiple selected items
let isSelecting = false;
let selectionRect = null;
let selectStartX = 0, selectStartY = 0;
let groupDragging = false;
let groupDragOffsets = [];

// create top-center selection button with icon
const selectionBtn = document.createElement('button');
selectionBtn.id = 'selection-tool-btn';
selectionBtn.type = 'button';
selectionBtn.title = 'Selection tool (toggle)';
selectionBtn.innerHTML = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 3L21 3L21 21L3 21Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 7L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 7L7 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;
Object.assign(selectionBtn.style, {
  position: 'fixed',
  top: '8px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '9999',
  background: '#fff',
  border: '1px solid #ddd',
  padding: '6px 8px',
  borderRadius: '6px',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
});
document.body.appendChild(selectionBtn);

selectionBtn.addEventListener('click', () => {
  selectionMode = !selectionMode;
  selectionBtn.style.background = selectionMode ? '#eef6ff' : '#fff';
  canvas.style.cursor = selectionMode ? 'crosshair' : 'default';
  // clear marquee when toggled off
  if (!selectionMode) {
    isSelecting = false;
    selectionRect = null;
    selectedObjects = [];
    groupDragging = false;
    groupDragOffsets = [];
    draw();
  }
});

// helpers for multi-selection
function clearSelection() {
  selectedObjects = [];
  selected = null;
  draw();
}
function selectObjectMulti(obj, additive = false) {
  if (!obj) {
    if (!additive) clearSelection();
    return;
  }
  if (!additive) selectedObjects = [obj];
  else {
    const i = selectedObjects.indexOf(obj);
    if (i === -1) selectedObjects.push(obj);
    else selectedObjects.splice(i, 1);
  }
  selected = selectedObjects[0] || null;
  draw();
}
function getObjectsInRect(rect) {
  const res = [];
  for (const obj of objects) {
    const ox = obj.x, oy = obj.y, ow = obj.width, oh = obj.height;
    if (!(ox + ow < rect.x || ox > rect.x + rect.width || oy + oh < rect.y || oy > rect.y + rect.height)) {
      res.push(obj);
    }
  }
  return res;
}

// Replace Transparent BG button with a checkbox (aligned with the color input)
const bgWrapper = document.createElement('div');
bgWrapper.style.display = 'flex';
bgWrapper.style.alignItems = 'center';
bgWrapper.style.gap = '8px';
bgWrapper.style.marginTop = '8px';

// insert wrapper before the existing bgInput and move bgInput into it
bgInput.parentNode.insertBefore(bgWrapper, bgInput);
bgWrapper.appendChild(bgInput);

// create checkbox + label
const transparentCheckbox = document.createElement('input');
transparentCheckbox.type = 'checkbox';
transparentCheckbox.id = 'transparent-checkbox';
transparentCheckbox.style.marginLeft = '4px';
transparentCheckbox.style.cursor = 'pointer';

const transparentLabel = document.createElement('label');
transparentLabel.htmlFor = transparentCheckbox.id;
transparentLabel.style.display = 'flex';
transparentLabel.style.alignItems = 'center';
transparentLabel.style.cursor = 'pointer';
transparentLabel.style.fontSize = '13px';
transparentLabel.style.gap = '6px';
transparentLabel.appendChild(transparentCheckbox);
transparentLabel.appendChild(document.createTextNode('Transparent BG'));

// append label into wrapper
bgWrapper.appendChild(transparentLabel);

// store previous solid color to restore when toggling back
let prevBackgroundColor = backgroundColor;

// raster background image used when "Transparent BG" is enabled
const rasterBgURL = 'https://thumbs.dreamstime.com/z/transparent-light-background-mesh-gray-white-chess-seamless-pattern-checker-texture-square-geometric-grid-vector-illustration-274254328.jpg?w=768';

// loader for the raster transparent-background preview (if not already present)
function loadRasterBackground(url) {
  if (!url) { backgroundImage = null; draw(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { backgroundImage = img; draw(); };
  img.onerror = () => { backgroundImage = null; console.warn('Failed to load background image:', url); draw(); };
  img.src = url;
}

// attach behavior: when checkbox checked use raster image as the transparent background
transparentCheckbox.addEventListener('change', () => {
  if (transparentCheckbox.checked) {
    prevBackgroundColor = backgroundColor;
    backgroundColor = 'transparent';
    loadRasterBackground(rasterBgURL);
  } else {
    backgroundImage = null;
    backgroundColor = prevBackgroundColor || '#ffffff';
    bgInput.value = backgroundColor;
    draw();
  }
});

// ensure picking a color disables transparent mode and clears the raster bg
bgInput.addEventListener('input', (e) => {
  backgroundColor = e.target.value;
  prevBackgroundColor = backgroundColor;
  if (transparentCheckbox && transparentCheckbox.checked) {
    transparentCheckbox.checked = false;
    backgroundImage = null;
  }
  draw();
});

// helper: draw multiline text with optional letter spacing, stroke, gradient, rtl
function drawTextObject(obj) {
  ctx.save();
  const fontStyle = (obj.italic ? 'italic ' : '') + (obj.bold ? 'bold ' : '') + `${obj.size}px "${obj.font}", sans-serif`;
  ctx.font = fontStyle;
  ctx.textBaseline = 'top';
  ctx.direction = obj.rtl ? 'rtl' : 'ltr';
  ctx.lineWidth = obj.strokeWidth || 2;

  // prepare fill style (gradient if requested)
  if (obj.gradient) {
    // simple horizontal gradient across text box
    const g = ctx.createLinearGradient(obj.x, obj.y, obj.x + obj.width, obj.y);
    g.addColorStop(0, obj.gradientFrom || obj.color);
    g.addColorStop(1, obj.gradientTo || '#ffffff');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = obj.color;
  }

  // shadow
  if (obj.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
  } else {
    ctx.shadowColor = 'transparent';
  }

  // draw each line with letter spacing support
  const lines = (obj.text || '').split('\n');
  const lineHeight = Math.ceil(obj.size * (obj.lineHeight || 1.2));
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let x = obj.x;
    const y = obj.y + li * lineHeight;
    if (obj.rtl) {
      // for rtl we position by right edge
      ctx.textAlign = 'right';
      x = obj.x + obj.width;
    } else {
      ctx.textAlign = 'left';
    }

    if (!obj.letterSpacing || obj.letterSpacing === 0) {
      // normal fill and optional stroke
      if (obj.stroke) {
        ctx.strokeStyle = obj.strokeColor || '#000';
        ctx.strokeText(line, x, y);
      }
      ctx.fillText(line, x, y);
    } else {
      // render letter-by-letter to simulate letter-spacing
      const gap = obj.letterSpacing;
      // measure each glyph width; for rtl iterate reverse
      if (obj.rtl) {
        // start at right, subtract widths
        let cursor = x;
        for (let k = line.length - 1; k >= 0; k--) {
          const ch = line[k];
          const m = ctx.measureText(ch).width;
          cursor -= m;
          if (obj.stroke) ctx.strokeText(ch, cursor, y);
          ctx.fillText(ch, cursor, y);
          cursor -= gap;
        }
      } else {
        let cursor = x;
        for (let k = 0; k < line.length; k++) {
          const ch = line[k];
          if (obj.stroke) ctx.strokeText(ch, cursor, y);
          ctx.fillText(ch, cursor, y);
          const m = ctx.measureText(ch).width;
          cursor += m + gap;
        }
      }
    }
  }
  ctx.restore();
}

// simple hit test (axis-aligned bounding box)
function hitTest(x, y) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) return obj;
  }
  return null;
}

function isOnHandle(obj, x, y) {
  const hx = obj.x + obj.width - handleSize / 2;
  const hy = obj.y + obj.height - handleSize / 2;
  return x >= hx && x <= hx + handleSize && y >= hy && y <= hy + handleSize;
}

// draw function (single-selection UI)  — updated to show multi-selection outlines and marquee
function draw() {
  // clear / fill background depending on settings
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (backgroundImage) {
    try { ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height); } catch (e) { console.warn(e); }
  } else if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();

  for (const obj of objects) {
    if (obj.type === 'image') {
      ctx.save();
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((obj.rotation || 0) * Math.PI / 180);
      ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
      ctx.drawImage(obj.img, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
      ctx.restore();
    } else if (obj.type === 'text') {
      drawTextObject(obj);
    }
  }

  // draw multi-selection outlines if selectionMode active
  if (selectionMode && selectedObjects.length) {
    for (const obj of selectedObjects) {
      ctx.save();
      ctx.strokeStyle = '#2b6cb0';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(obj.x - 6, obj.y - 6, obj.width + 12, obj.height + 12);
      ctx.setLineDash([]);
      ctx.restore();
    }
    // draw resize handle on primary selected (first)
    const primary = selectedObjects[0];
    if (primary) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#2b6cb0';
      ctx.lineWidth = 1;
      ctx.fillRect(primary.x + primary.width - handleSize / 2, primary.y + primary.height - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(primary.x + primary.width - handleSize / 2, primary.y + primary.height - handleSize / 2, handleSize, handleSize);
      ctx.restore();
    }
  } else {
    // single selection outline (existing behavior)
    if (selected) {
      ctx.save();
      ctx.strokeStyle = '#2b6cb0';
      ctx.lineWidth = 2;
      ctx.strokeRect(selected.x - 4, selected.y - 4, selected.width + 8, selected.height + 8);
      // draw resize handle at bottom-right
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#2b6cb0';
      ctx.lineWidth = 1;
      ctx.fillRect(selected.x + selected.width - handleSize / 2, selected.y + selected.height - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(selected.x + selected.width - handleSize / 2, selected.y + selected.height - handleSize / 2, handleSize, handleSize);
      ctx.restore();
    }
  }

  // draw marquee selection rectangle if active
  if (isSelecting && selectionRect) {
    ctx.save();
    ctx.fillStyle = 'rgba(50,115,220,0.08)';
    ctx.strokeStyle = 'rgba(50,115,220,0.9)';
    ctx.lineWidth = 1;
    ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
    ctx.strokeRect(selectionRect.x + 0.5, selectionRect.y + 0.5, selectionRect.width, selectionRect.height);
    ctx.restore();
  }
}

// Image import (adds editable properties)
imageUpload.addEventListener('change', (e) => {
  const files = e.target.files;
  for (const f of files) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(600 / img.width, 400 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        objects.push({
          type: 'image',
          img,
          x: 50 + Math.random() * 60,
          y: 50 + Math.random() * 60,
          width: w,
          height: h,
          rotation: 0,
          flipX: false,
          flipY: false
        });
        draw();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  }
  imageUpload.value = '';
});

// Add text (includes effect properties)
addTextBtn.addEventListener('click', () => {
  const txt = textInput.value.trim();
  if (!txt) return;
  const font = fontSelect.value;
  const size = parseInt(fontSizeInput.value, 10) || 48;
  // measure approximate width using temporary ctx settings
  ctx.save();
  ctx.font = `${size}px "${font}", sans-serif`;
  const metrics = ctx.measureText(txt.split('\n')[0] || txt);
  ctx.restore();
  const width = Math.ceil(metrics.width) + 20;
  const height = Math.ceil(size * 1.2 * Math.max(1, txt.split('\n').length));
  objects.push({
    type: 'text',
    text: txt,
    font,
    size,
    color: fontColorInput.value,
    x: 50,
    y: 50,
    width,
    height,
    rtl: rtlToggle.checked,
    shadow: shadowToggle.checked,
    // new effect defaults
    stroke: false,
    strokeColor: '#000000',
    strokeWidth: 2,
    gradient: false,
    gradientFrom: fontColorInput.value,
    gradientTo: '#ffffff',
    letterSpacing: 0,
    bold: false,
    italic: false,
    lineHeight: 1.2
  });
  textInput.value = '';
  draw();
});

// Mouse interactions (single selection: drag / resize)
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);

  const obj = hitTest(x, y);
  if (obj) {
    selected = obj;
    // check resize handle
    if (isOnHandle(obj, x, y)) {
      resizing = true;
      resizeHandle = 'br';
    } else {
      dragging = true;
      offsetX = x - obj.x;
      offsetY = y - obj.y;
    }
    // bring selection to top on click
    const idx = objects.indexOf(obj);
    if (idx >= 0) objects.splice(idx, 1), objects.push(obj);
  } else {
    selected = null;
  }
  draw();
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);

  if (dragging && selected) {
    selected.x = x - offsetX;
    selected.y = y - offsetY;
    draw();
  } else if (resizing && selected) {
    const newW = Math.max(20, x - selected.x);
    const newH = Math.max(20, y - selected.y);
    if (selected.type === 'image') {
      selected.width = newW;
      selected.height = newH;
    } else if (selected.type === 'text') {
      selected.width = newW;
      selected.height = newH;
      selected.size = Math.max(8, Math.round(newH / 1.2));
    }
    draw();
  }
});

canvas.addEventListener('mouseup', () => {
  dragging = false;
  resizing = false;
  resizeHandle = null;
});

canvas.addEventListener('mouseleave', () => {
  dragging = false;
  resizing = false;
  resizeHandle = null;
});

// double click edit text
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);
  const obj = hitTest(x, y);
  if (obj && obj.type === 'text') {
    const newText = prompt('Edit text', obj.text);
    if (newText === null) return;
    obj.text = newText;
    // remeasure
    ctx.save();
    ctx.font = `${obj.size}px "${obj.font}", sans-serif`;
    const metrics = ctx.measureText(obj.text);
    ctx.restore();
    obj.width = Math.ceil(metrics.width) + 20;
    obj.height = Math.ceil(obj.size * 1.2 * Math.max(1, obj.text.split('\n').length));
    draw();
  }
});

// Layer controls
bringFrontBtn.addEventListener('click', () => {
  if (selected) {
    const idx = objects.indexOf(selected);
    if (idx >= 0) objects.splice(idx, 1), objects.push(selected);
    draw();
  }
});
sendBackBtn.addEventListener('click', () => {
  if (selected) {
    const idx = objects.indexOf(selected);
    if (idx >= 0) objects.splice(idx, 1), objects.unshift(selected);
    draw();
  }
});
deleteBtn.addEventListener('click', () => {
  if (selected) {
    const idx = objects.indexOf(selected);
    if (idx >= 0) objects.splice(idx, 1);
    selected = null;
    draw();
  }
});

// Download and clear
downloadBtn.addEventListener('click', () => {
  // temporarily deselect for clean export
  const prevSel = selected;
  selected = null;
  draw();
  const data = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = data;
  a.download = 'thumbnail.png';
  a.click();
  selected = prevSel;
  draw();
});

clearBtn.addEventListener('click', () => {
  objects = [];
  selected = null;
  draw();
});

// Keyboard shortcuts (basic)
// Delete to remove selected
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && selected) {
    const index = objects.indexOf(selected);
    if (index >= 0) objects.splice(index, 1);
    selected = null;
    draw();
  }
});

// Ctrl+A select all (toggle)
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (selectionMode) {
      // if already in selection mode, select all objects
      selectObjectMulti(null, false);
      for (const obj of objects) {
        selectObjectMulti(obj, true);
      }
    } else {
      // toggle selection mode on
      selectionMode = true;
      selectionBtn.style.background = '#eef6ff';
      canvas.style.cursor = 'crosshair';
    }
    draw();
  }
});

// Shift+click to add/remove from selection
canvas.addEventListener('click', (e) => {
  if (selectionMode) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const obj = hitTest(x, y);
    if (e.shiftKey) {
      // shift click to toggle selection of individual objects
      selectObjectMulti(obj, true);
    } else {
      // regular click to select single object
      selectObjectMulti(obj, false);
    }
    draw();
  }
});

// Marquee selection (click+drag)
canvas.addEventListener('mousedown', (e) => {
  if (selectionMode) {
    const rect = canvas.getBoundingClientRect();
    selectStartX = Math.round(e.clientX - rect.left);
    selectStartY = Math.round(e.clientY - rect.top);
    isSelecting = true;
    // clear previous selection if not holding Shift
    if (!e.shiftKey) clearSelection();
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (isSelecting) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    selectionRect = {
      x: Math.min(selectStartX, x),
      y: Math.min(selectStartY, y),
      width: Math.abs(x - selectStartX),
      height: Math.abs(y - selectStartY)
    };
    draw();
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (isSelecting) {
    isSelecting = false;
    // select or deselect objects in marquee rect
    if (selectionRect) {
      const objs = getObjectsInRect(selectionRect);
      for (const obj of objs) {
        selectObjectMulti(obj, true);
      }
    }
    selectionRect = null;
    draw();
  }
});

// --- Debug info (FPS, etc.) ---
// simple FPS counter
let lastTick = performance.now();
let fps = 0;
function tick() {
  const now = performance.now();
  fps = Math.round(1000 / (now - lastTick));
  lastTick = now;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const infoPanel = document.createElement('div');
infoPanel.style.position = 'fixed';
infoPanel.style.bottom = '8px';
infoPanel.style.left = '50%';
infoPanel.style.transform = 'translateX(-50%)';
infoPanel.style.background = 'rgba(255,255,255,0.8)';
infoPanel.style.border = '1px solid #ddd';
infoPanel.style.padding = '8px 12px';
infoPanel.style.borderRadius = '8px';
infoPanel.style.fontSize = '14px';
infoPanel.style.color = '#333';
infoPanel.style.zIndex = '9999';
document.body.appendChild(infoPanel);

function updateInfo() {
  infoPanel.textContent = `FPS: ${fps} | Objects: ${objects.length} | Selected: ${selected ? 1 : 0} | Mode: ${selectionMode ? 'Select' : 'Edit'}`;
}
setInterval(updateInfo, 1000 / 2); // update info 2x per second

// --- Auto-save (basic) ---
// save to localStorage as JSON
function saveThumbnail() {
  const data = JSON.stringify({ backgroundColor, objects });
  localStorage.setItem('thumbnail-editor-data', data);
}

// load from localStorage
function loadThumbnail() {
  const data = localStorage.getItem('thumbnail-editor-data');
  if (data) {
    try {
      const json = JSON.parse(data);
      backgroundColor = json.backgroundColor;
      objects = json.objects;
      // convert object types back to original (image|text)
      for (const obj of objects) {
        if (obj.type === 'image' || obj.type === 'text') continue;
        obj.type = 'image'; // default to image if type is unknown
      }
      draw();
    } catch (e) {
      console.error('Failed to load thumbnail data:', e);
    }
  }
}

// auto-save on unload (simple)
window.addEventListener('beforeunload', () => {
  saveThumbnail();
});

// load existing data on page load
loadThumbnail();