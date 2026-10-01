/**
 * Wargative Home Dashboard - Canva Style Frontend Logic
 * Connects all presets, custom dimensions, and actions directly to Wargative Editor
 */

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
  const modalActionTriggers = document.querySelectorAll('[data-action="open-modal"]');
  const navTemplatesBtn = document.getElementById('navTemplatesBtn');

  // Open Modal function
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

  // Close Modal function
  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('open');
  }

  // Switch Tab function
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

  // Event Listeners for Modal
  btnOpenModal?.addEventListener('click', () => openModal('foryou'));
  btnCloseModal?.addEventListener('click', closeModal);
  navTemplatesBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal('foryou');
  });

  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop?.classList.contains('open')) {
      closeModal();
    }
  });

  // Tab button clicks
  modalTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // Category Row Quick Actions that trigger modal
  modalActionTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const tab = trigger.getAttribute('data-tab') || 'foryou';
      openModal(tab);
    });
  });

  // Custom Size Creation -> Navigates to Wargative Editor
  function handleCustomCreate() {
    let width = parseFloat(customWidthInput?.value || '1080');
    let height = parseFloat(customHeightInput?.value || '1080');
    const unit = customUnitsSelect?.value || 'px';

    if (isNaN(width) || width <= 0) width = 1080;
    if (isNaN(height) || height <= 0) height = 1080;

    // Convert units to pixels for standard web canvas DPI
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

    // Navigate to Wargative Editor with parameters
    window.location.href = `./index.html?w=${width}&h=${height}&name=Custom%20Design%20(${width}x${height})`;
  }

  btnCreateCustom?.addEventListener('click', handleCustomCreate);

  // Allow pressing Enter in custom size inputs
  [customWidthInput, customHeightInput].forEach((input) => {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleCustomCreate();
      }
    });
  });

  // Main Page Search filter for cards
  searchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
    const cards = document.querySelectorAll('.design-card');

    cards.forEach((card) => {
      const title = card.querySelector('.card-title')?.textContent?.toLowerCase() || '';
      const meta = card.querySelector('.card-meta')?.textContent?.toLowerCase() || '';
      if (title.includes(query) || meta.includes(query)) {
        (card as HTMLElement).style.display = 'flex';
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
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

  // Toggle pill buttons (Home / Templates)
  const tabHomeToggle = document.getElementById('tabHomeToggle');
  const tabTemplatesToggle = document.getElementById('tabTemplatesToggle');

  tabHomeToggle?.addEventListener('click', () => {
    tabHomeToggle.classList.add('active');
    tabTemplatesToggle?.classList.remove('active');
  });

  tabTemplatesToggle?.addEventListener('click', () => {
    tabTemplatesToggle.classList.add('active');
    tabHomeToggle?.classList.remove('active');
    openModal('foryou');
  });
});
