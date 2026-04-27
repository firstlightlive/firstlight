// ═══════════════════════════════════════════
// FIRST LIGHT — RICH EDITOR (Notion-like)
// Uses Editor.js from CDN for block-based editing
// ═══════════════════════════════════════════

var FL_EDITORS = {}; // Store editor instances by ID

// ── CUSTOM INLINE TOOL: Text Color ──
var FL_TEXT_COLORS = [
  { name: 'Cyan', color: '#00E5FF' },
  { name: 'Gold', color: '#F5A623' },
  { name: 'Green', color: '#00E676' },
  { name: 'Red', color: '#FF5252' },
  { name: 'Purple', color: '#E040FB' },
  { name: 'Orange', color: '#FC4C02' },
  { name: 'Blue', color: '#70AEFF' },
  { name: 'White', color: '#FFFFFF' }
];

var ColorInlineTool = null;
function initColorTool() {
  if (ColorInlineTool) return;
  ColorInlineTool = function() {
    this.button = null;
    this._state = false;
    this.tag = 'SPAN';
    this.class = 'fl-text-color';
    this.colorPicker = null;
  };
  ColorInlineTool.prototype.render = function() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="18" r="1"/></svg>';
    this.button.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;position:relative';
    this.button.title = 'Text Color';
    return this.button;
  };
  ColorInlineTool.prototype.surround = function(range) {
    if (!range) return;
    var self = this;
    // Show color picker
    if (this.colorPicker) { this.colorPicker.remove(); this.colorPicker = null; return; }
    var picker = document.createElement('div');
    picker.style.cssText = 'position:absolute;top:100%;left:0;background:var(--bg2,#1a1d23);border:1px solid var(--surface-border);border-radius:8px;padding:8px;display:flex;gap:4px;flex-wrap:wrap;width:180px;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,0.4)';
    FL_TEXT_COLORS.forEach(function(c) {
      var btn = document.createElement('div');
      btn.style.cssText = 'width:28px;height:28px;border-radius:4px;background:' + c.color + ';cursor:pointer;border:1px solid rgba(255,255,255,0.1);transition:transform 0.15s';
      btn.title = c.name;
      btn.onmouseover = function() { this.style.transform = 'scale(1.15)'; };
      btn.onmouseout = function() { this.style.transform = ''; };
      btn.onclick = function(e) {
        e.stopPropagation();
        self.applyColor(c.color);
        picker.remove();
        self.colorPicker = null;
      };
      picker.appendChild(btn);
    });
    // Add "Remove color" option
    var removeBtn = document.createElement('div');
    removeBtn.style.cssText = 'width:28px;height:28px;border-radius:4px;background:transparent;cursor:pointer;border:1px dashed rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-dim)';
    removeBtn.title = 'Remove color';
    removeBtn.textContent = '✕';
    removeBtn.onclick = function(e) {
      e.stopPropagation();
      self.removeColor();
      picker.remove();
      self.colorPicker = null;
    };
    picker.appendChild(removeBtn);
    this.button.style.position = 'relative';
    this.button.appendChild(picker);
    this.colorPicker = picker;
    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function closePickerHandler(ev) {
        if (picker && !picker.contains(ev.target) && ev.target !== self.button) {
          picker.remove();
          self.colorPicker = null;
          document.removeEventListener('click', closePickerHandler);
        }
      });
    }, 100);
  };
  ColorInlineTool.prototype.applyColor = function(color) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var span = document.createElement('span');
    span.classList.add('fl-text-color');
    span.style.color = color;
    range.surroundContents(span);
    sel.removeAllRanges();
  };
  ColorInlineTool.prototype.removeColor = function() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var anchor = sel.anchorNode;
    var colorSpan = anchor.parentElement;
    if (colorSpan && colorSpan.classList.contains('fl-text-color')) {
      var parent = colorSpan.parentNode;
      while (colorSpan.firstChild) parent.insertBefore(colorSpan.firstChild, colorSpan);
      parent.removeChild(colorSpan);
    }
  };
  ColorInlineTool.prototype.checkState = function() { return false; };
  ColorInlineTool.isInline = true;
  ColorInlineTool.title = 'Color';
}

// Load Editor.js + plugins from CDN (once)
var _editorLoaded = false;
var _editorLoadCallbacks = [];

function loadEditorJS(callback) {
  if (_editorLoaded) { callback(); return; }
  _editorLoadCallbacks.push(callback);
  if (_editorLoadCallbacks.length > 1) return; // Already loading

  var scripts = [
    'https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.31.6/dist/editorjs.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.7/dist/header.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/list@1.9.0/dist/list.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/checklist@1.6.0/dist/checklist.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.2/dist/quote.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/delimiter@1.4.2/dist/delimiter.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/marker@1.4.0/dist/marker.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@editorjs/inline-code@1.5.1/dist/inline-code.umd.min.js'
  ];

  var loaded = 0;
  scripts.forEach(function(src) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function() {
      loaded++;
      if (loaded === scripts.length) {
        _editorLoaded = true;
        _editorLoadCallbacks.forEach(function(cb) { cb(); });
        _editorLoadCallbacks = [];
      }
    };
    s.onerror = function() {
      console.error('[Editor] Failed to load:', src);
      loaded++;
    };
    document.head.appendChild(s);
  });
}

// Inject Editor.js custom styles
(function() {
  if (document.getElementById('editorjs-custom-styles')) return;
  var style = document.createElement('style');
  style.id = 'editorjs-custom-styles';
  style.textContent =
    '.fl-editor { background: var(--bg3); border: 1px solid var(--surface-border); border-radius: 8px; padding: 12px 16px; min-height: 120px; transition: border-color 0.2s; }' +
    '.fl-editor:focus-within { border-color: var(--cyan); }' +
    '.fl-editor .codex-editor { font-family: var(--font-mono); font-size: 13px; color: var(--text); }' +
    '.fl-editor .codex-editor__redactor { padding-bottom: 60px !important; }' +
    '.fl-editor .ce-block__content { max-width: 100%; margin: 0; }' +
    '.fl-editor .ce-toolbar__content { max-width: 100%; margin: 0; }' +
    '.fl-editor .ce-toolbar__plus { color: var(--cyan); }' +
    '.fl-editor .ce-toolbar__settings-btn { color: var(--text-muted); }' +
    '.fl-editor .ce-block--selected .ce-block__content { background: rgba(0,212,255,0.06); }' +
    '.fl-editor .ce-paragraph { line-height: 1.7; }' +
    '.fl-editor h1, .fl-editor h2, .fl-editor h3 { color: var(--text); font-family: var(--font-mono); letter-spacing: 0.5px; }' +
    '.fl-editor h1 { font-size: 20px; }' +
    '.fl-editor h2 { font-size: 16px; color: var(--cyan); }' +
    '.fl-editor h3 { font-size: 14px; color: var(--gold); }' +
    '.fl-editor .cdx-checklist__item-checkbox { border-color: var(--cyan); }' +
    '.fl-editor .cdx-checklist__item--checked .cdx-checklist__item-checkbox { background: var(--green); border-color: var(--green); }' +
    '.fl-editor .cdx-quote { border-left: 3px solid var(--gold); padding-left: 12px; color: var(--text-muted); font-style: italic; }' +
    '.fl-editor .ce-delimiter::before { content: ""; display: block; height: 1px; background: rgba(0,212,255,0.1); margin: 16px 0; }' +
    '.fl-editor .cdx-marker { background: rgba(245,166,35,0.2); padding: 2px 0; }' +
    '.fl-editor .inline-code { background: rgba(0,212,255,0.08); color: var(--cyan); padding: 2px 6px; border-radius: 3px; font-size: 12px; }' +
    '.fl-editor .ce-popover { background: var(--bg2, #1a1d23); border: 1px solid var(--surface-border); }' +
    '.fl-editor .ce-popover-item { color: var(--text); }' +
    '.fl-editor .ce-popover-item:hover { background: rgba(0,212,255,0.06); }' +
    '.fl-editor .ce-popover-item__icon { color: var(--cyan); }' +
    '.fl-editor .ce-conversion-toolbar { background: var(--bg2, #1a1d23); border: 1px solid var(--surface-border); }' +
    '.fl-editor .ce-inline-toolbar { background: var(--bg2, #1a1d23); border: 1px solid var(--surface-border); }' +
    '.fl-editor .ce-inline-tool { color: var(--text); }' +
    '.fl-editor .ce-inline-tool:hover { background: rgba(0,212,255,0.1); }' +
    '.fl-editor-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 2px; color: var(--text-muted); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }' +
    '.fl-editor-label .fl-editor-hint { font-size: 8px; color: var(--text-dim); letter-spacing: 1px; }';
  document.head.appendChild(style);
})();

/**
 * Create a rich editor instance
 * @param {string} holderId — DOM element ID where editor mounts
 * @param {object} options — { placeholder, data, onChange, minHeight }
 * @returns {string} editorId for later reference
 */
function createRichEditor(holderId, options) {
  options = options || {};
  var holder = document.getElementById(holderId);
  if (!holder) return null;

  // Ensure holder has the styling class
  if (!holder.classList.contains('fl-editor')) holder.classList.add('fl-editor');
  if (options.minHeight) holder.style.minHeight = options.minHeight + 'px';

  loadEditorJS(function() {
    try {
      // Destroy existing editor if re-rendering
      if (FL_EDITORS[holderId]) {
        try { FL_EDITORS[holderId].destroy(); } catch(e) {}
      }

      var editorData = options.data || { blocks: [] };
      // Handle string data (legacy — convert plain text to paragraph blocks)
      if (typeof editorData === 'string') {
        if (editorData.trim()) {
          editorData = {
            blocks: editorData.split('\n').filter(function(l) { return l.trim(); }).map(function(line) {
              return { type: 'paragraph', data: { text: line } };
            })
          };
        } else {
          editorData = { blocks: [] };
        }
      }

      // Init color tool
      initColorTool();

      var editor = new EditorJS({
        holder: holderId,
        placeholder: options.placeholder || 'Start writing... Use / for blocks',
        data: editorData,
        minHeight: 0,
        tools: {
          header: {
            class: Header,
            config: { placeholder: 'Heading', levels: [1, 2, 3], defaultLevel: 2 }
          },
          list: {
            class: List,
            inlineToolbar: true,
            config: { defaultStyle: 'unordered' }
          },
          checklist: {
            class: Checklist,
            inlineToolbar: true
          },
          quote: {
            class: Quote,
            inlineToolbar: true,
            config: { quotePlaceholder: 'Enter a quote', captionPlaceholder: 'Quote author' }
          },
          delimiter: Delimiter,
          marker: {
            class: Marker
          },
          inlineCode: {
            class: InlineCode
          },
          color: {
            class: ColorInlineTool
          }
        },
        onChange: function(api) {
          if (options.onChange) {
            api.saver.save().then(function(data) {
              options.onChange(data);
            });
          }
        }
      });

      FL_EDITORS[holderId] = editor;
    } catch(e) {
      console.error('[Editor] Init failed for', holderId, e);
      // Fallback: show plain textarea
      holder.innerHTML = '<textarea class="form-input" rows="6" style="width:100%;min-height:120px" placeholder="' + (options.placeholder || '') + '">' + (typeof options.data === 'string' ? options.data : '') + '</textarea>';
    }
  });

  return holderId;
}

/**
 * Get editor data as JSON
 */
async function getEditorData(holderId) {
  if (FL_EDITORS[holderId]) {
    try {
      return await FL_EDITORS[holderId].save();
    } catch(e) {
      return { blocks: [] };
    }
  }
  return { blocks: [] };
}

/**
 * Convert Editor.js JSON to plain text (for backward compatibility)
 */
function editorDataToText(data) {
  if (!data || !data.blocks) return '';
  return data.blocks.map(function(b) {
    if (b.type === 'paragraph') return b.data.text || '';
    if (b.type === 'header') return b.data.text || '';
    if (b.type === 'list') return (b.data.items || []).join('\n');
    if (b.type === 'checklist') return (b.data.items || []).map(function(i) { return (i.checked ? '✓ ' : '○ ') + i.text; }).join('\n');
    if (b.type === 'quote') return '"' + (b.data.text || '') + '" — ' + (b.data.caption || '');
    if (b.type === 'delimiter') return '---';
    return b.data.text || '';
  }).join('\n');
}

/**
 * Convert plain text to Editor.js data format
 */
function textToEditorData(text) {
  if (!text) return { blocks: [] };
  return {
    blocks: text.split('\n').filter(function(l) { return l.trim(); }).map(function(line) {
      return { type: 'paragraph', data: { text: line } };
    })
  };
}

/**
 * Auto-upgrade all textareas with class "rich-editor" in a container
 * Call this after dynamic HTML is rendered
 */
function upgradeRichEditorsIn(containerId) {
  setTimeout(function() {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('textarea.rich-editor').forEach(function(ta) {
      if (ta.dataset.upgraded) return;
      ta.dataset.upgraded = 'true';
      var placeholder = ta.placeholder || 'Start writing... Use / for blocks';
      var minHeight = parseInt(ta.rows || 4) * 28;
      upgradeToRichEditor(ta.id, {
        placeholder: placeholder,
        minHeight: minHeight,
        onChange: function(data) {
          // Fire oninput on original textarea for existing save handlers
          ta.value = JSON.stringify(data);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  }, 300); // Small delay to let DOM settle
}

/**
 * Replace a textarea with a rich editor
 * @param {string} textareaId — ID of the textarea to replace
 * @param {object} options — { onChange, placeholder, minHeight }
 */
function upgradeToRichEditor(textareaId, options) {
  options = options || {};
  var textarea = document.getElementById(textareaId);
  if (!textarea) return;

  // Get existing value
  var existingValue = textarea.value || '';

  // Create editor holder
  var holderId = textareaId + '-editor';
  var editorDiv = document.createElement('div');
  editorDiv.id = holderId;
  editorDiv.className = 'fl-editor';
  if (options.minHeight) editorDiv.style.minHeight = options.minHeight + 'px';

  // Replace textarea with editor div
  textarea.style.display = 'none';
  textarea.parentNode.insertBefore(editorDiv, textarea.nextSibling);

  // Convert existing text to editor data
  var data;
  try {
    data = JSON.parse(existingValue);
    if (!data.blocks) throw 'not editor data';
  } catch(e) {
    data = textToEditorData(existingValue);
  }

  createRichEditor(holderId, {
    data: data,
    placeholder: options.placeholder || textarea.placeholder || 'Start writing...',
    minHeight: options.minHeight,
    onChange: function(editorData) {
      // Keep textarea synced for form submission / save functions
      textarea.value = JSON.stringify(editorData);
      if (options.onChange) options.onChange(editorData);
    }
  });
}
 
