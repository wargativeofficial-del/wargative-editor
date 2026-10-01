/**
 * Wargative Home Dashboard - Canva Style Frontend Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const modalBackdrop = document.getElementById('createModal') as HTMLElement;
  const btnOpenModal = document.getElementById('btnOpenModal') as HTMLElement;
  const btnCloseModal = document.getElementById('btnCloseModal') as HTMLElement;
  const modalTabs = document.querySelectorAll('.modal-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content-panel');
  const searchInput = document.getElementById('mainSearchInput') as HTMLInputElement;
  const customWidthInput = document.getElementById('customWidth') as HTMLInputElement;
  const customHeightInput = document.getElementById('customHeight') as HTMLInputElement;
  const btnCreateCustom = document.getElementById('btnCreateCustom') as HTMLElement;
  const quickCategories = document.querySelectorAll('[data-category]');

  // Open Modal function
  function openModal(defaultTabId?: string) {
    if (!modalBackdrop) return;
    modalBackdrop.classList.add('open');
    if (defaultTabId) {
      switchTab(defaultTabId);
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

  // Category Row Quick Actions
  quickCategories.forEach((cat) => {
    cat.addEventListener('click', () => {
      const categoryType = cat.getAttribute('data-category');
      if (categoryType === 'custom') {
        openModal('custom');
      } else if (categoryType === 'upload') {
        openModal('upload');
      } else if (categoryType === 'presentation') {
        openModal('presentations');
      } else if (categoryType === 'social') {
        openModal('social');
      } else {
        openModal('foryou');
      }
    });
  });

  // Custom Size Creation -> Navigates to Wargative Editor
  btnCreateCustom?.addEventListener('click', () => {
    const width = customWidthInput?.value || '1080';
    const height = customHeightInput?.value || '1080';
    // Navigate to editor with parameters
    window.location.href = `/index.html?w=${width}&h=${height}`;
  });

  // Search filter for cards
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

  // Toggle pill buttons (Home / Templates)
  const togglePills = document.querySelectorAll('.toggle-pill-btn');
  togglePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      togglePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });
});
