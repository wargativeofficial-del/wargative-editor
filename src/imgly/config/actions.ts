/**
 * Actions Configuration - Override Default Actions and Add Custom Actions
 *
 * This file shows how to override CE.SDK's default actions with your own
 * implementations for the Design Editor starterkit.
 *
 * ## Actions API
 *
 * - `cesdk.actions.register(id, handler)` - Register or override an action
 * - `cesdk.actions.run(id, ...args)` - Execute an action (async, throws if not found)
 * - `cesdk.actions.get(id)` - Get action handler (returns undefined if not found)
 * - `cesdk.actions.list()` - List all registered action IDs
 *
 * ## Built-in Utility Functions
 *
 * CE.SDK provides utilities for common operations that you can use in your actions:
 *
 * - `cesdk.utils.export(options)` - Export current design to various formats.
 * Options: mimeType, targetWidth, targetHeight, jpegQuality, pngCompressionLevel.
 * Returns: { blobs: Blob[], options: ExportOptions }.
 *
 * - `cesdk.utils.downloadFile(data, mimeType, filename?)` - Trigger browser file download.
 * data: Blob, string, or ArrayBuffer.
 * mimeType: MIME type (e.g., 'image/png', 'application/json').
 * filename: Optional filename (auto-generated if not provided).
 *
 * - `cesdk.utils.loadFile(options)` - Open browser file picker.
 * Options: accept (file extensions), returnType ('text', 'arrayBuffer', 'objectURL').
 * Returns: Promise<string | ArrayBuffer | string> based on returnType.
 *
 * - `cesdk.utils.localUpload(file, context)` - Create local blob URL for uploads.
 * file: File object from input or drag-drop.
 * context: Upload context ('image', 'video', 'audio', etc.).
 * Returns: Promise<string> - Blob URL that can be used with engine.
 *
 * @see https://img.ly/docs/cesdk/js/actions-6ch24x
 * @see https://img.ly/docs/cesdk/js/export/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';
import type { AssetDefinition } from '@cesdk/engine';
import { getAuthHeader } from '../../common/authClient';
import {
  saveProjectMeta,
  saveProjectScene,
  getProject,
  deleteProject,
  ProjectItem
} from '../../common/projectStore';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = src;
  });
}

async function convertFileToPngDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(tempUrl);
          reject(new Error('Gagal menginisialisasi canvas untuk konversi gambar.'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(tempUrl);
        resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      } catch (e) {
        URL.revokeObjectURL(tempUrl);
        reject(e);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(tempUrl);
      reject(err);
    };
    img.src = tempUrl;
  });
}


/**
 * Register actions and configure the navigation bar.
 *
 * Override default actions to integrate with your backend, cloud storage,
 * or customize the export/import behavior for your application's needs.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 *
 * @example Running actions programmatically
 * ```typescript
 * // Run built-in actions
 * await cesdk.actions.run('saveScene');
 * await cesdk.actions.run('exportDesign', { mimeType: 'image/png' });
 * await cesdk.actions.run('zoom.toPage', { page: 'current' });
 *
 * // Run custom actions
 * await cesdk.actions.run('exportScene', { format: 'archive' });
 * ```
 */
export function setupActions(cesdk: CreativeEditorSDK): void {
  // ============================================================================
  // OVERRIDE DEFAULT ACTIONS
  // Replace CE.SDK's default implementations with your own
  // ============================================================================

  // #region Save Scene Action
  // Export the design as image directly so the user gets their image file
  cesdk.actions.register('saveScene', async () => {
    try {
      const { blobs, options } = await cesdk.utils.export({ mimeType: 'image/png' });
      if (blobs && blobs[0]) {
        await cesdk.utils.downloadFile(blobs[0], options.mimeType);
      }
    } catch (error) {
      console.error('Failed to export image on save:', error);
    }
  });
  // #endregion

  // #region Export Design Action
  // Generic export action that handles various export formats
  // Used by the SDK's built-in export UI components
  cesdk.actions.register('exportDesign', async (exportOptions) => {
    const { blobs, options } = await cesdk.utils.export(exportOptions);
    await cesdk.utils.downloadFile(blobs[0], options.mimeType);
  });
  // #endregion

  // #region Import Scene Action
  // Import a scene or archive .imgly file (legacy .scene and .zip keep working);
  // Isolated new-project import workflow: Never overwrites active Project A!
  cesdk.actions.register('importScene', async ({ format } = {}) => {
    let accept = '.imgly,.scene,.zip';
    if (format === 'scene') {
      accept = '.imgly,.scene';
    } else if (format === 'archive') {
      accept = '.imgly,.zip';
    }

    let fileOrBlob: any;
    try {
      fileOrBlob = await cesdk.utils.loadFile({
        accept,
        returnType: 'File'
      });
    } catch (pickerErr) {
      // User cancelled file picker or picker was aborted
      return;
    }

    if (!fileOrBlob) {
      return;
    }

    let blobURL: string;
    let shouldRevoke = true;
    let fileName = 'Imported Design';

    if (typeof fileOrBlob === 'string') {
      blobURL = fileOrBlob;
    } else if (fileOrBlob instanceof Blob) {
      blobURL = URL.createObjectURL(fileOrBlob);
      if ((fileOrBlob as File).name) {
        fileName = (fileOrBlob as File).name.replace(/\.[^/.]+$/, '').trim() || 'Imported Design';
      }
    } else {
      return;
    }

    // 1. STEP A: Cancel pending autosave timer & flush Project A completely!
    if (typeof (window as any).__wargativeCancelPendingSave === 'function') {
      (window as any).__wargativeCancelPendingSave();
    }

    const currentProjectId: string | undefined =
      (window as any).__wargativeGetActiveProjectId?.() ||
      new URLSearchParams(window.location.search).get('id') ||
      new URLSearchParams(window.location.search).get('projectId') ||
      undefined;

    let projectASceneString: string | null = null;
    let projectAMeta: ProjectItem | undefined = undefined;

    if (currentProjectId) {
      try {
        projectASceneString = await cesdk.engine.scene.saveToString();
        saveProjectScene(currentProjectId, projectASceneString);
        projectAMeta = getProject(currentProjectId) || (window as any).__wargativeGetActiveProjectMeta?.();
        if (projectAMeta) {
          projectAMeta.updatedAt = Date.now();
          saveProjectMeta(projectAMeta);
        }
      } catch (err) {
        console.warn('[Wargative Import] Failed to save Project A before import:', err);
      }
    }

    // 2. STEP B: Generate new unique project ID and provisional metadata
    const newProjectId = 'proj_' + Date.now();
    const provisionalMeta: ProjectItem = {
      id: newProjectId,
      title: fileName || 'Imported Design',
      format: '1080 x 1080 px',
      width: 1080,
      height: 1080,
      updatedAt: Date.now(),
      thumbnailColor: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
      thumbnailIcon: '📥',
      badgeText: 'Imported',
      badgeBg: '#2563eb',
      badgeIconType: 'doc',
      previewType: 'imported'
    };

    // 3. STEP C: Register new project metadata into project list BEFORE scene.load()
    // This guarantees getProject(newProjectId) is never undefined during scene.load()
    saveProjectMeta(provisionalMeta);

    // 4. STEP D: Bind editor active context to newProjectId and provisionalMeta BEFORE scene.load()
    // Any onHistoryUpdated or autosave that triggers during load will write exclusively to newProjectId
    if (typeof (window as any).__wargativeBindProject === 'function') {
      (window as any).__wargativeBindProject(newProjectId, provisionalMeta);
    }

    // 5. STEP E: Load imported scene with error handling and rollback on failure
    try {
      await cesdk.engine.scene.load(blobURL);
    } catch (loadErr) {
      console.error('[Wargative Import] Failed to load scene:', loadErr);
      // Remove provisional project from storage
      deleteProject(newProjectId);

      // Rollback canvas to Project A snapshot
      if (currentProjectId && projectASceneString) {
        try {
          await cesdk.engine.scene.loadFromString(projectASceneString);
        } catch (rbErr) {
          console.error('[Wargative Import] Rollback to Project A failed:', rbErr);
        }
        // Restore active context and URL back to Project A
        if (typeof (window as any).__wargativeBindProject === 'function' && projectAMeta) {
          (window as any).__wargativeBindProject(currentProjectId, projectAMeta);
        }
      }
      alert('Gagal mengimpor file: Format tidak didukung atau file rusak.');
      return;
    } finally {
      if (shouldRevoke && blobURL) {
        try {
          URL.revokeObjectURL(blobURL);
        } catch (e) {}
      }
    }

    // 6. STEP F: Extract actual dimensions and page info from the newly loaded scene
    let width = 1080;
    let height = 1080;
    let finalTitle = fileName;

    try {
      const pages = cesdk.engine.scene.getPages();
      if (pages.length > 0) {
        const firstPage = pages[0];
        const pageW = Math.round(cesdk.engine.block.getWidth(firstPage));
        const pageH = Math.round(cesdk.engine.block.getHeight(firstPage));
        if (pageW > 0) width = pageW;
        if (pageH > 0) height = pageH;

        const pageName = cesdk.engine.block.getName(firstPage);
        if (pageName && pageName !== 'Page 1' && (!fileName || fileName === 'Imported Design')) {
          finalTitle = pageName;
        }
      }
    } catch (e) {}

    const formatLabel = `${width} x ${height} px`;

    // 7. STEP G: Save the scene to the new project in persistent storage
    try {
      const newSceneString = await cesdk.engine.scene.saveToString();
      saveProjectScene(newProjectId, newSceneString);
    } catch (saveErr) {
      console.error('[Wargative Import] Failed to save imported scene:', saveErr);
      alert('Gagal menyimpan scene baru ke penyimpanan lokal.');
      return;
    }

    // 8. STEP H: Update new project metadata with definitive dimensions and title
    const finalMeta: ProjectItem = {
      ...provisionalMeta,
      title: finalTitle,
      format: formatLabel,
      width,
      height,
      updatedAt: Date.now()
    };
    saveProjectMeta(finalMeta);

    // 9. STEP I: Re-bind active editor context to final metadata & reset zoom
    if (typeof (window as any).__wargativeBindProject === 'function') {
      (window as any).__wargativeBindProject(newProjectId, finalMeta);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('id', newProjectId);
      url.searchParams.delete('projectId');
      url.searchParams.set('name', finalTitle);
      window.history.replaceState(null, '', url.toString());
      document.title = `${finalTitle} - Wargative Editor`;
    }

    await cesdk.actions.run('zoom.toPage', { page: 'first' });
  });
  // #endregion

  // #region Export Scene Action
  // Export the scene in different formats
  // - 'scene': JSON text file for lightweight sharing
  // - 'archive': .cesdk zip archive with embedded assets
  cesdk.actions.register('exportScene', async ({ format = 'scene' }) => {
    await cesdk.utils.downloadFile(
      format === 'archive'
        ? await cesdk.engine.scene.saveToArchive()
        : await cesdk.engine.scene.saveToString(),
      format === 'archive' ? 'application/zip' : 'text/plain;charset=UTF-8'
    );
  });
  // #endregion

  // #region Upload File Action
  // Handle local file uploads by persisting them permanently to Supabase Storage
  // Returns AssetDefinition with permanent HTTPS URL so the scene never stores temporary blob: URLs
  cesdk.actions.register('uploadFile', async (file, onProgress) => {
    const authHeaders = await getAuthHeader();
    if (!authHeaders.Authorization) {
      throw new Error('Sesi login diperlukan untuk mengunggah gambar. Silakan login ke akun Wargative terlebih dahulu.');
    }

    let mimeType = (file.type || 'image/jpeg').toLowerCase();
    let base64Data: string;
    let width = 0;
    let height = 0;

    // Supabase media upload supports image/jpeg, image/jpg, and image/png
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/jpg' && mimeType !== 'image/png') {
      const converted = await convertFileToPngDataUrl(file);
      base64Data = converted.dataUrl;
      mimeType = 'image/png';
      width = converted.width;
      height = converted.height;
    } else {
      base64Data = await readFileAsDataUrl(file);
      const dims = await getImageDimensions(base64Data);
      width = dims.width;
      height = dims.height;
    }

    if (onProgress) onProgress(30);

    const res = await fetch('/api/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        imageBase64: base64Data,
        mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
      })
    });

    if (onProgress) onProgress(80);

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.url) {
      const errMsg = data?.message || data?.error || 'Gagal mengunggah gambar ke cloud storage.';
      throw new Error(errMsg);
    }

    if (onProgress) onProgress(100);

    const permanentHttpsUrl = data.url as string;
    const assetId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const asset: AssetDefinition = {
      id: assetId,
      meta: {
        uri: permanentHttpsUrl,
        thumbUri: permanentHttpsUrl,
        mimeType,
        width: width || undefined,
        height: height || undefined
      }
    };

    return asset;
  });
  // #endregion

  // ============================================================================
  // CUSTOM ACTIONS
  // Register your own actions for custom functionality
  // ============================================================================

  // #region Share Action Example
  // Example: Share design using Web Share API (mobile/modern browsers)
  // Falls back to download if sharing is not supported
  //
  // cesdk.actions.register('share', async () => {
  //   const { blobs } = await cesdk.utils.export({ mimeType: 'image/png' });
  //   const file = new File([blobs[0]], 'design.png', { type: 'image/png' });
  //
  //   if (navigator.share && navigator.canShare({ files: [file] })) {
  //     await navigator.share({
  //       files: [file],
  //       title: 'My Design',
  //       text: 'Check out my design!'
  //     });
  //   } else {
  //     await cesdk.utils.downloadFile(blobs[0], 'image/png');
  //   }
  // });
  // #endregion

  // #region Backend Integration Example
  // Example: Upload design to your backend server
  //
  // cesdk.actions.register('saveToBackend', async () => {
  //   const scene = await cesdk.engine.scene.saveToString();
  //   const response = await fetch('/api/designs', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ scene })
  //   });
  //   const { id } = await response.json();
  //   console.log('Design saved with ID:', id);
  // });
  // #endregion
}
