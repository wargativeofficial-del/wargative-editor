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
  // without a format the file's content decides how it is loaded
  cesdk.actions.register('importScene', async ({ format } = {}) => {
    // The engine detects scenes vs archives from the file content, so the file
    // is always handed over as an object URL. `format` only narrows the picker.
    let accept = '.imgly,.scene,.zip';
    if (format === 'scene') {
      accept = '.imgly,.scene';
    } else if (format === 'archive') {
      accept = '.imgly,.zip';
    }

    const blobURL = await cesdk.utils.loadFile({
      accept,
      returnType: 'objectURL'
    });
    try {
      await cesdk.engine.scene.load(blobURL);
    } finally {
      URL.revokeObjectURL(blobURL);
    }

    // Reset zoom to show the first page after import
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
