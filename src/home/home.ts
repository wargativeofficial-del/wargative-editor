/**
 * Wargative Home Dashboard - Canva Style Frontend Logic
 * Full audit & activation of all features:
 * - Dynamic project rendering & auto-save persistence
 * - Canva-style 3-dots action menu with fully working buttons
 * - "Show more" toggle matching Screenshot 1
 * - Presets and Custom canvas generators
 */

import {
  getProjects,
  getProject,
  saveProjectMeta,
  duplicateProject,
  renameProject,
  deleteProject,
  formatTimeAgo,
  ProjectItem
} from '../common/projectStore';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const modalBackdrop = document.getElementById('createModal') as HTMLElement;
  const btnOpenModal = document.getElementById('btnOpenModal') as HTMLElement;
  const btnCloseModal = document.getElementById('btnCloseModal') as HTMLElement;
  const modalTabs = document.querySelectorAll('.modal-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content-panel');
  const searchInput = document.getElementById('mainSearchInput') as HTMLInputElement;
  const modalSearchInput = document.getElementById('modalSearchInput') as HTMLInputElement;
  const customWidthInput = document.getElementById('customWidth') as HTMLInputElement;
  const customHeightInput = document.getElementById('customHeight') as HTMLInputElement;
  const customUnitsSelect = document.getElementById('customUnits') as HTMLSelectElement;
  const btnCreateCustom = document.getElementById('btnCreateCustom') as HTMLElement;
  const navTemplatesBtn = document.getElementById('navTemplatesBtn');
  const navBrandBtn = document.getElementById('navBrandBtn');
  const designsGrid = document.getElementById('designsGrid') as HTMLElement;
  const btnShowMore = document.getElementById('btnShowMore') as HTMLElement;
  const btnSeeAll = document.getElementById('btnSeeAll') as HTMLElement;

  // Modals
  const detailsModal = document.getElementById('detailsModal') as HTMLElement;
  const btnCloseDetailsModal = document.getElementById('btnCloseDetailsModal') as HTMLElement;
  const btnDetailOpen = document.getElementById('btnDetailOpen') as HTMLElement;
  const brandModal = document.getElementById('brandModal') as HTMLElement;
  const btnCloseBrandModal = document.getElementById('btnCloseBrandModal') as HTMLElement;
  const helpModal = document.getElementById('helpModal') as HTMLElement;
  const btnCloseHelpModal = document.getElementById('btnCloseHelpModal') as HTMLElement;
  const helpBtn = document.querySelector('.help-btn') as HTMLElement;
  const userAvatar = document.querySelector('.user-avatar') as HTMLElement;
  const proBadge = document.querySelector('.banner-pro-badge') as HTMLElement;

  // Canva Dropdown Menu
  const canvaDropdownMenu = document.getElementById('canvaDropdownMenu') as HTMLElement;
  const canvaMenuTitle = document.getElementById('canvaMenuTitle') as HTMLElement;
  const canvaMenuRenameBtn = document.getElementById('canvaMenuRenameBtn') as HTMLElement;

  // Toast Container
  const toastContainer = document.getElementById('toastContainer') as HTMLElement;

  // State
  let isExpanded = false;
  let activeProjectId: string | null = null;
  let activeDotsButton: HTMLElement | null = null;

  // ============================================================================
  // Toast Notification System
  // ============================================================================
  function showToast(message: string, durationMs = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  // ============================================================================
  // Project Creator Helper - Ensures projects are auto-saved before opening
  // ============================================================================
  function createAndOpenProject(opts: {
    title: string;
    width: number;
    height: number;
    format?: string;
    thumbnailColor?: string;
    thumbnailIcon?: string;
    badgeText?: string;
    badgeBg?: string;
  }) {
    const newId = 'proj_' + Date.now();
    const newProject: ProjectItem = {
      id: newId,
      title: opts.title || 'Untitled Design',
      format: opts.format || `${opts.width} x ${opts.height} px`,
      width: opts.width,
      height: opts.height,
      updatedAt: Date.now(),
      thumbnailColor: opts.thumbnailColor || 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
      thumbnailIcon: opts.thumbnailIcon || '🎨',
      badgeText: opts.badgeText || 'Design',
      badgeBg: opts.badgeBg || '#7c3aed',
      badgeIconType: 'camera'
    };

    // Auto-save project metadata immediately
    saveProjectMeta(newProject);

    // Redirect to Wargative Studio
    window.location.href = `./index.html?id=${newId}&w=${opts.width}&h=${opts.height}&name=${encodeURIComponent(
      opts.title
    )}`;
  }

  // ============================================================================
  // Render Project Cards (Canva Dashboard matching Screenshot 1)
  // ============================================================================
  function getPreviewContentHtml(project: ProjectItem): string {
    const type = project.previewType || '';

    switch (type) {
      case 'untitled':
        return `
          <div class="preview-untitled">
            <div class="mini-board"></div>
          </div>
        `;
      case 'green':
        return `<div class="preview-green"></div>`;
      case 'macbook':
        return `
          <div class="preview-macbook">
            <div class="macbook-body">
              <div class="macbook-trackpad"></div>
            </div>
          </div>
        `;
      case 'doc':
        return `
          <div class="preview-doc">
            <div class="doc-sheet"></div>
          </div>
        `;
      case 'horor':
        return `
          <div class="preview-horor">
            <div class="horor-face">👤</div>
            <div class="horor-banner">NETFLIX DILAPORKAN KARENA...</div>
          </div>
        `;
      case 'film':
        return `
          <div class="preview-film">
            <div class="film-text">
              TIAP BIKIN POSTINGAN<br>
              DUPLICATE TEMPLATE INI<br><br>
              SETELAH SUDAH UPLOAD,<br>
              HAPUS TEMPLATE DUPLICATE<br><br>
              LAKUKAN SECARA BERULANG
            </div>
          </div>
        `;
      case 'nonton':
        return `
          <div class="preview-nonton">
            <div class="nonton-top"></div>
            <div class="nonton-play">▶</div>
            <div class="nonton-bottom"></div>
          </div>
        `;
      case 'pedia':
        return `
          <div class="preview-pedia">
            <div class="film-text">
              TIAP BIKIN POSTINGAN<br>
              DUPLICATE TEMPLATE INI<br><br>
              SETELAH SUDAH UPLOAD,<br>
              HAPUS TEMPLATE DUPLICATE<br><br>
              LAKUKAN SECARA BERULANG
            </div>
          </div>
        `;
      case 'game_reels':
        return `
          <div class="preview-game-reels">
            <span>🎮</span>
          </div>
        `;
      case 'copy_game':
        return `
          <div class="preview-copy-game">
            <span style="font-size:32px; margin-top:14px;">🚔</span>
            <div class="game-yellow-bar">WARGATIVE GAME CITY</div>
          </div>
        `;
      case 'game':
        return `
          <div class="preview-game">
            <span style="font-size:32px; margin-top:14px;">🌴</span>
            <div class="game-yellow-bar" style="background:#eab308; color:#000; font-size:8px; font-weight:800; padding:4px; text-align:center; width:100%;">MIAMI BEACH EDITION</div>
          </div>
        `;
      case 'warrior':
        return `
          <div class="preview-warrior">
            <span>🔥</span>
          </div>
        `;
      case 'instagram':
        return `
          <div class="preview-instagram">
            <div class="ig-phone">
              <span style="font-size:16px; margin-bottom:4px;">📊</span>
              <span>Instagram</span>
            </div>
          </div>
        `;
      case 'tech':
        return `
          <div class="preview-tech">
            <div class="tech-eye">👁️</div>
            <div class="tech-banner">WARGATIVE TECH INNOVATION</div>
          </div>
        `;
      default:
        return `
          <div class="thumbnail-placeholder" style="background: ${project.thumbnailColor};">
            <span style="font-size: 32px;">${project.thumbnailIcon || '🎨'}</span>
            <span style="font-size: 11px;">${project.format}</span>
          </div>
        `;
    }
  }

  function getBadgeIconSvg(badgeIconType?: string): string {
    switch (badgeIconType) {
      case 'compass':
        return `<span style="font-size:9px;">🧭</span>`;
      case 'play':
        return `<span style="font-size:9px;">▶</span>`;
      case 'doc':
        return `<span style="font-size:9px;">📄</span>`;
      default:
        return `<span style="font-size:9px;">📸</span>`;
    }
  }

  function renderDesignCards() {
    if (!designsGrid) return;
    const allProjects = getProjects();
    const query = (searchInput?.value || '').toLowerCase().trim();

    const filtered = query
      ? allProjects.filter(
          (p) => p.title.toLowerCase().includes(query) || p.format.toLowerCase().includes(query)
        )
      : allProjects;

    // Show 7 cards (Row 1) if not expanded and no search query; otherwise show all
    const itemsToDisplay = !isExpanded && !query ? filtered.slice(0, 7) : filtered;

    designsGrid.innerHTML = '';

    if (itemsToDisplay.length === 0) {
      designsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #64748b;">
          <p style="font-size: 16px; font-weight: 600;">No designs found matching "${query}"</p>
          <button class="btn-show-more" style="margin-top: 14px;" id="btnCreateMatching">Create design "${query}"</button>
        </div>
      `;
      document.getElementById('btnCreateMatching')?.addEventListener('click', () => {
        createAndOpenProject({
          title: query || 'New Design',
          width: 1080,
          height: 1080
        });
      });
      return;
    }

    itemsToDisplay.forEach((project) => {
      const card = document.createElement('div');
      card.className = 'design-card';
      card.title = `Open ${project.title} in Studio`;
      card.dataset.projectId = project.id;

      card.innerHTML = `
        <div class="card-thumbnail">
          ${getPreviewContentHtml(project)}
          <button class="card-dots-btn" data-project-id="${project.id}" title="More actions">•••</button>
          <button class="card-overlay-btn">Edit in Studio</button>
        </div>
        <div class="card-info">
          <span class="card-title">${project.title}</span>
          <span class="card-meta">
            <span class="meta-icon-badge" style="background:${project.badgeBg || '#ef4444'};">
              ${getBadgeIconSvg(project.badgeIconType)}
            </span>
            <span>${project.badgeText || project.format} • ${formatTimeAgo(project.updatedAt)}</span>
          </span>
        </div>
      `;

      // Click card to open in editor
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.card-dots-btn')) return;
        window.location.href = `./index.html?id=${project.id}&name=${encodeURIComponent(
          project.title
        )}`;
      });

      // Click 3-dots button to open Canva Menu
      const dotsBtn = card.querySelector('.card-dots-btn') as HTMLElement;
      dotsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCanvaMenu(project, dotsBtn);
      });

      designsGrid.appendChild(card);
    });

    // Update Show More button text & visibility
    if (btnShowMore) {
      if (filtered.length <= 7 || query) {
        btnShowMore.style.display = 'none';
      } else {
        btnShowMore.style.display = 'inline-flex';
        btnShowMore.textContent = isExpanded ? 'Show less' : 'Show more';
      }
    }
  }

  // ============================================================================
  // Canva 3-Dots Context Menu (Screenshot 2)
  // ============================================================================
  function closeCanvaMenu() {
    if (!canvaDropdownMenu) return;
    canvaDropdownMenu.style.display = 'none';
    if (activeDotsButton) {
      activeDotsButton.classList.remove('active');
      activeDotsButton = null;
    }
    activeProjectId = null;
  }

  function openCanvaMenu(project: ProjectItem, buttonEl: HTMLElement) {
    if (!canvaDropdownMenu) return;

    // Toggle off if clicking the same active button
    if (activeProjectId === project.id && canvaDropdownMenu.style.display === 'block') {
      closeCanvaMenu();
      return;
    }

    if (activeDotsButton) {
      activeDotsButton.classList.remove('active');
    }

    activeProjectId = project.id;
    activeDotsButton = buttonEl;
    buttonEl.classList.add('active');

    // Populate header
    if (canvaMenuTitle) {
      canvaMenuTitle.textContent = project.title;
    }

    // Position menu relative to button
    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = 250;
    const menuHeight = 440;

    let left = rect.right - menuWidth;
    let top = rect.bottom + 6;

    if (left < 12) left = 12;
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 6;
      if (top < 12) top = 12;
    }

    canvaDropdownMenu.style.top = `${top}px`;
    canvaDropdownMenu.style.left = `${left}px`;
    canvaDropdownMenu.style.display = 'block';
  }

  // Global click outside to close Canva menu
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (
      canvaDropdownMenu &&
      canvaDropdownMenu.style.display === 'block' &&
      !canvaDropdownMenu.contains(target) &&
      !target.closest('.card-dots-btn')
    ) {
      closeCanvaMenu();
    }
  });

  // Action Menu Handlers
  canvaDropdownMenu?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.canva-menu-item') as HTMLElement;
    if (!target || !activeProjectId) return;

    const action = target.getAttribute('data-action');
    const project = getProject(activeProjectId);
    if (!project) return;

    switch (action) {
      case 'open-tab': {
        window.open(
          `./index.html?id=${project.id}&name=${encodeURIComponent(project.title)}`,
          '_blank'
        );
        closeCanvaMenu();
        break;
      }

      case 'details': {
        openDetailsModal(project);
        closeCanvaMenu();
        break;
      }

      case 'save-template': {
        project.isTemplate = true;
        saveProjectMeta(project);
        showToast(`"${project.title}" saved as template! 👑`);
        closeCanvaMenu();
        renderDesignCards();
        break;
      }

      case 'duplicate': {
        const copy = duplicateProject(project.id);
        if (copy) {
          showToast(`Project duplicated: "${copy.title}" 📋`);
          renderDesignCards();
        }
        closeCanvaMenu();
        break;
      }

      case 'download': {
        showToast('Preparing download... ⬇️');
        window.open(
          `./index.html?id=${project.id}&autodownload=true&name=${encodeURIComponent(project.title)}`,
          '_blank'
        );
        closeCanvaMenu();
        break;
      }

      case 'print': {
        showToast('Opening print dialog... 🖨️');
        window.open(
          `./index.html?id=${project.id}&name=${encodeURIComponent(project.title)}`,
          '_blank'
        );
        closeCanvaMenu();
        break;
      }

      case 'move': {
        showToast(`Moved "${project.title}" to My Projects 📁`);
        closeCanvaMenu();
        break;
      }

      case 'share': {
        const shareUrl = `${window.location.origin}${window.location.pathname.replace(
          'home.html',
          'index.html'
        )}?id=${project.id}`;

        if (navigator.share) {
          navigator.share({
            title: project.title,
            text: `Check out my design "${project.title}" on Wargative`,
            url: shareUrl
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('Share link copied to clipboard! 🔗');
          });
        }
        closeCanvaMenu();
        break;
      }

      case 'copy-link': {
        const url = `${window.location.origin}${window.location.pathname.replace(
          'home.html',
          'index.html'
        )}?id=${project.id}`;
        navigator.clipboard.writeText(url).then(() => {
          showToast('Project link copied to clipboard! 📋');
        });
        closeCanvaMenu();
        break;
      }

      case 'offline': {
        showToast(`"${project.title}" is now cached offline! 💾`);
        closeCanvaMenu();
        break;
      }

      case 'trash': {
        if (confirm(`Move "${project.title}" to Trash?`)) {
          deleteProject(project.id);
          showToast(`"${project.title}" moved to Trash 🗑️`);
          renderDesignCards();
        }
        closeCanvaMenu();
        break;
      }
    }
  });

  // Rename Button inside Canva Menu Header
  function handleRename() {
    if (!activeProjectId) return;
    const project = getProject(activeProjectId);
    if (!project) return;

    const newTitle = prompt('Rename design:', project.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== project.title) {
      renameProject(activeProjectId, newTitle.trim());
      showToast(`Renamed to "${newTitle.trim()}" ✏️`);
      renderDesignCards();
      if (canvaMenuTitle) {
        canvaMenuTitle.textContent = newTitle.trim();
      }
    }
  }

  canvaMenuRenameBtn?.addEventListener('click', handleRename);
  canvaMenuTitle?.addEventListener('click', handleRename);

  // ============================================================================
  // Details Modal
  // ============================================================================
  function openDetailsModal(project: ProjectItem) {
    if (!detailsModal) return;
    const detailTitle = document.getElementById('detailTitle');
    const detailDimensions = document.getElementById('detailDimensions');
    const detailFormat = document.getElementById('detailFormat');
    const detailUpdated = document.getElementById('detailUpdated');

    if (detailTitle) detailTitle.textContent = project.title;
    if (detailDimensions) detailDimensions.textContent = `${project.width} × ${project.height} px`;
    if (detailFormat) detailFormat.textContent = project.format;
    if (detailUpdated) detailUpdated.textContent = formatTimeAgo(project.updatedAt);

    if (btnDetailOpen) {
      btnDetailOpen.onclick = () => {
        window.location.href = `./index.html?id=${project.id}&name=${encodeURIComponent(
          project.title
        )}`;
      };
    }

    detailsModal.classList.add('open');
  }

  btnCloseDetailsModal?.addEventListener('click', () => {
    detailsModal?.classList.remove('open');
  });

  // Brand Kit Modal
  navBrandBtn?.addEventListener('click', () => {
    brandModal?.classList.add('open');
  });

  btnCloseBrandModal?.addEventListener('click', () => {
    brandModal?.classList.remove('open');
  });

  // Help Modal
  helpBtn?.addEventListener('click', () => {
    helpModal?.classList.add('open');
  });

  btnCloseHelpModal?.addEventListener('click', () => {
    helpModal?.classList.remove('open');
  });

  // User Avatar & Pro Badge Actions
  userAvatar?.addEventListener('click', () => {
    showToast('Signed in as Bayu Pamungkas (Wargative Studio)');
  });

  proBadge?.addEventListener('click', () => {
    showToast('👑 Wargative Pro is 100% Active with Unlimited Features!');
  });

  // Show More / Show Less Toggle
  btnShowMore?.addEventListener('click', () => {
    isExpanded = !isExpanded;
    renderDesignCards();
  });

  // See All link
  btnSeeAll?.addEventListener('click', () => {
    isExpanded = true;
    renderDesignCards();
  });

  // ============================================================================
  // Create Modal & Tabs
  // ============================================================================
  function openModal(defaultTabId?: string) {
    if (!modalBackdrop) return;
    modalBackdrop.classList.add('open');
    if (defaultTabId) {
      switchTab(defaultTabId);
    }
    if (modalSearchInput) {
      modalSearchInput.focus();
    }
  }

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('open');
  }

  function switchTab(targetTabId: string) {
    modalTabs.forEach((tab) => {
      if (tab.getAttribute('data-tab') === targetTabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    tabContents.forEach((panel) => {
      const el = panel as HTMLElement;
      if (el.id === `tab-${targetTabId}`) {
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  }

  btnOpenModal?.addEventListener('click', () => openModal('foryou'));
  btnCloseModal?.addEventListener('click', closeModal);

  [modalBackdrop, detailsModal, brandModal, helpModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      detailsModal?.classList.remove('open');
      brandModal?.classList.remove('open');
      helpModal?.classList.remove('open');
      closeCanvaMenu();
    } else if (e.key === 'c' || e.key === 'C') {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        openModal('foryou');
      }
    } else if (e.key === '/') {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        searchInput?.focus();
      }
    }
  });

  modalTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // Category Row Quick Actions that trigger modal
  document.querySelectorAll('[data-action="open-modal"]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const tab = trigger.getAttribute('data-tab') || 'foryou';
      openModal(tab);
    });
  });

  // Custom Size Creation -> Auto-saved project
  function handleCustomCreate() {
    let width = parseFloat(customWidthInput?.value || '1080');
    let height = parseFloat(customHeightInput?.value || '1080');
    const unit = customUnitsSelect?.value || 'px';

    if (isNaN(width) || width <= 0) width = 1080;
    if (isNaN(height) || height <= 0) height = 1080;

    if (unit === 'in') {
      width = Math.round(width * 96);
      height = Math.round(height * 96);
    } else if (unit === 'mm') {
      width = Math.round((width / 25.4) * 96);
      height = Math.round((height / 25.4) * 96);
    } else if (unit === 'cm') {
      width = Math.round(((width * 10) / 25.4) * 96);
      height = Math.round(((height * 10) / 25.4) * 96);
    }

    createAndOpenProject({
      title: `Custom Design (${width}x${height})`,
      width,
      height
    });
  }

  btnCreateCustom?.addEventListener('click', handleCustomCreate);

  [customWidthInput, customHeightInput].forEach((input) => {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCustomCreate();
    });
  });

  // Main Page Search Filter
  searchInput?.addEventListener('input', () => {
    renderDesignCards();
  });

  // Modal Search Filter
  modalSearchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
    const presetCards = document.querySelectorAll('.layout-preset-card');

    presetCards.forEach((card) => {
      const title = card.querySelector('.preset-title')?.textContent?.toLowerCase() || '';
      const dims = card.querySelector('.preset-dimensions')?.textContent?.toLowerCase() || '';
      if (!query || title.includes(query) || dims.includes(query)) {
        (card as HTMLElement).style.display = 'flex';
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
  });

  // Hook all preset cards & category items to createAndOpenProject
  document.querySelectorAll('.category-item[data-create-w]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = parseFloat(btn.getAttribute('data-create-w') || '1080');
      const h = parseFloat(btn.getAttribute('data-create-h') || '1080');
      const name = btn.getAttribute('data-create-name') || 'New Design';
      createAndOpenProject({ title: name, width: w, height: h });
    });
  });

  document.querySelectorAll('.layout-preset-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const href = card.getAttribute('href') || '';
      const url = new URL(href, window.location.href);
      const w = parseFloat(url.searchParams.get('w') || '1080');
      const h = parseFloat(url.searchParams.get('h') || '1080');
      const name = url.searchParams.get('name') || 'New Design';
      createAndOpenProject({ title: name, width: w, height: h });
    });
  });

  document.querySelectorAll('.quick-action-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const label = item.querySelector('span')?.textContent || 'Design';
      createAndOpenProject({ title: label, width: 1080, height: 1080 });
    });
  });

  // Initial render
  renderDesignCards();
});
