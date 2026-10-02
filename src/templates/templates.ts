/**
 * Wargative Templates - Canva Style Template Explorer Logic
 * Loads verified CE.SDK templates (E-Commerce, Event, Personal, Professional, Socials)
 */

import { WARGATIVE_TEMPLATES, WargativeTemplate } from '../common/wargativeTemplates';
import { saveProjectMeta, ProjectItem } from '../common/projectStore';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const templateSearchInput = document.getElementById('templateSearchInput') as HTMLInputElement;
  const galleriesContainer = document.getElementById('galleriesContainer') as HTMLElement;
  const filterPills = document.querySelectorAll('.filter-pill');
  const exploreCards = document.querySelectorAll('.explore-pill-card');
  const toastContainer = document.getElementById('toastContainer') as HTMLElement;
  const btnProTrial = document.getElementById('btnProTrial');
  const userAvatar = document.querySelector('.user-avatar');
  const helpBtn = document.querySelector('.help-btn');

  // State
  let currentGroupFilter: string = 'all';
  let searchQuery: string = '';

  // Toast System
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

  // Open Template in Wargative Studio
  function openTemplateInStudio(tmpl: WargativeTemplate) {
    const newId = 'proj_' + Date.now();
    const newProject: ProjectItem = {
      id: newId,
      title: tmpl.label,
      format: `${tmpl.group.toUpperCase()} Template`,
      width: 1080,
      height: 1080,
      updatedAt: Date.now(),
      thumbnailColor: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
      thumbnailIcon: '🎨',
      badgeText: tmpl.group,
      badgeBg: '#7047eb',
      badgeIconType: 'camera'
    };

    saveProjectMeta(newProject);
    showToast(`Loading "${tmpl.label}" in Wargative Studio...`);

    setTimeout(() => {
      window.location.href = `./index.html?id=${newId}&templateUri=${encodeURIComponent(
        tmpl.uri
      )}&name=${encodeURIComponent(tmpl.label)}`;
    }, 200);
  }

  // Create Card Element
  function createTemplateCard(tmpl: WargativeTemplate): HTMLElement {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.title = `Customize ${tmpl.label}`;

    card.innerHTML = `
      <div class="template-thumbnail-box">
        <img
          class="template-thumbnail-img"
          src="${tmpl.thumbUri}"
          alt="${tmpl.label}"
          loading="lazy"
          onerror="this.style.display='none'; this.parentElement.style.background='linear-gradient(135deg, #7c3aed, #6366f1)';"
        />
        <div class="template-crown-badge" title="Wargative Pro Template">👑</div>
        <button class="template-overlay-btn">Customize this template</button>
      </div>
      <div class="template-info-box">
        <span class="template-title">${tmpl.label}</span>
        <div class="template-meta-row">
          <span class="template-group-badge">${tmpl.group}</span>
          <span>Wargative Studio</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      openTemplateInStudio(tmpl);
    });

    return card;
  }

  // Render Template Galleries
  function renderGalleries() {
    if (!galleriesContainer) return;
    galleriesContainer.innerHTML = '';

    const query = searchQuery.toLowerCase().trim();

    // 1. If searching, show search results
    if (query) {
      const matched = WARGATIVE_TEMPLATES.filter(
        (t) =>
          t.label.toLowerCase().includes(query) ||
          t.group.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );

      const section = document.createElement('section');
      section.className = 'template-category-section';

      section.innerHTML = `
        <div class="section-heading-row">
          <h2 class="section-title">Search results for "${searchQuery}" (${matched.length} templates)</h2>
          ${matched.length > 0 ? `<span style="font-size:13px; color:#64748b;">Showing verified Wargative templates</span>` : ''}
        </div>
        <div class="templates-gallery-grid" id="searchResultsGrid"></div>
      `;

      galleriesContainer.appendChild(section);
      const grid = section.querySelector('#searchResultsGrid') as HTMLElement;

      if (matched.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #64748b;">
            <p style="font-size: 16px; font-weight: 600;">No templates found matching "${searchQuery}"</p>
            <p style="font-size: 13px; margin-top: 6px;">Try searching for e-commerce, sale, event, yoga, fashion, or modern.</p>
          </div>
        `;
      } else {
        matched.forEach((tmpl) => {
          grid.appendChild(createTemplateCard(tmpl));
        });
      }
      return;
    }

    // 2. If a specific category filter is active (not 'all')
    if (currentGroupFilter !== 'all') {
      let filteredGroup = currentGroupFilter;
      // Map general tags like 'social' -> 'socials', 'business' -> 'professional'
      if (filteredGroup === 'social' || filteredGroup === 'social-media') filteredGroup = 'socials';
      if (filteredGroup === 'business') filteredGroup = 'professional';

      const matched = WARGATIVE_TEMPLATES.filter((t) => t.group === filteredGroup);

      const section = document.createElement('section');
      section.className = 'template-category-section';

      const groupNames: Record<string, string> = {
        'e-commerce': 'E-Commerce Templates',
        event: 'Event & Celebration Templates',
        personal: 'Personal & Lifestyle Templates',
        professional: 'Professional & Business Templates',
        socials: 'Social Media & Stories Templates'
      };

      section.innerHTML = `
        <div class="section-heading-row">
          <h2 class="section-title">${groupNames[filteredGroup] || filteredGroup} (${matched.length})</h2>
          <a href="javascript:void(0)" class="see-all-count-link" id="btnResetFilter">Show all categories &rarr;</a>
        </div>
        <div class="templates-gallery-grid"></div>
      `;

      const grid = section.querySelector('.templates-gallery-grid') as HTMLElement;
      matched.forEach((tmpl) => {
        grid.appendChild(createTemplateCard(tmpl));
      });

      section.querySelector('#btnResetFilter')?.addEventListener('click', () => {
        setGroupFilter('all');
      });

      galleriesContainer.appendChild(section);
      return;
    }

    // 3. Default View: Categorized Galleries from Screenshot 2
    const categories: Array<{
      id: 'e-commerce' | 'event' | 'personal' | 'professional' | 'socials';
      title: string;
      limit: number;
    }> = [
      { id: 'e-commerce', title: 'E-Commerce', limit: 8 },
      { id: 'event', title: 'Event', limit: 8 },
      { id: 'personal', title: 'Personal', limit: 8 },
      { id: 'professional', title: 'Professional', limit: 8 },
      { id: 'socials', title: 'Socials', limit: 8 }
    ];

    categories.forEach((cat) => {
      const allCategoryTemplates = WARGATIVE_TEMPLATES.filter((t) => t.group === cat.id);
      const displayTemplates = allCategoryTemplates.slice(0, cat.limit);

      const section = document.createElement('section');
      section.className = 'template-category-section';

      section.innerHTML = `
        <div class="section-heading-row">
          <h2 class="section-title">${cat.title}</h2>
          <a href="javascript:void(0)" class="see-all-count-link" data-see-all="${cat.id}">
            See all (${allCategoryTemplates.length}) &rarr;
          </a>
        </div>
        <div class="templates-gallery-grid"></div>
      `;

      const grid = section.querySelector('.templates-gallery-grid') as HTMLElement;
      displayTemplates.forEach((tmpl) => {
        grid.appendChild(createTemplateCard(tmpl));
      });

      // Hook "See all (N)" to filter
      const seeAllBtn = section.querySelector(`[data-see-all="${cat.id}"]`);
      seeAllBtn?.addEventListener('click', () => {
        setGroupFilter(cat.id);
      });

      galleriesContainer.appendChild(section);
    });
  }

  function setGroupFilter(group: string) {
    currentGroupFilter = group;
    filterPills.forEach((pill) => {
      if (pill.getAttribute('data-group') === group) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
    renderGalleries();
    // Scroll smoothly to galleries
    galleriesContainer?.scrollIntoView({ behavior: 'smooth' });
  }

  // Filter Pill clicks
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const group = pill.getAttribute('data-group') || 'all';
      setGroupFilter(group);
    });
  });

  // Search Input listener
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  templateSearchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGalleries, 250);
  });

  // Explore cards clicks
  exploreCards.forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const topic = card.getAttribute('data-topic') || '';
      if (topic) {
        templateSearchInput.value = topic;
        searchQuery = topic;
        renderGalleries();
      }
    });
  });

  // Pro button & Avatar actions
  btnProTrial?.addEventListener('click', () => {
    showToast('👑 Wargative Pro is 100% Unlocked! Unlimited templates and exports.');
  });

  userAvatar?.addEventListener('click', () => {
    showToast('Signed in as Bayu Pamungkas (Wargative Studio)');
  });

  helpBtn?.addEventListener('click', () => {
    showToast('Search any template or click a category to customize in Wargative Studio.');
  });

  // Initial render
  renderGalleries();
});
