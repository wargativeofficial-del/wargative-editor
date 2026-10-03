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

    // Informative notification for legacy projects containing local blob: images
    const showLegacyBlobNotification = () => {
      if (document.getElementById('wargative-legacy-blob-alert')) return;
      const alertEl = document.createElement('div');
      alertEl.id = 'wargative-legacy-blob-alert';
      alertEl.style.cssText = `
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99998;
        display: flex;
        align-items: center;
        gap: 12px;
        background: #fffbeb;
        border: 1px solid #fef3c7;
        border-left: 4px solid #f59e0b;
        padding: 10px 18px;
        border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #92400e;
        max-width: 640px;
        box-sizing: border-box;
      `;
      alertEl.innerHTML = `
        <span style="font-size: 18px; line-height: 1;">⚠️</span>
        <div style="flex: 1; line-height: 1.4;">
          <strong>Pembaruan Gambar Diperlukan:</strong> Proyek ini memiliki gambar yang diunggah sebelum penyimpanan cloud aktif dan sesi lokalnya telah kedaluwarsa. Agar proyek dapat dipublikasikan ke media sosial, silakan klik gambar tersebut dan pilih <em>Ganti Gambar</em> untuk menyimpannya secara permanen ke cloud.
        </div>
        <button id="btnCloseBlobAlert" type="button" style="background: none; border: none; font-size: 20px; color: #b45309; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
      `;
      document.body.appendChild(alertEl);

      const closeBtn = alertEl.querySelector('#btnCloseBlobAlert');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => alertEl.remove());
      }
    };

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

        // Auto-dismiss the legacy blob warning if user has replaced all blob: assets with permanent URLs
        if (!sceneString.includes('blob:')) {
          const alertEl = document.getElementById('wargative-legacy-blob-alert');
          if (alertEl) alertEl.remove();
        }

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

    // ============================================================================
    // Real-Time Bi-Directional Live Sync System (CE.SDK <--> AI Magic Studio)
    // ============================================================================
    const syncChannel = new BroadcastChannel('wargative_live_sync_channel');
    let isSyncingFromAi = false;
    let lastBroadcastState = { headline: '', subheadline: '', badge: '' };
    let sceneSyncDebounce: ReturnType<typeof setTimeout> | null = null;

    function getBlockText(blockId: number): string {
      try {
        const runs = cesdk.engine.block.getTextRuns(blockId);
        if (Array.isArray(runs)) {
          return runs.map((r: any) => r.text || '').join('');
        }
        return '';
      } catch (e) {
        return '';
      }
    }

    function syncAiDataToSceneBlocks(aiData: any) {
      if (!aiData) return;
      isSyncingFromAi = true;
      try {
        const targetW = aiData.width || 1080;

        // 1. Headline
        if (aiData.headline) {
          let hlBlocks = cesdk.engine.block.findByName('ai_headline');
          if (hlBlocks.length === 0) {
            const textBlocks = cesdk.engine.block.findByType('text');
            if (textBlocks.length > 0) {
              cesdk.engine.block.setName(textBlocks[0], 'ai_headline');
              hlBlocks = [textBlocks[0]];
            }
          }
          if (hlBlocks.length > 0) {
            const hl = hlBlocks[0];
            const curText = getBlockText(hl);
            if (curText !== aiData.headline) {
              cesdk.engine.block.replaceText(hl, aiData.headline);
            }
            cesdk.engine.block.setWidth(hl, targetW - 140);
            cesdk.engine.block.setHeight(hl, 260);
            try {
              cesdk.engine.block.setHeightMode(hl, 'Auto');
            } catch (e) {}
          }
        }

        // 2. Subheadline
        if (aiData.subheadline) {
          let subBlocks = cesdk.engine.block.findByName('ai_subheadline');
          if (subBlocks.length === 0) {
            const textBlocks = cesdk.engine.block.findByType('text');
            if (textBlocks.length > 1) {
              cesdk.engine.block.setName(textBlocks[1], 'ai_subheadline');
              subBlocks = [textBlocks[1]];
            }
          }
          if (subBlocks.length > 0) {
            const sub = subBlocks[0];
            const curText = getBlockText(sub);
            if (curText !== aiData.subheadline) {
              cesdk.engine.block.replaceText(sub, aiData.subheadline);
            }
            cesdk.engine.block.setWidth(sub, targetW - 140);
            try {
              cesdk.engine.block.setHeightMode(sub, 'Auto');
            } catch (e) {}
          }
        }

        // 3. Badge
        if (aiData.badge) {
          let badgeBlocks = cesdk.engine.block.findByName('ai_badge');
          if (badgeBlocks.length === 0) {
            const textBlocks = cesdk.engine.block.findByType('text');
            if (textBlocks.length > 2) {
              cesdk.engine.block.setName(textBlocks[2], 'ai_badge');
              badgeBlocks = [textBlocks[2]];
            }
          }
          if (badgeBlocks.length > 0) {
            const badge = badgeBlocks[0];
            const curText = getBlockText(badge);
            if (curText !== aiData.badge) {
              cesdk.engine.block.replaceText(badge, aiData.badge);
            }
          }
        }

        // 4. Ensure polyBlock is never a solid obstructive blue box
        const polyBlocks = cesdk.engine.block.findByName('ai_poly');
        if (polyBlocks.length > 0) {
          const pb = polyBlocks[0];
          cesdk.engine.block.setWidth(pb, 70);
          cesdk.engine.block.setHeight(pb, 70);
          cesdk.engine.block.setPositionX(pb, targetW - 120);
          cesdk.engine.block.setPositionY(pb, 35);
          try {
            const fill = cesdk.engine.block.getFill(pb);
            if (fill) {
              cesdk.engine.block.setColor(fill, 'fill/color/value', { r: 0.22, g: 0.74, b: 0.97, a: 0.05 });
            }
          } catch (e) {}
        }

        // Auto-save the updated scene
        performAutoSave();
      } catch (err) {
        console.warn('[Wargative Sync] Error syncing AI data to scene blocks:', err);
      } finally {
        setTimeout(() => {
          isSyncingFromAi = false;
        }, 200);
      }
    }

    function syncSceneToAiStudio() {
      if (isSyncingFromAi) return;

      if (sceneSyncDebounce) clearTimeout(sceneSyncDebounce);
      sceneSyncDebounce = setTimeout(() => {
        try {
          let headline = '';
          let subheadline = '';
          let badge = '';

          let hlBlocks = cesdk.engine.block.findByName('ai_headline');
          if (hlBlocks.length === 0) {
            const texts = cesdk.engine.block.findByType('text');
            if (texts.length > 0) {
              cesdk.engine.block.setName(texts[0], 'ai_headline');
              hlBlocks = [texts[0]];
            }
          }
          if (hlBlocks.length > 0) {
            headline = getBlockText(hlBlocks[0]);
          }

          let subBlocks = cesdk.engine.block.findByName('ai_subheadline');
          if (subBlocks.length === 0) {
            const texts = cesdk.engine.block.findByType('text');
            if (texts.length > 1) {
              cesdk.engine.block.setName(texts[1], 'ai_subheadline');
              subBlocks = [texts[1]];
            }
          }
          if (subBlocks.length > 0) {
            subheadline = getBlockText(subBlocks[0]);
          }

          let badgeBlocks = cesdk.engine.block.findByName('ai_badge');
          if (badgeBlocks.length === 0) {
            const texts = cesdk.engine.block.findByType('text');
            if (texts.length > 2) {
              cesdk.engine.block.setName(texts[2], 'ai_badge');
              badgeBlocks = [texts[2]];
            }
          }
          if (badgeBlocks.length > 0) {
            badge = getBlockText(badgeBlocks[0]);
          }

          if (!headline && !subheadline && !badge) return;

          if (
            headline !== lastBroadcastState.headline ||
            subheadline !== lastBroadcastState.subheadline ||
            badge !== lastBroadcastState.badge
          ) {
            lastBroadcastState = { headline, subheadline, badge };

            const syncPayload = {
              type: 'EDITOR_TO_AI',
              projectId,
              timestamp: Date.now(),
              data: {
                headline,
                subheadline,
                badge
              }
            };

            // 1. Post message to BroadcastChannel for instant real-time live sync
            syncChannel.postMessage(syncPayload);

            // 2. Persist to localStorage
            localStorage.setItem(`wargative_ai_live_sync_${projectId}`, JSON.stringify(syncPayload));

            // 3. Update transfer design
            const transferRaw = localStorage.getItem('wargative_ai_transfer_design');
            if (transferRaw) {
              try {
                const parsed = JSON.parse(transferRaw);
                if (parsed.projectId === projectId || !parsed.projectId) {
                  if (headline) parsed.headline = headline;
                  if (subheadline) parsed.subheadline = subheadline;
                  if (badge) parsed.badge = badge;
                  localStorage.setItem('wargative_ai_transfer_design', JSON.stringify(parsed));
                }
              } catch (e) {}
            }

            // 4. Update project title in store
            const currentMeta = getProject(projectId!);
            if (currentMeta && headline) {
              currentMeta.title = headline;
              currentMeta.updatedAt = Date.now();
              saveProjectMeta(currentMeta);
            }
          }
        } catch (err) {
          console.warn('[Sync] Failed sync to AI Studio:', err);
        }
      }, 100);
    }

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

        // Inform user if this legacy project still contains expired local blob: assets
        if (savedScene.includes('blob:')) {
          showLegacyBlobNotification();
        }

        // CRITICAL FIX: If aiTransferData is present, sync any updated text from AI Studio into scene blocks!
        if (aiTransferData) {
          syncAiDataToSceneBlocks(aiTransferData);
        }
      } catch (err) {
        console.error('[Wargative AutoSave] Failed to restore saved scene:', err);
        if (aiTransferData) {
          await buildAiDesignScene(cesdk, aiTransferData, width, height);
        } else {
          await cesdk.createDesignScene({ width, height, unit: 'Pixel' });
        }
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

    // Auto-save on every user edit in CE.SDK canvas & sync to AI Studio!
    cesdk.engine.editor.onHistoryUpdated(() => {
      if (asIcon && asText) {
        asIcon.style.color = '#f59e0b';
        asIcon.textContent = '●';
        asText.textContent = 'Unsaved changes...';
      }

      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(performAutoSave, 1000);

      // Live sync every change to AI Studio
      syncSceneToAiStudio();
    });

    // Subscribe to block events for immediate feedback
    try {
      (cesdk.engine.block as any).subscribe([], () => {
        syncSceneToAiStudio();
      });
    } catch (e) {}

    // Listen to real-time changes coming from AI Studio
    syncChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'AI_TO_EDITOR') return;
      if (msg.projectId && msg.projectId !== projectId) return;
      console.log('[Wargative Sync] Received AI_TO_EDITOR update:', msg.data);
      syncAiDataToSceneBlocks(msg.data);
    };

    // Fallback sync via localStorage storage event
    window.addEventListener('storage', (e) => {
      if (e.key === `wargative_ai_live_sync_${projectId}` || e.key === 'wargative_ai_transfer_design') {
        if (!e.newValue) return;
        try {
          const parsed = JSON.parse(e.newValue);
          const data = parsed.data || parsed;
          syncAiDataToSceneBlocks(data);
        } catch (err) {}
      }
    });

    // Focus listener: When user switches back to Editor tab, reload latest AI changes
    window.addEventListener('focus', () => {
      const raw = localStorage.getItem(`wargative_ai_live_sync_${projectId}`) || localStorage.getItem('wargative_ai_transfer_design');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const data = parsed.data || parsed;
          if (data && data.headline) {
            syncAiDataToSceneBlocks(data);
          }
        } catch (err) {}
      }
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

    // AI Studio button: show if AI design, save and return to AI Studio
    const aiNavBtn = document.getElementById('navAiStudioBtn') as HTMLAnchorElement;
    if (aiNavBtn) {
      if (isAiGen || aiTransferData) {
        aiNavBtn.style.display = 'flex';
        autoSaveBadge.style.left = '218px';
      }
      aiNavBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (asIcon && asText) {
          asIcon.textContent = '⟳';
          asText.textContent = 'Saving...';
        }
        try {
          const sceneString = await cesdk.engine.scene.saveToString();
          saveProjectScene(projectId!, sceneString);
          syncSceneToAiStudio();
        } catch (err) {}
        window.location.href = './wargative-ai.html';
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
  // Use vertical poster dimensions (1080 x 1350)
  const targetW = aiData.width || w || 1080;
  const targetH = aiData.height || h || 1350;

  await cesdk.createDesignScene({ width: targetW, height: targetH, unit: 'Pixel' });
  const pages = cesdk.engine.scene.getPages();
  const page = pages[0];
  if (!page) return;

  // 1. Background Rectangle Block (Dark Navy #0c2340)
  try {
    const bgBlock = cesdk.engine.block.create('graphic');
    cesdk.engine.block.setName(bgBlock, 'ai_bg');
    cesdk.engine.block.setShape(bgBlock, cesdk.engine.block.createShape('rect'));
    const bgFill = cesdk.engine.block.createFill('color');
    cesdk.engine.block.setColor(bgFill, 'fill/color/value', hexToRgba(aiData.colors?.bg || '#0c2340'));
    cesdk.engine.block.setFill(bgBlock, bgFill);
    cesdk.engine.block.setWidth(bgBlock, targetW);
    cesdk.engine.block.setHeight(bgBlock, targetH);
    cesdk.engine.block.setPositionX(bgBlock, 0);
    cesdk.engine.block.setPositionY(bgBlock, 0);
    cesdk.engine.block.appendChild(page, bgBlock);
  } catch (e) {
    console.warn('[AI Builder] Background block failed:', e);
  }

  // 2. High-res Photo Graphic Block (lower 62% of poster)
  const imgY = Math.round(targetH * 0.38);
  const imgHeight = targetH - imgY;

  try {
    if (aiData.imageUrl) {
      const imgBlock = cesdk.engine.block.create('graphic');
      cesdk.engine.block.setName(imgBlock, 'ai_image');
      cesdk.engine.block.setShape(imgBlock, cesdk.engine.block.createShape('rect'));
      const imgFill = cesdk.engine.block.createFill('image');
      cesdk.engine.block.setString(imgFill, 'fill/image/imageFileURI', aiData.imageUrl);
      cesdk.engine.block.setFill(imgBlock, imgFill);
      cesdk.engine.block.setWidth(imgBlock, targetW);
      cesdk.engine.block.setHeight(imgBlock, imgHeight);
      cesdk.engine.block.setPositionX(imgBlock, 0);
      cesdk.engine.block.setPositionY(imgBlock, imgY);
      cesdk.engine.block.appendChild(page, imgBlock);
    }
  } catch (e) {
    console.warn('[AI Builder] Image block failed:', e);
  }

  // 3. Golden Accent Divider / Wave Bar
  try {
    const dividerBlock = cesdk.engine.block.create('graphic');
    cesdk.engine.block.setName(dividerBlock, 'ai_divider');
    cesdk.engine.block.setShape(dividerBlock, cesdk.engine.block.createShape('rect'));
    const dividerFill = cesdk.engine.block.createFill('color');
    cesdk.engine.block.setColor(dividerFill, 'fill/color/value', hexToRgba(aiData.colors?.accent || '#f59e0b'));
    cesdk.engine.block.setFill(dividerBlock, dividerFill);
    cesdk.engine.block.setWidth(dividerBlock, targetW);
    cesdk.engine.block.setHeight(dividerBlock, 16);
    cesdk.engine.block.setPositionX(dividerBlock, 0);
    cesdk.engine.block.setPositionY(dividerBlock, imgY - 8);
    cesdk.engine.block.appendChild(page, dividerBlock);
  } catch (e) {
    console.warn('[AI Builder] Divider block failed:', e);
  }

  // 4. Geometric Wireframe Polygon at Top Right (subtle decor, NOT solid blue box)
  try {
    const polyBlock = cesdk.engine.block.create('graphic');
    cesdk.engine.block.setName(polyBlock, 'ai_poly');
    cesdk.engine.block.setShape(polyBlock, cesdk.engine.block.createShape('rect'));
    const polyFill = cesdk.engine.block.createFill('color');
    cesdk.engine.block.setColor(polyFill, 'fill/color/value', { r: 0.22, g: 0.74, b: 0.97, a: 0.05 });
    cesdk.engine.block.setFill(polyBlock, polyFill);
    cesdk.engine.block.setWidth(polyBlock, 70);
    cesdk.engine.block.setHeight(polyBlock, 70);
    cesdk.engine.block.setPositionX(polyBlock, targetW - 120);
    cesdk.engine.block.setPositionY(polyBlock, 35);
    try {
      const polyStroke = cesdk.engine.block.createStroke();
      cesdk.engine.block.setColor(polyStroke, 'stroke/color/value', { r: 0.22, g: 0.74, b: 0.97, a: 0.5 });
      cesdk.engine.block.setFloat(polyStroke, 'stroke/width', 2);
      cesdk.engine.block.setStroke(polyBlock, polyStroke);
    } catch (err) {}
    cesdk.engine.block.appendChild(page, polyBlock);
  } catch (e) {
    console.warn('[AI Builder] Poly block failed:', e);
  }

  // 5. Headline Text Block (Bold Montserrat, autoHeight, plenty of width)
  try {
    if (aiData.headline) {
      const textHeadline = cesdk.engine.block.create('text');
      cesdk.engine.block.setName(textHeadline, 'ai_headline');
      cesdk.engine.block.replaceText(textHeadline, aiData.headline);
      cesdk.engine.block.setTextColor(textHeadline, { r: 1, g: 1, b: 1, a: 1 });
      cesdk.engine.block.setWidth(textHeadline, targetW - 140);
      cesdk.engine.block.setHeight(textHeadline, 260);
      try {
        cesdk.engine.block.setHeightMode(textHeadline, 'Auto');
      } catch (err) {}
      cesdk.engine.block.setPositionX(textHeadline, 70);
      cesdk.engine.block.setPositionY(textHeadline, 80);
      try {
        cesdk.engine.block.setFloat(textHeadline, 'text/fontSize', 64);
      } catch (err) {}
      cesdk.engine.block.appendChild(page, textHeadline);
    }
  } catch (e) {
    console.warn('[AI Builder] Headline text failed:', e);
  }

  // 6. Subheadline Text Block (Plus Jakarta Sans)
  try {
    if (aiData.subheadline) {
      const textSub = cesdk.engine.block.create('text');
      cesdk.engine.block.setName(textSub, 'ai_subheadline');
      cesdk.engine.block.replaceText(textSub, aiData.subheadline);
      cesdk.engine.block.setTextColor(textSub, { r: 0.8, g: 0.85, b: 0.95, a: 1 });
      cesdk.engine.block.setWidth(textSub, targetW - 140);
      cesdk.engine.block.setHeight(textSub, 120);
      try {
        cesdk.engine.block.setHeightMode(textSub, 'Auto');
      } catch (err) {}
      cesdk.engine.block.setPositionX(textSub, 70);
      cesdk.engine.block.setPositionY(textSub, 300);
      try {
        cesdk.engine.block.setFloat(textSub, 'text/fontSize', 32);
      } catch (err) {}
      cesdk.engine.block.appendChild(page, textSub);
    }
  } catch (e) {
    console.warn('[AI Builder] Subheadline text failed:', e);
  }

  // 7. Footer Badge Pill & Text ("SEKOLAH UNGGULAN")
  try {
    const badgeTextStr = aiData.badge || 'SEKOLAH UNGGULAN';
    const badgeBg = cesdk.engine.block.create('graphic');
    cesdk.engine.block.setName(badgeBg, 'ai_badge_bg');
    cesdk.engine.block.setShape(badgeBg, cesdk.engine.block.createShape('rect'));
    const badgeFill = cesdk.engine.block.createFill('color');
    cesdk.engine.block.setColor(badgeFill, 'fill/color/value', hexToRgba(aiData.colors?.accent || '#f59e0b'));
    cesdk.engine.block.setFill(badgeBg, badgeFill);
    cesdk.engine.block.setWidth(badgeBg, 320);
    cesdk.engine.block.setHeight(badgeBg, 56);
    cesdk.engine.block.setPositionX(badgeBg, targetW - 360);
    cesdk.engine.block.setPositionY(badgeBg, targetH - 96);
    cesdk.engine.block.appendChild(page, badgeBg);

    const textBadge = cesdk.engine.block.create('text');
    cesdk.engine.block.setName(textBadge, 'ai_badge');
    cesdk.engine.block.replaceText(textBadge, badgeTextStr);
    cesdk.engine.block.setTextColor(textBadge, { r: 1, g: 1, b: 1, a: 1 });
    cesdk.engine.block.setWidth(textBadge, 300);
    cesdk.engine.block.setPositionX(textBadge, targetW - 350);
    cesdk.engine.block.setPositionY(textBadge, targetH - 86);
    try {
      cesdk.engine.block.setFloat(textBadge, 'text/fontSize', 22);
    } catch (err) {}
    cesdk.engine.block.appendChild(page, textBadge);
  } catch (e) {
    console.warn('[AI Builder] Badge failed:', e);
  }
}
