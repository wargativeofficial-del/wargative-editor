/**
 * CE.SDK Design Editor Starterkit - Main Entry Point
 *
 * A complete design editor for creating graphics, templates, and multi-page documents.
 *
 * @see https://img.ly/docs/cesdk/js/get-started/overview-e18f40/
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import { initDesignEditor } from './imgly';
import { DEMO_ASSETS_BASE_URL } from './imgly/demo-assets';


// ============================================================================
// Configuration
// ============================================================================

const config = {
  userId: 'starterkit-design-editor-user',
  license: 'vERESgSXbYj5Rs-FF4DzkMvhdQLh0Mxe6AD8V-doP6wqe_gmYmx_oUKqIlMkwpMu'
};

// ============================================================================
// Initialize Design Editor
// ============================================================================

CreativeEditorSDK.create('#cesdk_container', config)
  .then(async (cesdk) => {

    await initDesignEditor(cesdk);

    // ============================================================================
    // Dynamic Scene Loading & Custom Size Handling from URL Query
    // ============================================================================
    const urlParams = new URLSearchParams(window.location.search);
    const template = urlParams.get('template');
    const widthParam = urlParams.get('w');
    const heightParam = urlParams.get('h');
    const nameParam = urlParams.get('name');

    if (nameParam) {
      document.title = `${nameParam} - Wargative Editor`;
    }

    if (template === 'marketing-ad') {
      await cesdk.load(
        `${DEMO_ASSETS_BASE_URL}/assets/4-5-marketing-ad/scene.scene`
      );
      await cesdk.actions.run('zoom.toPage', { page: 'first' });
    } else if (widthParam && heightParam) {
      const width = parseFloat(widthParam);
      const height = parseFloat(heightParam);

      // Create a clean design scene with requested dimensions
      await cesdk.createDesignScene({
        width,
        height,
        unit: 'Pixel'
      });

      const pages = cesdk.engine.scene.getPages();
      if (pages.length > 0 && nameParam) {
        cesdk.engine.block.setName(pages[0], nameParam);
      }

      await cesdk.actions.run('zoom.toPage', { page: 'first' });
    } else {
      // Default to marketing-ad scene
      await cesdk.load(
        `${DEMO_ASSETS_BASE_URL}/assets/4-5-marketing-ad/scene.scene`
      );
      await cesdk.actions.run('zoom.toPage', { page: 'first' });
    }
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize CE.SDK:', error);
  });
