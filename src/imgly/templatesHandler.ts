/**
 * In-Editor Templates Handler for Wargative Editor
 *
 * Implements safe, page-level template application:
 * - Intercepts template asset application via cesdk.engine.asset.registerApplyMiddleware
 * - If target page is empty: applies directly to target page without modal
 * - If target page has content: prompts user with Canva-style modal (Replace / Add as new / Cancel)
 * - Restricts template application to exactly one target page (primary page of template)
 * - Preserves existing scene, other pages, and project ID intact
 * - Performs uniform scaling to fit target page dimensions without breaking groups/hierarchy
 * - Provides full atomic snapshot rollback in case of failure
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export interface TemplateHandlerCallbacks {
  onBeforeTemplateApply?: () => void;
  onAfterTemplateApply?: () => Promise<void>;
  onTemplateApplied?: (templateUri: string) => Promise<void> | void;
}

export type TemplateApplyMode = 'replace' | 'add_new';

/**
 * Checks whether a page is visually empty (no shapes, images, graphics, or non-empty text blocks).
 */
export function isPageEmpty(cesdk: CreativeEditorSDK, pageId: number): boolean {
  try {
    const children = cesdk.engine.block.getChildren(pageId);
    if (!children || children.length === 0) return true;

    for (const child of children) {
      const type = cesdk.engine.block.getType(child);
      if (type === '//ly.img.ubq/text') {
        const runs = cesdk.engine.block.getTextRuns(child);
        const text = Array.isArray(runs) ? runs.map((r: any) => r.text || '').join('').trim() : '';
        if (text.length > 0) return false;
      } else {
        // Any graphic, image, shape, sticker, or group constitutes design content
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Displays a lightweight toast notification in the editor.
 */
function showToast(message: string, durationMs = 3500) {
  let toastContainer = document.getElementById('wargative-template-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'wargative-template-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(10px);
    color: #ffffff;
    padding: 10px 20px;
    border-radius: 9999px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  toast.innerHTML = `<span>✨</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, durationMs);
}

/**
 * Resolves template URI with support for {{base_url}} placeholders.
 */
function resolveTemplateUri(cesdk: CreativeEditorSDK, rawUri: string): string {
  if (!rawUri.includes('{{base_url}}')) {
    return rawUri;
  }
  const base =
    (typeof (cesdk as any).getBaseURL === 'function' ? (cesdk as any).getBaseURL() : null) ||
    cesdk.engine.editor.getSetting('basePath') ||
    'https://cdn.img.ly/packages/imgly/cesdk-js/1.83.0/assets/';
  const cleanBase = base.replace(/\/+$/, '');
  return rawUri.replace('{{base_url}}', cleanBase);
}

/**
 * Converts a Uint8Array to a Base64 string in chunks to prevent call stack overflow.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Scans the primary template page and its entire subtree (children, fills, shapes, effects)
 * for transient buffer:// resources and converts them to persistent data: URIs via relocateResource.
 * Strictly targets only resources referenced by the template page being imported.
 */
async function persistTemplatePageBufferResources(
  cesdk: CreativeEditorSDK,
  primaryTplPage: number
): Promise<void> {
  const blocks: number[] = [primaryTplPage];
  const queue: number[] = [primaryTplPage];

  while (queue.length > 0) {
    const b = queue.shift()!;
    // Inspect fill
    try {
      if (cesdk.engine.block.supportsFill(b) && cesdk.engine.block.hasFill(b)) {
        const fill = cesdk.engine.block.getFill(b);
        if (fill && cesdk.engine.block.isValid(fill) && !blocks.includes(fill)) {
          blocks.push(fill);
        }
      }
    } catch (e) {}

    // Inspect shape
    try {
      const shape = cesdk.engine.block.getShape(b);
      if (shape && cesdk.engine.block.isValid(shape) && !blocks.includes(shape)) {
        blocks.push(shape);
      }
    } catch (e) {}

    // Inspect effects
    try {
      const effects = cesdk.engine.block.getEffects(b);
      if (Array.isArray(effects)) {
        for (const eff of effects) {
          if (eff && cesdk.engine.block.isValid(eff) && !blocks.includes(eff)) {
            blocks.push(eff);
          }
        }
      }
    } catch (e) {}

    // Inspect children
    try {
      const children = cesdk.engine.block.getChildren(b);
      if (Array.isArray(children)) {
        for (const child of children) {
          if (!blocks.includes(child)) {
            blocks.push(child);
            queue.push(child);
          }
        }
      }
    } catch (e) {}
  }

  // Find all buffer:// URIs referenced strictly by these template blocks
  const referencedBufferUris = new Set<string>();
  for (const b of blocks) {
    try {
      const props = cesdk.engine.block.findAllProperties(b);
      for (const prop of props) {
        if (cesdk.engine.block.isPropertyReadable(prop)) {
          const propType = cesdk.engine.block.getPropertyType(prop);
          if (propType === 'String') {
            const val = cesdk.engine.block.getString(b, prop as any);
            if (val && typeof val === 'string' && val.startsWith('buffer://')) {
              referencedBufferUris.add(val);
            }
          }
        }
      }
    } catch (e) {}
  }

  if (referencedBufferUris.size === 0) {
    return;
  }

  console.log(
    `[Wargative Templates] Found ${referencedBufferUris.size} template buffer resource(s) to persist:`,
    Array.from(referencedBufferUris)
  );

  // Convert and relocate each template-referenced buffer URI to a persistent data: URI
  for (const bufferUri of referencedBufferUris) {
    const length = cesdk.engine.editor.getBufferLength(bufferUri);
    if (length <= 0) {
      throw new Error(`Invalid buffer length (${length}) for template resource: ${bufferUri}`);
    }
    const data = cesdk.engine.editor.getBufferData(bufferUri, 0, length);
    if (!data || data.byteLength === 0) {
      throw new Error(`Failed to read buffer data for template resource: ${bufferUri}`);
    }
    const mime = (await cesdk.engine.editor.getMimeType(bufferUri)) || 'image/png';
    const base64 = uint8ArrayToBase64(data);
    const persistentUrl = `data:${mime};base64,${base64}`;

    cesdk.engine.editor.relocateResource(bufferUri, persistentUrl);
    console.log(
      `[Wargative Templates] Relocated ${bufferUri} (${length} bytes, ${mime}) -> persistent data URI`
    );
  }
}

/**
 * Renders a Canva-style confirmation modal for applying templates to pages with existing design.
 */
function showTemplateApplyModal(templateTitle: string): Promise<TemplateApplyMode | null> {
  return new Promise((resolve) => {
    const existingModal = document.getElementById('wargative-template-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wargative-template-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: wargativeModalFadeIn 0.2s ease-out;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: #ffffff;
      width: 100%;
      max-width: 440px;
      margin: 16px;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 18px;
    `;

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: #ede9fe; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 18px;">
            📄
          </div>
          <div>
            <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; line-height: 1.3;">Terapkan Template</h3>
            <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">${templateTitle || 'Template Terpilih'}</p>
          </div>
        </div>
        <button id="btnTplModalClose" type="button" style="background: none; border: none; font-size: 22px; color: #94a3b8; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
      </div>

      <p style="margin: 0; font-size: 13.5px; color: #334155; line-height: 1.5;">
        Halaman saat ini sudah memiliki konten desain. Bagaimana Anda ingin menerapkan template ini?
      </p>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btnTplReplace" type="button" style="
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          background: #ffffff;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        ">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">
            🔄
          </div>
          <div style="flex: 1;">
            <div style="font-size: 13.5px; font-weight: 600; color: #0f172a;">Ganti halaman saat ini</div>
            <div style="font-size: 11.5px; color: #64748b;">Halaman ini digantikan, halaman lain tetap utuh</div>
          </div>
        </button>

        <button id="btnTplAddNew" type="button" style="
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1.5px solid #7c3aed;
          background: #f5f3ff;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        ">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #7c3aed; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">
            ➕
          </div>
          <div style="flex: 1;">
            <div style="font-size: 13.5px; font-weight: 600; color: #5b21b6;">Tambahkan sebagai halaman baru</div>
            <div style="font-size: 11.5px; color: #6d28d9;">Buat halaman baru setelah ini, desain lama aman</div>
          </div>
        </button>
      </div>

      <div style="display: flex; justify-content: flex-end; padding-top: 4px;">
        <button id="btnTplCancel" type="button" style="
          background: none;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 18px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        ">
          Batal
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const cleanup = (choice: TemplateApplyMode | null) => {
      window.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    const btnClose = card.querySelector('#btnTplModalClose');
    if (btnClose) btnClose.addEventListener('click', () => cleanup(null));

    const btnCancel = card.querySelector('#btnTplCancel');
    if (btnCancel) btnCancel.addEventListener('click', () => cleanup(null));

    const btnReplace = card.querySelector('#btnTplReplace') as HTMLButtonElement | null;
    if (btnReplace) {
      btnReplace.addEventListener('click', () => cleanup('replace'));
      btnReplace.addEventListener('mouseenter', () => {
        btnReplace.style.borderColor = '#ef4444';
        btnReplace.style.background = '#fef2f2';
      });
      btnReplace.addEventListener('mouseleave', () => {
        btnReplace.style.borderColor = '#e2e8f0';
        btnReplace.style.background = '#ffffff';
      });
    }

    const btnAddNew = card.querySelector('#btnTplAddNew') as HTMLButtonElement | null;
    if (btnAddNew) {
      btnAddNew.addEventListener('click', () => cleanup('add_new'));
      btnAddNew.addEventListener('mouseenter', () => {
        btnAddNew.style.background = '#ede9fe';
      });
      btnAddNew.addEventListener('mouseleave', () => {
        btnAddNew.style.background = '#f5f3ff';
      });
    }
  });
}

/**
 * Core transactional template application:
 * 1. Snapshot active user scene
 * 2. Transiently load template scene
 * 3. Extract primary page blocks and dimensions (One Template = One Page)
 * 4. Restore user scene completely
 * 5. Attach blocks to target page (Replace or Add New)
 * 6. Uniformly scale blocks if dimensions differ
 * 7. Force load resources and trigger autosave
 */
export async function applyTemplateToTargetPage(
  cesdk: CreativeEditorSDK,
  templateAsset: any,
  mode: TemplateApplyMode,
  callbacks?: TemplateHandlerCallbacks
): Promise<boolean> {
  const uri = templateAsset.meta?.uri;
  if (!uri) {
    console.error('[Wargative Templates] Asset has no meta.uri');
    return false;
  }

  callbacks?.onBeforeTemplateApply?.();

  let userSceneSnapshot: string | null = null;
  try {
    // 1. Capture in-memory snapshot of active user scene (allowing buffer schemes if previous templates were applied)
    userSceneSnapshot = await cesdk.engine.scene.saveToString({
      allowedResourceSchemes: ['blob', 'bundle', 'file', 'http', 'https', 'opfs', 'buffer', 'data']
    });

    // 2. Identify current page context in user's scene
    const pages = cesdk.engine.scene.getPages();
    const currentPage = cesdk.engine.scene.getCurrentPage() ?? pages[0];
    const currentIndex = pages.indexOf(currentPage);
    const targetW = cesdk.engine.block.getWidth(currentPage);
    const targetH = cesdk.engine.block.getHeight(currentPage);

    // Deselect any selected blocks so UI inspector does not reference destroyed blocks
    try {
      const selected = cesdk.engine.block.findAllSelected();
      for (const b of selected) {
        cesdk.engine.block.setSelected(b, false);
      }
    } catch (e) {}

    // 3. Transiently load template scene to mount embedded fonts and images
    const resolvedUri = resolveTemplateUri(cesdk, uri);
    const isArchive = resolvedUri.endsWith('.zip') || templateAsset.meta?.mimeType === 'application/zip';

    if (isArchive) {
      await cesdk.engine.scene.loadFromArchiveURL(resolvedUri);
    } else {
      await cesdk.engine.scene.loadFromURL(resolvedUri);
    }

    // 4. Extract primary page blocks (ONE TEMPLATE = ONE TARGET PAGE)
    const tplPages = cesdk.engine.scene.getPages();
    if (!tplPages || tplPages.length === 0) {
      throw new Error('Template archive does not contain any pages');
    }
    const primaryTplPage = tplPages[0];
    const tplWidth = cesdk.engine.block.getWidth(primaryTplPage);
    const tplHeight = cesdk.engine.block.getHeight(primaryTplPage);
    const tplChildren = cesdk.engine.block.getChildren(primaryTplPage);

    if (!tplChildren || tplChildren.length === 0) {
      throw new Error('Template page has no elements');
    }

    // Persist all buffer:// resources strictly referenced by the template page before serialization
    await persistTemplatePageBufferResources(cesdk, primaryTplPage);

    // Generic Page Fill Extraction (supports solid color, complex fill block, and fill enable state)
    type TemplatePageFillData =
      | { type: 'solid'; rgba: [number, number, number, number]; enabled: boolean }
      | { type: 'block'; serialized: string; enabled: boolean }
      | { type: 'none' };

    let tplPageFillData: TemplatePageFillData = { type: 'none' };

    if (cesdk.engine.block.supportsFill(primaryTplPage) && cesdk.engine.block.hasFill(primaryTplPage)) {
      const isEnabled = cesdk.engine.block.isFillEnabled(primaryTplPage);
      const fillBlock = cesdk.engine.block.getFill(primaryTplPage);
      if (fillBlock && cesdk.engine.block.isValid(fillBlock)) {
        const fillType = cesdk.engine.block.getType(fillBlock);
        if (fillType === '//ly.img.ubq/fill/color' || fillType.endsWith('/color')) {
          const rgba = cesdk.engine.block.getFillSolidColor(primaryTplPage);
          if (Array.isArray(rgba) && rgba.length >= 4) {
            tplPageFillData = {
              type: 'solid',
              rgba: [rgba[0], rgba[1], rgba[2], rgba[3]],
              enabled: isEnabled
            };
          } else {
            throw new Error(`Invalid RGBA returned from getFillSolidColor for template page: ${JSON.stringify(rgba)}`);
          }
        } else {
          // Complex fill (gradient, image fill, etc.)
          const serializedFill = await cesdk.engine.block.saveToString([fillBlock], [
            'blob', 'bundle', 'file', 'http', 'https', 'opfs', 'buffer', 'data'
          ]);
          if (!serializedFill) {
            throw new Error(`Failed to serialize template page fill block ${fillBlock} (${fillType})`);
          }
          tplPageFillData = {
            type: 'block',
            serialized: serializedFill,
            enabled: isEnabled
          };
        }
      } else {
        tplPageFillData = { type: 'none' };
      }
    } else {
      tplPageFillData = { type: 'none' };
    }

    // Serialize children of primary page with explicit allowed resource schemes
    const serializedBlocks = await cesdk.engine.block.saveToString(tplChildren, [
      'blob', 'bundle', 'file', 'http', 'https', 'opfs', 'buffer', 'data'
    ]);

    // 5. Restore user's scene immediately
    await cesdk.engine.scene.loadFromString(userSceneSnapshot);

    // 6. Re-acquire context and prepare target page in restored user scene
    const restoredPages = cesdk.engine.scene.getPages();
    const scene = cesdk.engine.scene.get()!;
    let targetPage: number;

    if (mode === 'replace') {
      targetPage = cesdk.engine.scene.getCurrentPage() ?? restoredPages[Math.max(0, currentIndex)];
      // Destroy all existing children on targetPage
      const existingChildren = cesdk.engine.block.getChildren(targetPage);
      for (const child of existingChildren) {
        cesdk.engine.block.destroy(child);
      }
    } else {
      // Add as new page
      const currentActive = cesdk.engine.scene.getCurrentPage() ?? restoredPages[Math.max(0, currentIndex)];
      const activeIdx = restoredPages.indexOf(currentActive);
      const pageParent =
        cesdk.engine.block.getParent(currentActive) ||
        (restoredPages.length > 0 ? cesdk.engine.block.getParent(restoredPages[0]) : scene);

      const newPage = cesdk.engine.block.create('page');
      cesdk.engine.block.setWidth(newPage, targetW);
      cesdk.engine.block.setHeight(newPage, targetH);

      if (activeIdx >= 0 && activeIdx < restoredPages.length - 1) {
        cesdk.engine.block.insertChild(pageParent, newPage, activeIdx + 1);
      } else {
        cesdk.engine.block.appendChild(pageParent, newPage);
      }
      targetPage = newPage;
    }

    // Generic Page Fill Replication (Strict: errors bubble up to atomic rollback)
    if (tplPageFillData.type === 'solid') {
      if (!cesdk.engine.block.supportsFill(targetPage)) {
        throw new Error('Target page does not support fill for template solid background');
      }
      const [r, g, b, a] = tplPageFillData.rgba;
      cesdk.engine.block.setFillSolidColor(targetPage, r, g, b, a ?? 1.0);
      cesdk.engine.block.setFillEnabled(targetPage, tplPageFillData.enabled);
    } else if (tplPageFillData.type === 'block') {
      const importedFills = await cesdk.engine.block.loadFromString(tplPageFillData.serialized);
      if (!importedFills || importedFills.length === 0 || !cesdk.engine.block.isValid(importedFills[0])) {
        throw new Error('Failed to deserialize template page fill block on target page');
      }
      cesdk.engine.block.setFill(targetPage, importedFills[0]);
      cesdk.engine.block.setFillEnabled(targetPage, tplPageFillData.enabled);
    } else if (tplPageFillData.type === 'none') {
      // In replace mode, if template has no fill or fill is disabled, disable target page fill to avoid leaking previous background
      if (mode === 'replace' && cesdk.engine.block.supportsFill(targetPage)) {
        cesdk.engine.block.setFillEnabled(targetPage, false);
      }
    }

    // 7. Instantiate template blocks in user's scene
    const importedBlocks = await cesdk.engine.block.loadFromString(serializedBlocks);

    // 8. Uniform scaling and positioning without breaking internal hierarchy/groups
    const isSameDimensions = Math.abs(targetW - tplWidth) < 1 && Math.abs(targetH - tplHeight) < 1;
    const scaleFactor = isSameDimensions ? 1.0 : Math.min(targetW / tplWidth, targetH / tplHeight);
    const offsetX = isSameDimensions ? 0 : (targetW - tplWidth * scaleFactor) / 2;
    const offsetY = isSameDimensions ? 0 : (targetH - tplHeight * scaleFactor) / 2;

    for (const block of importedBlocks) {
      // First attach block to target page
      cesdk.engine.block.appendChild(targetPage, block);

      // Apply uniform scale and offset per top-level block if dimensions differ
      if (!isSameDimensions && Math.abs(scaleFactor - 1.0) > 0.001) {
        const origX = cesdk.engine.block.getPositionX(block);
        const origY = cesdk.engine.block.getPositionY(block);
        cesdk.engine.block.scale(block, scaleFactor, 0, 0);
        cesdk.engine.block.setPositionX(block, offsetX + origX * scaleFactor);
        cesdk.engine.block.setPositionY(block, offsetY + origY * scaleFactor);
      }
    }

    // 9. Force load resources for imported blocks
    await cesdk.engine.block.forceLoadResources(importedBlocks);

    // If archive template was applied, notify callback to record templateUri for re-hydration
    if (isArchive) {
      try {
        await callbacks?.onTemplateApplied?.(resolvedUri);
      } catch (cbErr) {
        console.warn('[Wargative Templates] onTemplateApplied callback warning:', cbErr);
      }
    }

    // 10. Navigate camera to target page if new page was added
    if (mode === 'add_new') {
      try {
        await cesdk.actions.run('zoom.toPage', { page: targetPage });
      } catch (e) {}
    }

    const labelVal = (templateAsset.label as any);
    const labelStr = typeof labelVal === 'string' ? labelVal : labelVal?.en || templateAsset.id || 'Template';
    showToast(
      mode === 'replace'
        ? `Template "${labelStr}" berhasil diterapkan!`
        : `Halaman baru dari template berhasil ditambahkan!`
    );

    return true;
  } catch (err: any) {
    console.error('[Wargative Templates] Error applying template: ' + (err?.message || err) + ' \nStack: ' + (err?.stack || 'no stack'));
    // Execute atomic rollback
    try {
      if (userSceneSnapshot) {
        await cesdk.engine.scene.loadFromString(userSceneSnapshot);
      }
    } catch (rollbackErr) {
      console.error('[Wargative Templates] Rollback error:', rollbackErr);
    }
    showToast('Gagal menerapkan template. Perubahan dikembalikan ke semula.');
    return false;
  } finally {
    if (callbacks?.onAfterTemplateApply) {
      await callbacks.onAfterTemplateApply();
    }
  }
}

/**
 * Initializes and registers the apply middleware for in-editor templates.
 */
export function setupTemplatesHandler(
  cesdk: CreativeEditorSDK,
  callbacks?: TemplateHandlerCallbacks
): () => void {
  // Expose programmatic apply method for testing and toolbar integration
  (cesdk as any).__wargativeApplyTemplate = (assetResult: any, mode: TemplateApplyMode = 'replace') => {
    return applyTemplateToTargetPage(cesdk, assetResult, mode, callbacks);
  };

  // Diagnostic Defensive Safety Net: Prevent CE.SDK UI inspector from crashing on invalid blocks during scene transitions
  try {
    if (!(cesdk.engine.block as any).__wargativeGetFillGuarded) {
      const originalGetFill = cesdk.engine.block.getFill.bind(cesdk.engine.block);
      cesdk.engine.block.getFill = (blockId: number) => {
        try {
          if (!cesdk.engine.block.isValid(blockId)) {
            console.warn('[Wargative Safety Net] Prevented getFill query on invalid/destroyed block ID:', blockId);
            return 0;
          }
          return originalGetFill(blockId);
        } catch (err) {
          console.warn('[Wargative Safety Net] Handled error in getFill for block ID:', blockId, err);
          return 0;
        }
      };
      (cesdk.engine.block as any).__wargativeGetFillGuarded = true;
    }
  } catch (e) {
    console.warn('[Wargative Templates] Failed to install getFill guard:', e);
  }

  // Ensure the default CE.SDK prompt dialog is disabled on templates dock entry
  try {
    cesdk.ui.updateAssetLibraryEntry('ly.img.templates', {
      promptBeforeApply: false
    });
  } catch (e) {
    console.warn('[Wargative Templates] updateAssetLibraryEntry promptBeforeApply warning:', e);
  }

  // Register apply middleware to intercept template clicks BEFORE default apply runs
  const unregister = cesdk.engine.asset.registerApplyMiddleware(
    async (sourceId, assetResult, apply, context) => {
      const isTemplateSource =
        sourceId === 'ly.img.templates' ||
        sourceId.startsWith('ly.img.templates.') ||
        assetResult.meta?.mimeType === 'application/ubq-template-string' ||
        (typeof assetResult.meta?.uri === 'string' &&
          (assetResult.meta.uri.endsWith('.zip') || assetResult.meta.uri.endsWith('.scene')));

      if (!isTemplateSource) {
        // Non-template assets (images, text, vector shapes, stickers) proceed normally
        return apply(sourceId, assetResult, context);
      }

      // DO NOT call apply(sourceId, assetResult) for templates!
      // This prevents default engine.scene.loadFromArchiveURL / applyTemplateFromURL from ever running.
      const pages = cesdk.engine.scene.getPages();
      if (!pages || pages.length === 0) {
        return undefined;
      }

      const currentPage = cesdk.engine.scene.getCurrentPage() ?? pages[0];
      const empty = isPageEmpty(cesdk, currentPage);

      const labelObj = assetResult.label as any;
      const templateLabel =
        typeof labelObj === 'string'
          ? labelObj
          : labelObj?.en || (typeof labelObj === 'object' && labelObj ? Object.values(labelObj)[0] : '') || assetResult.id || 'Template';

      if (empty) {
        // Blank page: Apply immediately without modal
        await applyTemplateToTargetPage(cesdk, assetResult, 'replace', callbacks);
      } else {
        // Existing page: Show Canva-style confirmation modal
        const mode = await showTemplateApplyModal(templateLabel);
        if (mode === 'replace' || mode === 'add_new') {
          await applyTemplateToTargetPage(cesdk, assetResult, mode, callbacks);
        }
      }

      return undefined;
    }
  );

  return unregister;
}
