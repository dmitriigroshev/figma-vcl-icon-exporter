const UI_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--figma-color-bg);
    color: var(--figma-color-text);
  }
  h1 {
    font-size: 16px;
    margin: 0 0 8px;
  }
  p {
    margin: 0 0 12px;
    font-size: 12px;
    line-height: 16px;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: var(--figma-color-bg-brand);
    color: var(--figma-color-text-onbrand);
    font-size: 12px;
    cursor: pointer;
  }
  button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
  .secondary {
    background: transparent;
    color: var(--figma-color-text);
    border: 1px solid var(--figma-color-border-strong);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin: 0 0 12px;
    user-select: none;
  }
  .option input {
    margin: 0;
  }
</style>
</head>
<body>
  <h1>Export Variants</h1>
  <p id="status">Preparing export…</p>
  <label class="option">
    <span>Format:</span>
    <select id="formatSelect">
      <option value="PNG" selected>PNG</option>
      <option value="SVG">SVG</option>
    </select>
  </label>
  <label class="option">
    <input type="checkbox" id="includeSize24" />
    <span>Include size 24 in file name</span>
  </label>
  <label class="option" id="upscale128Option">
    <input type="checkbox" id="upscale128" checked />
    <span>Create additional size 128 from size 32</span>
  </label>
  <div class="actions">
    <button id="save" disabled>Save ZIP</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>
<script>
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const includeSize24Checkbox = document.getElementById('includeSize24');
const upscale128Checkbox = document.getElementById('upscale128');
const upscale128Option = document.getElementById('upscale128Option');
const formatSelect = document.getElementById('formatSelect');
let filesQueue = [];
let archiveName = 'EXPORT.zip';
let includeSize24 = false;
let upscale128 = true;
let exportFormat = 'PNG';

window.onmessage = (event) => {
  const message = event.data.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === 'PREPARED_BATCH') {
    const payload = message.payload || {};
    filesQueue = Array.isArray(payload.files) ? payload.files : [];
    archiveName = payload.archiveName || 'EXPORT.zip';
    includeSize24 = Boolean(payload.includeSize24);
    if (includeSize24Checkbox.checked !== includeSize24) {
      includeSize24Checkbox.checked = includeSize24;
    }
    upscale128 = Boolean(payload.upscale128 ?? true);
    if (upscale128Checkbox.checked !== upscale128) {
      upscale128Checkbox.checked = upscale128;
    }
    exportFormat = payload.exportFormat || 'PNG';
    if (formatSelect.value !== exportFormat) {
      formatSelect.value = exportFormat;
    }
    updateUpscale128Visibility();
    const count = filesQueue.length;
    statusEl.textContent = count
      ? 'Ready to export ' + count + ' files. Click "Save ZIP".'
      : 'No data to export.';
    saveBtn.disabled = count === 0;
    cancelBtn.disabled = count === 0;
  } else if (message.type === 'EXPORT_FAILED') {
    statusEl.textContent = 'Export error. Check console.';
    saveBtn.disabled = true;
    cancelBtn.disabled = false;
  }
};

includeSize24Checkbox.addEventListener('change', () => {
  const value = includeSize24Checkbox.checked;
  statusEl.textContent = 'Updating file list…';
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  includeSize24 = value;
  parent.postMessage({ pluginMessage: { type: 'TOGGLE_INCLUDE_24', value } }, '*');
});

upscale128Checkbox.addEventListener('change', () => {
  const value = upscale128Checkbox.checked;
  statusEl.textContent = 'Updating file list…';
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  upscale128 = value;
  parent.postMessage({ pluginMessage: { type: 'TOGGLE_UPSCALE_128', value } }, '*');
});

formatSelect.addEventListener('change', () => {
  const value = formatSelect.value;
  statusEl.textContent = 'Updating file list…';
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  exportFormat = value;
  updateUpscale128Visibility();
  parent.postMessage({ pluginMessage: { type: 'CHANGE_FORMAT', value } }, '*');
});

function updateUpscale128Visibility() {
  if (exportFormat === 'SVG') {
    upscale128Option.style.display = 'none';
  } else {
    upscale128Option.style.display = 'flex';
  }
}

saveBtn.addEventListener('click', () => {
  if (!filesQueue.length) {
    return;
  }

  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  statusEl.textContent = 'Creating ZIP archive…';

  try {
    const archive = createZipArchive(filesQueue);
    statusEl.textContent = 'Preparing download…';

    const blob = new Blob([archive], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = archiveName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = 'Archive saved.';
    parent.postMessage({ pluginMessage: { type: 'BATCH_EXPORTED' } }, '*');
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Failed to create archive.';
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    parent.postMessage(
      { pluginMessage: { type: 'DOWNLOAD_FAILED', message: String(error) } },
      '*'
    );
  }
});

cancelBtn.addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'CANCEL' } }, '*');
});

function createZipArchive(items) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const time = getDosTime(now);
  const date = getDosDate(now);

  for (const item of items) {
    const fileName = String(item.fileName || 'FILE');
    const nameBytes = encoder.encode(fileName);
    const data = normalizeBytes(item.bytes);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    let pointer = 0;
    localView.setUint32(pointer, 0x04034b50, true); pointer += 4;
    localView.setUint16(pointer, 20, true); pointer += 2;
    localView.setUint16(pointer, 0, true); pointer += 2;
    localView.setUint16(pointer, 0, true); pointer += 2;
    localView.setUint16(pointer, time, true); pointer += 2;
    localView.setUint16(pointer, date, true); pointer += 2;
    localView.setUint32(pointer, crc >>> 0, true); pointer += 4;
    localView.setUint32(pointer, size, true); pointer += 4;
    localView.setUint32(pointer, size, true); pointer += 4;
    localView.setUint16(pointer, nameBytes.length, true); pointer += 2;
    localView.setUint16(pointer, 0, true); pointer += 2;

    localParts.push(new Uint8Array(localHeader));
    localParts.push(nameBytes);
    localParts.push(data);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    pointer = 0;
    centralView.setUint32(pointer, 0x02014b50, true); pointer += 4;
    centralView.setUint16(pointer, 20, true); pointer += 2;
    centralView.setUint16(pointer, 20, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint16(pointer, time, true); pointer += 2;
    centralView.setUint16(pointer, date, true); pointer += 2;
    centralView.setUint32(pointer, crc >>> 0, true); pointer += 4;
    centralView.setUint32(pointer, size, true); pointer += 4;
    centralView.setUint32(pointer, size, true); pointer += 4;
    centralView.setUint16(pointer, nameBytes.length, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint16(pointer, 0, true); pointer += 2;
    centralView.setUint32(pointer, 0, true); pointer += 4;
    centralView.setUint32(pointer, offset, true); pointer += 4;

    centralParts.push(new Uint8Array(centralHeader));
    centralParts.push(nameBytes);

    offset += localHeader.byteLength + nameBytes.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const endHeader = new ArrayBuffer(22);
  const endView = new DataView(endHeader);
  let pointer = 0;
  const count = items.length;
  endView.setUint32(pointer, 0x06054b50, true); pointer += 4;
  endView.setUint16(pointer, 0, true); pointer += 2;
  endView.setUint16(pointer, 0, true); pointer += 2;
  endView.setUint16(pointer, count, true); pointer += 2;
  endView.setUint16(pointer, count, true); pointer += 2;
  endView.setUint32(pointer, centralSize, true); pointer += 4;
  endView.setUint32(pointer, centralOffset, true); pointer += 4;
  endView.setUint16(pointer, 0, true); pointer += 2;

  const totalSize = offset + centralSize + endHeader.byteLength;
  const output = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }

  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }

  output.set(new Uint8Array(endHeader), cursor);
  return output;
}

function ensureExtension(name, ext) {
  const lowerExt = '.' + ext.toLowerCase();
  return name.toLowerCase().endsWith(lowerExt) ? name : name + '.' + ext.toLowerCase();
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (Array.isArray(bytes)) {
    return new Uint8Array(bytes);
  }
  return new Uint8Array();
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosTime(date) {
  const seconds = Math.floor(date.getSeconds() / 2);
  const minutes = date.getMinutes();
  const hours = date.getHours();
  return (hours << 11) | (minutes << 5) | seconds;
}

function getDosDate(date) {
  const year = Math.max(date.getFullYear(), 1980) - 1980;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (year << 9) | (month << 5) | day;
}
</script>

</body>
</html>
`;

figma.showUI(UI_HTML, { width: 320, height: 150 });

const pluginState = {
  includeSize24: false,
  upscale128: true,
  exportFormat: 'PNG',
  targets: [],
  isPreparing: false,
  pendingRefresh: false,
};

figma.ui.onmessage = (msg) => {
  if (msg.type === 'BATCH_EXPORTED') {
    figma.closePlugin('Archive saved.');
  } else if (msg.type === 'DOWNLOAD_FAILED') {
    console.error(msg.message);
    figma.notify('Failed to save archive.');
  } else if (msg.type === 'CANCEL') {
    figma.closePlugin('Export cancelled.');
  } else if (msg.type === 'TOGGLE_INCLUDE_24') {
    pluginState.includeSize24 = Boolean(msg.value);
    if (!pluginState.targets.length) {
      return;
    }
    if (pluginState.isPreparing) {
      pluginState.pendingRefresh = true;
    } else {
      prepareAndSendExports({ notifyUser: false });
    }
  } else if (msg.type === 'TOGGLE_UPSCALE_128') {
    pluginState.upscale128 = Boolean(msg.value);
    if (!pluginState.targets.length) {
      return;
    }
    if (pluginState.isPreparing) {
      pluginState.pendingRefresh = true;
    } else {
      prepareAndSendExports({ notifyUser: false });
    }
  } else if (msg.type === 'CHANGE_FORMAT') {
    pluginState.exportFormat = msg.value === 'SVG' ? 'SVG' : 'PNG';
    // Clear cached exports when format changes
    for (const target of pluginState.targets) {
      target.bytes = null;
      target.byteArray = null;
      target.bytes128 = null;
      target.byteArray128 = null;
    }
    if (!pluginState.targets.length) {
      return;
    }
    if (pluginState.isPreparing) {
      pluginState.pendingRefresh = true;
    } else {
      prepareAndSendExports({ notifyUser: false });
    }
  }
};

run().catch((error) => {
  console.error(error);
  figma.notify('Failed to export variants.');
  figma.closePlugin();
});

async function run() {
  const targets = collectVariantTargets(figma.currentPage.selection);

  if (!targets.length) {
    figma.notify('Select a component or component set with variants.');
    figma.closePlugin();
    return;
  }

  pluginState.targets = targets;
  pluginState.pendingRefresh = false;

  await prepareAndSendExports({ notifyUser: true });
}

async function prepareAndSendExports({ notifyUser = false } = {}) {
  if (!pluginState.targets.length) {
    figma.ui.postMessage({
      type: 'PREPARED_BATCH',
      payload: {
        files: [],
        archiveName: 'EXPORT.zip',
        includeSize24: pluginState.includeSize24,
        upscale128: pluginState.upscale128,
        exportFormat: pluginState.exportFormat,
      },
    });
    return;
  }

  if (pluginState.isPreparing) {
    pluginState.pendingRefresh = true;
    return;
  }

  pluginState.isPreparing = true;

  try {
    if (notifyUser) {
      figma.notify('Preparing ' + String(pluginState.targets.length) + ' files for export…');
    }

    const prepared = [];
    const isSvg = pluginState.exportFormat === 'SVG';
    const format = isSvg ? 'SVG' : 'PNG';

    for (const target of pluginState.targets) {
      if (!target.bytes) {
        target.bytes = await target.node.exportAsync({ format });
        target.byteArray = null;
      }
      if (!target.byteArray) {
        target.byteArray = Array.from(target.bytes);
      }

      const filePath = buildFilePath(target, pluginState.includeSize24, { format });
      prepared.push({
        fileName: filePath,
        bytes: target.byteArray,
      });

      // Upscale128 only applies to PNG format
      const numericSize = Number(target.size);
      if (!isSvg && pluginState.upscale128 && Number.isFinite(numericSize) && numericSize === 32) {
        if (!target.bytes128) {
          target.bytes128 = await target.node.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 4 },
          });
          target.byteArray128 = null;
        }
        if (!target.byteArray128) {
          target.byteArray128 = Array.from(target.bytes128);
        }
        prepared.push({
          fileName: buildFilePath(target, pluginState.includeSize24, {
            sizeOverride: '128',
            format: 'PNG',
          }),
          bytes: target.byteArray128,
        });
      }
    }

    const archiveName = determineArchiveName(pluginState.targets, pluginState.exportFormat);

    figma.ui.postMessage({
      type: 'PREPARED_BATCH',
      payload: {
        files: prepared,
        archiveName,
        includeSize24: pluginState.includeSize24,
        upscale128: pluginState.upscale128,
        exportFormat: pluginState.exportFormat,
      },
    });

    if (notifyUser) {
      figma.notify('Files ready. Click "Save ZIP" in the plugin window.');
    }
  } catch (error) {
    console.error(error);
    figma.notify('Failed to prepare export.');
    figma.ui.postMessage({
      type: 'EXPORT_FAILED',
      message: String(error),
    });
    figma.closePlugin();
  } finally {
    pluginState.isPreparing = false;
    if (pluginState.pendingRefresh) {
      pluginState.pendingRefresh = false;
      await prepareAndSendExports({ notifyUser: false });
    }
  }
}

function collectVariantTargets(selection) {
  const results = [];
  const processed = new Set();

  for (const node of selection) {
    if (node.type === 'COMPONENT_SET') {
      for (const child of node.children) {
        if (child.type === 'COMPONENT') {
          addComponent(child, child);
        }
      }
      continue;
    }

    if (node.type === 'COMPONENT') {
      addComponent(node, node);
      continue;
    }

    if (node.type === 'INSTANCE') {
      const mainComponent = node.mainComponent;
      addComponent(node, mainComponent || node);
      continue;
    }
  }

  function addComponent(exportNode, variantSource) {
    if (!exportNode || processed.has(exportNode.id)) {
      return;
    }
    processed.add(exportNode.id);

    const baseName = determineBaseName(variantSource);
    const target = createVariantTarget(exportNode, baseName, variantSource);
    if (target) {
      results.push(target);
    }
  }

  return results.filter(Boolean);
}

function buildFilePath(target, includeSize24Flag, options = {}) {
  const size = options.sizeOverride || target.size || '';
  const shouldIncludeSize = size && (size !== '24' || includeSize24Flag);
  const namePart = shouldIncludeSize ? target.baseName + size : target.baseName;
  const format = options.format || 'PNG';
  const fileName = namePart + '_' + format + '.' + format.toLowerCase();
  const segments = target.pathSegments && target.pathSegments.length
    ? target.pathSegments.map(sanitizeFolderName)
    : [];
  if (segments.length) {
    return segments.join('/') + '/' + fileName;
  }
  return fileName;
}

function determineArchiveName(targets, format) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '_' + month + '_' + day + '_VCL_EXPORT_' + format + '.zip';
}

function determineBaseName(node) {
  if (!node) {
    return 'COMPONENT';
  }

  if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
    return sanitizeName(node.parent.name);
  }

  if (node.type === 'COMPONENT_SET') {
    return sanitizeName(node.name);
  }

  return sanitizeName(stripVariantSuffix(node.name));
}

function createVariantTarget(node, baseName, variantSource) {
  if (!node) {
    return null;
  }

  const cleanBaseName = baseName || 'COMPONENT';
  const size = extractSize(variantSource, node);
  const pathSegments = resolvePathSegments(node);
  return {
    node,
    baseName: cleanBaseName,
    size,
    pathSegments,
    bytes: null,
    byteArray: null,
    bytes128: null,
    byteArray128: null,
  };
}

function sanitizeName(name) {
  return (name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function sanitizeFolderName(name) {
  return (name || '')
    .trim()
    .replace(/^\/*/, '')
    .replace(/\/*$/, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_');
}

function stripVariantSuffix(name) {
  return (name || '').split('/')[0];
}

function extractSize(primaryNode, fallbackNode) {
  const sources = [];

  if (primaryNode) {
    sources.push(primaryNode);
    if (primaryNode.mainComponent) {
      sources.push(primaryNode.mainComponent);
    }
  }

  if (fallbackNode && fallbackNode !== primaryNode) {
    sources.push(fallbackNode);
    if (fallbackNode.mainComponent) {
      sources.push(fallbackNode.mainComponent);
    }
  }

  for (const source of sources) {
    const variantProps = source.variantProperties;
    if (!variantProps) {
      continue;
    }

    for (const [propName, value] of Object.entries(variantProps)) {
      if (propName && /size/i.test(propName)) {
        const matched = String(value).match(/\d+/);
        if (matched) {
          return matched[0];
        }
      }
    }

    for (const value of Object.values(variantProps)) {
      const numeric = String(value).match(/^\d+$/);
      if (numeric) {
        return numeric[0];
      }
    }
  }

  const widthSource = fallbackNode || primaryNode;
  return String(Math.round(widthSource ? widthSource.width : 0));
}

function resolvePathSegments(node) {
  let current = node;

  while (current && current.type !== 'PAGE') {
    if (current.type === 'SECTION') {
      const raw = current.name || '';
      return raw
        .split('/')
        .map((part) => part.trim())
        .filter((part) => part.length);
    }
    current = current.parent;
  }

  return [];
}
