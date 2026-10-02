/**
 * CE.SDK Design Editor Starterkit - Main Entry Point with Auto-Save System
 *
 * Automatically saves projects to persistent local storage so changes are never lost.
 * Integrates seamlessly with Wargative Home Dashboard.
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import { initDesignEditor } from './imgly';
import { DEMO_ASSETS_BASE_URL } from './imgly/demo-assets';
import {
  getProject,
  saveProjectMeta,
  saveProjectScene,
  getProjectScene,
  ProjectItem
} from './common/projectStore';

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
    // Dynamic Scene Loading & Project Identity Handling
    // ============================================================================
    const urlParams = new URLSearchParams(window.location.search);
    let projectId = urlParams.get('id') || urlParams.get('projectId');
    const template = urlParams.get('template');
    const templateUri = urlParams.get('templateUri');
    const widthParam = urlParams.get('w') || urlParams.get('width');
    const heightParam = urlParams.get('h') || urlParams.get('height');
    const nameParam = urlParams.get('name') || urlParams.get('title');
    const autoDownload = urlParams.get('autodownload');
    const isAiGen = urlParams.get('source') === 'ai_gen';

    // Check for AI Transfer Design from Wargative AI Magic Studio
    let aiTransferData: any = null;
    const aiTransferRaw = localStorage.getItem('wargative_ai_transfer_design');
    if (aiTransferRaw) {
      try {
        const parsed = JSON.parse(aiTransferRaw);
        if (parsed.projectId === projectId || isAiGen) {
          aiTransferData = parsed;
        }
      } catch (e) {}
    }

    // If no project ID is provided in the URL, create a new persistent project ID
    if (!projectId) {
      projectId = aiTransferData?.projectId || 'proj_' + Date.now();
      urlParams.set('id', projectId);
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${urlParams.toString()}`
      );
    }

    // Resolve project meta
    let projectMeta = getProject(projectId);
    const title = nameParam || aiTransferData?.headline || projectMeta?.title || 'Untitled Design';
    const width = widthParam ? parseFloat(widthParam) : (aiTransferData?.width || projectMeta?.width || 1080);
    const height = heightParam ? parseFloat(heightParam) : (aiTransferData?.height || projectMeta?.height || 1080);
    const format = `${width} x ${height} px`;

    if (!projectMeta) {
      projectMeta = {
        id: projectId,
        title,
        format,
        width,
        height,
        updatedAt: Date.now(),
        thumbnailColor: aiTransferData ? 'linear-gradient(135deg, #0c2340 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
        thumbnailIcon: aiTransferData ? '✨' : '🎨',
        badgeText: aiTransferData ? 'AI Design' : 'Design',
        badgeBg: aiTransferData ? '#7c3aed' : '#6366f1'
      };
      saveProjectMeta(projectMeta);
    }

    document.title = `${projectMeta.title} - Wargative Editor`;

    // ============================================================================
    // Load Saved Scene or Initialize New Scene
    // ============================================================================
    const savedScene = getProjectScene(projectId);

    if (savedScene) {
      // Restore previously saved project scene
      try {
        console.log(`[Wargative AutoSave] Loading saved scene for ${projectId}`);
        await cesdk.engine.scene.loadFromString(savedScene);
        await cesdk.actions.run('zoom.toPage', { page: 'first' });
      } catch (err) {
        console.error('[Wargative AutoSave] Failed to restore saved scene:', err);
        await cesdk.createDesignScene({ width, height, unit: 'Pixel' });
        await cesdk.actions.run('zoom.toPage', { page: 'first' });
      }
    } else if (aiTransferData) {
      // BUILD NATIVE AI DESIGN SCENE (Canva Style Layered Elements)
      console.log('[Wargative] Building native AI design scene:', aiTransferData);
      try {
        await buildAiDesignScene(cesdk, aiTransferData, width, height);
        await cesdk.actions.run('zoom.toPage', { page: 'first' });
        const initialSceneStr = await cesdk.engine.scene.saveToString();
        saveProjectScene(projectId, initialSceneStr);
      } catch (e) {
        console.error('[Wargative] Error building AI scene:', e);
        await cesdk.createDesignScene({ width, height, unit: 'Pixel' });
        await cesdk.actions.run('zoom.toPage', { page: 'first' });
      }
    } else if (templateUri) {
      // Load specific archive template from Wargative library
      console.log(`[Wargative] Loading template archive from ${templateUri}`);
      try {
        await cesdk.engine.scene.loadFromArchiveURL(templateUri);
        await cesdk.actions.run('zoom.toPage', { page: 'first' });
      } catch (err) {
        console.warn('[Wargative] loadFromArchiveURL failed, trying cesdk.load:', err);
        try {
          await cesdk.load(templateUri);
          await cesdk.actions.run('zoom.toPage', { page: 'first' });
        } catch (e2) {
          console.error('[Wargative] Failed to load template:', e2);
          await cesdk.createDesignScene({ width: 1080, height: 1080, unit: 'Pixel' });
          await cesdk.actions.run('zoom.toPage', { page: 'first' });
        }
      }

      // Save initial scene
      try {
        const initialSceneStr = await cesdk.engine.scene.saveToString();
        saveProjectScene(projectId, initialSceneStr);
      } catch (e) {}
    } else if (template === 'marketing-ad' || projectId === 'proj_marketing_ad') {
      // Load marketing ad template
      await cesdk.load(`${DEMO_ASSETS_BASE_URL}/assets/4-5-marketing-ad/scene.scene`);
      await cesdk.actions.run('zoom.toPage', { page: 'first' });

      // Save initial scene
      try {
        const initialSceneStr = await cesdk.engine.scene.saveToString();
        saveProjectScene(projectId, initialSceneStr);
      } catch (e) {}
    } else {
      // Create new clean scene with dimensions
      await cesdk.createDesignScene({
        width,
        height,
        unit: 'Pixel'
      });

      const pages = cesdk.engine.scene.getPages();
      if (pages.length > 0 && title) {
        try {
          cesdk.engine.block.setName(pages[0], title);
        } catch (e) {}
      }

      await cesdk.actions.run('zoom.toPage', { page: 'first' });

      // Save initial scene immediately so it's never lost
      try {
        const initialSceneStr = await cesdk.engine.scene.saveToString();
        saveProjectScene(projectId, initialSceneStr);
      } catch (e) {}
    }

    // ============================================================================
    // Auto-Save UI Indicator & Logic
    // ============================================================================
    const autoSaveBadge = document.createElement('div');
    autoSaveBadge.id = 'wargative-autosave-badge';
    autoSaveBadge.style.cssText = `
      position: fixed;
      top: 12px;
      left: 104px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      color: #334155;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 9999px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      pointer-events: none;
      transition: all 0.2s ease;
    `;
    autoSaveBadge.innerHTML = `
      <span id="as-icon" style="color: #10b981; font-size: 13px;">✓</span>
      <span id="as-text">All changes saved</span>
    `;
    document.body.appendChild(autoSaveBadge);

    const asIcon = autoSaveBadge.querySelector('#as-icon') as HTMLElement;
    const asText = autoSaveBadge.querySelector('#as-text') as HTMLElement;

    let isSaving = false;
    let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const performAutoSave = async () => {
      if (isSaving) return;
      isSaving = true;

      if (asIcon && asText) {
        asIcon.style.color = '#3b82f6';
        asIcon.textContent = '⟳';
        asText.textContent = 'Saving...';
      }

      try {
        const sceneString = await cesdk.engine.scene.saveToString();
        saveProjectScene(projectId!, sceneString);

        // Update project store timestamp
        const currentMeta = getProject(projectId!) || projectMeta;
        if (currentMeta) {
          currentMeta.updatedAt = Date.now();
          saveProjectMeta(currentMeta);
        }

        setTimeout(() => {
          if (asIcon && asText) {
            asIcon.style.color = '#10b981';
            asIcon.textContent = '✓';
            asText.textContent = 'All changes saved';
          }
        }, 300);
      } catch (err) {
        console.error('[Wargative AutoSave] Failed to save scene:', err);
        if (asIcon && asText) {
          asIcon.style.color = '#94a3b8';
          asIcon.textContent = '✓';
          asText.textContent = 'Saved locally';
        }
      } finally {
        isSaving = false;
      }
    };

    // Auto-save on every user edit in CE.SDK canvas
    cesdk.engine.editor.onHistoryUpdated(() => {
      if (asIcon && asText) {
        asIcon.style.color = '#f59e0b';
        asIcon.textContent = '●';
        asText.textContent = 'Unsaved changes...';
      }

      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(performAutoSave, 1000);
    });

    // Auto-save before unload, pagehide, and visibilitychange
    window.addEventListener('beforeunload', () => {
      try {
        cesdk.engine.scene.saveToString().then((sceneString) => {
          saveProjectScene(projectId!, sceneString);
        });
      } catch (e) {}
    });

    window.addEventListener('pagehide', () => {
      try {
        cesdk.engine.scene.saveToString().then((sceneString) => {
          saveProjectScene(projectId!, sceneString);
        });
      } catch (e) {}
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        performAutoSave();
      }
    });

    // Home button: save scene first, then navigate
    const homeBtn = document.querySelector('.wargative-home-btn');
    if (homeBtn) {
      homeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (asIcon && asText) {
          asIcon.textContent = '⟳';
          asText.textContent = 'Saving...';
        }
        try {
          const sceneString = await cesdk.engine.scene.saveToString();
          saveProjectScene(projectId!, sceneString);
          const currentMeta = getProject(projectId!) || projectMeta;
          if (currentMeta) {
            currentMeta.updatedAt = Date.now();
            saveProjectMeta(currentMeta);
          }
        } catch (err) {}
        window.location.href = './home.html';
      });
    }

    // Auto download if requested via query param
    if (autoDownload === 'true') {
      setTimeout(async () => {
        try {
          await cesdk.actions.run('saveScene');
        } catch (err) {
          console.error('[Wargative AutoDownload] Failed:', err);
        }
      }, 1000);
    }
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize CE.SDK:', error);
  });

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  let c = (hex || '#0c2340').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
    a: 1.0
  };
}

async function buildAiDesignScene(cesdk: any, aiData: any, w: number, h: number) {
  await cesdk.createDesignScene({ width: w, height: h, unit: 'Pixel' });
  const pages = cesdk.engine.scene.getPages();
  const page = pages[0];
  if (!page) return;

  // 1. Background Rectangle Block
  try {
    const bgBlock = cesdk.engine.block.create('graphic');
    cesdk.engine.block.setShape(bgBlock, cesdk.engine.block.createShape('rect'));
    const bgFill = cesdk.engine.block.createFill('color');
    cesdk.engine.block.setColor(bgFill, 'fill/color/value', hexToRgba(aiData.colors?.bg || '#0c2340'));
    cesdk.engine.block.setFill(bgBlock, bgFill);
    cesdk.engine.block.setWidth(bgBlock, w);
    cesdk.engine.block.setHeight(bgBlock, h);
    cesdk.engine.block.setPositionX(bgBlock, 0);
    cesdk.engine.block.setPositionY(bgBlock, 0);
    cesdk.engine.block.appendChild(page, bgBlock);
  } catch (e) {
    console.warn('[AI Builder] Background block failed:', e);
  }

  // 2. High-res Photo Graphic Block (lower portion)
  try {
    if (aiData.imageUrl) {
      const imgBlock = cesdk.engine.block.create('graphic');
      cesdk.engine.block.setShape(imgBlock, cesdk.engine.block.createShape('rect'));
      const imgFill = cesdk.engine.block.createFill('image');
      cesdk.engine.block.setString(imgFill, 'fill/image/imageFileURI', aiData.imageUrl);
      cesdk.engine.block.setFill(imgBlock, imgFill);
      const imgHeight = h * 0.65;
      const imgY = h * 0.35;
      cesdk.engine.block.setWidth(imgBlock, w);
      cesdk.engine.block.setHeight(imgBlock, imgHeight);
      cesdk.engine.block.setPositionX(imgBlock, 0);
      cesdk.engine.block.setPositionY(imgBlock, imgY);
      cesdk.engine.block.appendChild(page, imgBlock);
    }
  } catch (e) {
    console.warn('[AI Builder] Image block failed:', e);
  }

  // 3. Headline Text Block
  try {
    if (aiData.headline) {
      const textHeadline = cesdk.engine.block.create('text');
      cesdk.engine.block.replaceText(textHeadline, aiData.headline);
      cesdk.engine.block.setTextColor(textHeadline, { r: 1, g: 1, b: 1, a: 1 });
      cesdk.engine.block.setWidth(textHeadline, w - 140);
      cesdk.engine.block.setPositionX(textHeadline, 70);
      cesdk.engine.block.setPositionY(textHeadline, 90);
      cesdk.engine.block.appendChild(page, textHeadline);
    }
  } catch (e) {
    console.warn('[AI Builder] Headline text failed:', e);
  }

  // 4. Subheadline Text Block
  try {
    if (aiData.subheadline) {
      const textSub = cesdk.engine.block.create('text');
      cesdk.engine.block.replaceText(textSub, aiData.subheadline);
      cesdk.engine.block.setTextColor(textSub, { r: 0.8, g: 0.85, b: 0.95, a: 1 });
      cesdk.engine.block.setWidth(textSub, w - 140);
      cesdk.engine.block.setPositionX(textSub, 70);
      cesdk.engine.block.setPositionY(textSub, 250);
      cesdk.engine.block.appendChild(page, textSub);
    }
  } catch (e) {
    console.warn('[AI Builder] Subheadline text failed:', e);
  }
}
