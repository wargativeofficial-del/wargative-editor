/**
 * Wargative Content Planner - Main TypeScript Controller
 * Recreates the exact Canva Content Planner experience (canva.com/planner)
 */

import {
  getScheduledPosts,
  saveScheduledPost,
  deleteScheduledPost,
  getHolidays,
  ScheduledPost,
  CalendarHoliday
} from '../common/plannerStore';
import { getProjects, ProjectItem } from '../common/projectStore';
import { WARGATIVE_TEMPLATES, WargativeTemplate } from '../common/wargativeTemplates';

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAY_NAMES_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Social Channels matching Canva Screenshot 5
const SOCIAL_CHANNELS = [
  { id: 'instagram', name: 'Instagram Business', icon: '📸', color: '#e1306c' },
  { id: 'facebook', name: 'Halaman Facebook', icon: '📘', color: '#1877f2' },
  { id: 'twitter', name: 'X (Twitter)', icon: '𝕏', color: '#000000' },
  { id: 'pinterest', name: 'Pinterest', icon: '📌', color: '#e60023' },
  { id: 'linkedin_profile', name: 'Profil LinkedIn', icon: '💼', color: '#0a66c2' },
  { id: 'linkedin_page', name: 'Halaman LinkedIn', icon: '🏢', color: '#0077b5' }
];

// Curated Social Media Templates matching Canva Screenshot 2
const CURATED_PLANNER_TEMPLATES = [
  {
    id: 'tmpl_say_no',
    title: 'SAY TO DRUGS NO',
    category: 'Campaign',
    color: '#fee2e2',
    accent: '#ef4444',
    text: 'SAY TO DRUGS NO'
  },
  {
    id: 'tmpl_kebaikan',
    title: 'Kebaikan Hal Yang...',
    category: 'Quotes',
    color: '#fef3c7',
    accent: '#f59e0b',
    text: 'Kebaikan hal yang membawa hidup lebih damai...'
  },
  {
    id: 'tmpl_smart',
    title: 'Be As Smart As You Can',
    category: 'Education',
    color: '#f8fafc',
    accent: '#64748b',
    text: 'Be as smart as you can, but remember that...'
  },
  {
    id: 'tmpl_piknik',
    title: 'Hari Piknik Internasional',
    category: 'Event',
    color: '#ffedd5',
    accent: '#ea580c',
    text: 'HARI PIKNIK INTERNASIONAL'
  },
  {
    id: 'tmpl_usaha',
    title: 'Kepuasan Usaha',
    category: 'Quotes',
    color: '#e2e8f0',
    accent: '#334155',
    text: 'Kepuasan terletak pada usaha, bukan hasil.'
  },
  {
    id: 'tmpl_cinta',
    title: 'Cintailah Dengan Hatimu',
    category: 'Inspiration',
    color: '#fce7f3',
    accent: '#ec4899',
    text: 'CINTAILAH IA DENGAN HATIMU'
  },
  {
    id: 'tmpl_grand_opening',
    title: 'Hari Grand Opening',
    category: 'Business',
    color: '#fef9c3',
    accent: '#ca8a04',
    text: 'HARI GRAND OPENING'
  },
  {
    id: 'tmpl_mercusuar',
    title: 'Mercusuar Harapan',
    category: 'Poster',
    color: '#e0f2fe',
    accent: '#0284c7',
    text: 'MERCUSUAR'
  }
];

class WargativeContentPlanner {
  // Calendar Navigation State
  private viewDate: Date;
  private today: Date;

  // DOM Elements
  private monthDisplayEl!: HTMLElement;
  private btnToday!: HTMLButtonElement;
  private btnPrevMonth!: HTMLButtonElement;
  private btnNextMonth!: HTMLButtonElement;
  private btnAddScheduleHeader!: HTMLButtonElement;
  private calendarGridContainer!: HTMLElement;
  private learnBannerEl!: HTMLElement;
  private learnBannerToggle!: HTMLElement;
  private toastContainer!: HTMLElement;

  // Modal Elements
  private modalScheduleOverlay!: HTMLElement;
  private btnCloseModal!: HTMLButtonElement;
  private projectsScrollContainer!: HTMLElement;
  private templatesScrollContainer!: HTMLElement;

  // Modal Views (Right Column)
  private viewMainForm!: HTMLElement;
  private viewSchedulePicker!: HTMLElement;
  private viewChannelPicker!: HTMLElement;

  // Form Fields
  private summaryBoxThumb!: HTMLElement;
  private summaryBoxTitle!: HTMLElement;
  private summaryBoxMeta!: HTMLElement;
  private dateTimeTriggerBtn!: HTMLElement;
  private dateTimeDisplaySpan!: HTMLElement;
  private channelTriggerBtn!: HTMLElement;
  private channelDisplaySpan!: HTMLElement;
  private captionInput!: HTMLTextAreaElement;
  private btnSubmitSchedule!: HTMLButtonElement;
  private btnPublishNow!: HTMLButtonElement;

  // Mini Calendar Fields (View B)
  private miniCalMonthDisplay!: HTMLElement;
  private miniCalGrid!: HTMLElement;
  private miniCalPrevBtn!: HTMLButtonElement;
  private miniCalNextBtn!: HTMLButtonElement;
  private miniTimeInput!: HTMLInputElement;
  private btnDoneMiniCal!: HTMLButtonElement;
  private btnBackFromMiniCal!: HTMLElement;

  // Channel Picker Fields (View C)
  private channelListOptionsContainer!: HTMLElement;
  private btnBackFromChannels!: HTMLElement;

  // Post Detail Dialog
  private postDetailDialogOverlay!: HTMLElement;

  // Current Modal Form State
  private selectedProject: ProjectItem | null = null;
  private selectedCuratedTemplate: any = null;
  private formScheduledDate: Date = new Date();
  private formScheduledTime: string = '14:40';
  private formSelectedChannel = SOCIAL_CHANNELS[0];
  private miniCalViewDate: Date = new Date();

  constructor() {
    // Current date defaults to October 2026 as per user screenshot (or current time if future)
    this.today = new Date(2026, 9, 2); // 2 Oktober 2026
    this.viewDate = new Date(2026, 9, 1);
    this.miniCalViewDate = new Date(2026, 9, 1);

    this.initDOM();
    this.bindEvents();
    this.renderCalendar();
  }

  private initDOM() {
    this.monthDisplayEl = document.getElementById('monthDisplayEl') as HTMLElement;
    this.btnToday = document.getElementById('btnToday') as HTMLButtonElement;
    this.btnPrevMonth = document.getElementById('btnPrevMonth') as HTMLButtonElement;
    this.btnNextMonth = document.getElementById('btnNextMonth') as HTMLButtonElement;
    this.btnAddScheduleHeader = document.getElementById('btnAddScheduleHeader') as HTMLButtonElement;
    this.calendarGridContainer = document.getElementById('calendarGridContainer') as HTMLElement;
    this.learnBannerEl = document.getElementById('learnBannerEl') as HTMLElement;
    this.learnBannerToggle = document.getElementById('learnBannerToggle') as HTMLElement;
    this.toastContainer = document.getElementById('toastContainer') as HTMLElement;

    // Modal
    this.modalScheduleOverlay = document.getElementById('modalScheduleOverlay') as HTMLElement;
    this.btnCloseModal = document.getElementById('btnCloseModal') as HTMLButtonElement;
    this.projectsScrollContainer = document.getElementById('projectsScrollContainer') as HTMLElement;
    this.templatesScrollContainer = document.getElementById('templatesScrollContainer') as HTMLElement;

    // Modal Views
    this.viewMainForm = document.getElementById('viewMainForm') as HTMLElement;
    this.viewSchedulePicker = document.getElementById('viewSchedulePicker') as HTMLElement;
    this.viewChannelPicker = document.getElementById('viewChannelPicker') as HTMLElement;

    // Form Fields
    this.summaryBoxThumb = document.getElementById('summaryBoxThumb') as HTMLElement;
    this.summaryBoxTitle = document.getElementById('summaryBoxTitle') as HTMLElement;
    this.summaryBoxMeta = document.getElementById('summaryBoxMeta') as HTMLElement;
    this.dateTimeTriggerBtn = document.getElementById('dateTimeTriggerBtn') as HTMLElement;
    this.dateTimeDisplaySpan = document.getElementById('dateTimeDisplaySpan') as HTMLElement;
    this.channelTriggerBtn = document.getElementById('channelTriggerBtn') as HTMLElement;
    this.channelDisplaySpan = document.getElementById('channelDisplaySpan') as HTMLElement;
    this.captionInput = document.getElementById('captionInput') as HTMLTextAreaElement;
    this.btnSubmitSchedule = document.getElementById('btnSubmitSchedule') as HTMLButtonElement;
    this.btnPublishNow = document.getElementById('btnPublishNow') as HTMLButtonElement;

    // Mini Calendar Fields
    this.miniCalMonthDisplay = document.getElementById('miniCalMonthDisplay') as HTMLElement;
    this.miniCalGrid = document.getElementById('miniCalGrid') as HTMLElement;
    this.miniCalPrevBtn = document.getElementById('miniCalPrevBtn') as HTMLButtonElement;
    this.miniCalNextBtn = document.getElementById('miniCalNextBtn') as HTMLButtonElement;
    this.miniTimeInput = document.getElementById('miniTimeInput') as HTMLInputElement;
    this.btnDoneMiniCal = document.getElementById('btnDoneMiniCal') as HTMLButtonElement;
    this.btnBackFromMiniCal = document.getElementById('btnBackFromMiniCal') as HTMLElement;

    // Channel Picker Fields
    this.channelListOptionsContainer = document.getElementById('channelListOptionsContainer') as HTMLElement;
    this.btnBackFromChannels = document.getElementById('btnBackFromChannels') as HTMLElement;

    // Post Detail
    this.postDetailDialogOverlay = document.getElementById('postDetailDialogOverlay') as HTMLElement;
  }

  private bindEvents() {
    // Navigation
    this.btnToday?.addEventListener('click', () => {
      this.viewDate = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
      this.renderCalendar();
    });

    this.btnPrevMonth?.addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() - 1);
      this.renderCalendar();
    });

    this.btnNextMonth?.addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() + 1);
      this.renderCalendar();
    });

    // Add Schedule Button Header
    this.btnAddScheduleHeader?.addEventListener('click', () => {
      this.openScheduleModal(this.today);
    });

    // Learn Banner Collapse Toggle
    this.learnBannerToggle?.addEventListener('click', () => {
      this.learnBannerEl?.classList.toggle('collapsed');
    });

    // Card in banner to open schedule modal
    const bannerAddBtn = document.getElementById('bannerAddScheduleCard');
    bannerAddBtn?.addEventListener('click', () => {
      this.openScheduleModal(this.today);
    });

    const bannerPublishBtn = document.getElementById('bannerPublishCard');
    bannerPublishBtn?.addEventListener('click', () => {
      this.openScheduleModal(this.today);
    });

    const bannerConnectBtn = document.getElementById('bannerConnectCard');
    bannerConnectBtn?.addEventListener('click', () => {
      this.openScheduleModal(this.today);
      this.showViewChannelPicker();
    });

    // Modal Close
    this.btnCloseModal?.addEventListener('click', () => {
      this.closeScheduleModal();
    });

    this.modalScheduleOverlay?.addEventListener('click', (e) => {
      if (e.target === this.modalScheduleOverlay) {
        this.closeScheduleModal();
      }
    });

    // Switch to Mini Calendar (View B)
    this.dateTimeTriggerBtn?.addEventListener('click', () => {
      this.showViewSchedulePicker();
    });

    this.btnBackFromMiniCal?.addEventListener('click', () => {
      this.showViewMainForm();
    });

    this.btnDoneMiniCal?.addEventListener('click', () => {
      if (this.miniTimeInput?.value) {
        this.formScheduledTime = this.miniTimeInput.value;
      }
      this.updateDateTimeButtonText();
      this.showViewMainForm();
    });

    this.miniCalPrevBtn?.addEventListener('click', () => {
      this.miniCalViewDate.setMonth(this.miniCalViewDate.getMonth() - 1);
      this.renderMiniCalendar();
    });

    this.miniCalNextBtn?.addEventListener('click', () => {
      this.miniCalViewDate.setMonth(this.miniCalViewDate.getMonth() + 1);
      this.renderMiniCalendar();
    });

    // Switch to Channel Picker (View C)
    this.channelTriggerBtn?.addEventListener('click', () => {
      this.showViewChannelPicker();
    });

    this.btnBackFromChannels?.addEventListener('click', () => {
      this.showViewMainForm();
    });

    // Submit Schedule
    this.btnSubmitSchedule?.addEventListener('click', () => {
      this.submitSchedule(false);
    });

    this.btnPublishNow?.addEventListener('click', () => {
      this.submitSchedule(true);
    });

    // Post Detail Modal Close
    this.postDetailDialogOverlay?.addEventListener('click', (e) => {
      if (e.target === this.postDetailDialogOverlay) {
        this.postDetailDialogOverlay.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // Calendar Grid Rendering
  // ==========================================================================
  public renderCalendar() {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth(); // 0-indexed (9 = Okt)

    if (this.monthDisplayEl) {
      this.monthDisplayEl.textContent = `${MONTH_NAMES_ID[month]} ${year}`;
    }

    if (!this.calendarGridContainer) return;
    this.calendarGridContainer.innerHTML = '';

    // First day of month and total days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Monday first offset (0=Min, 1=Sen, ... 6=Sab -> Monday=0, Sunday=6)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    // Previous month total days
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Holidays and scheduled posts for current month
    const holidays = getHolidays(year, month + 1);
    const allPosts = getScheduledPosts();

    // 1. Previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, prevDayNum);
      const cell = this.createDayCell(prevDate, prevDayNum, true, holidays, allPosts);
      this.calendarGridContainer.appendChild(cell);
    }

    // 2. Current month active days
    for (let day = 1; day <= totalDays; day++) {
      const curDate = new Date(year, month, day);
      const isToday =
        curDate.getFullYear() === this.today.getFullYear() &&
        curDate.getMonth() === this.today.getMonth() &&
        curDate.getDate() === this.today.getDate();

      const cell = this.createDayCell(curDate, day, false, holidays, allPosts, isToday);
      this.calendarGridContainer.appendChild(cell);
    }

    // 3. Next month trailing days to complete 35 or 42 cells
    const totalRendered = startDayOfWeek + totalDays;
    const remainingCells = totalRendered <= 35 ? 35 - totalRendered : 42 - totalRendered;
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(year, month + 1, day);
      const cell = this.createDayCell(nextDate, day, true, holidays, allPosts);
      this.calendarGridContainer.appendChild(cell);
    }
  }

  private createDayCell(
    date: Date,
    dayNum: number,
    isOtherMonth: boolean,
    holidays: CalendarHoliday[],
    allPosts: ScheduledPost[],
    isToday: boolean = false
  ): HTMLElement {
    const cell = document.createElement('div');
    cell.className = `calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;

    // Format date string YYYY-MM-DD
    const y = date.getFullYear();
    const m = date.getMonth() + 1 < 10 ? `0${date.getMonth() + 1}` : `${date.getMonth() + 1}`;
    const d = date.getDate() < 10 ? `0${date.getDate()}` : `${date.getDate()}`;
    const dateStr = `${y}-${m}-${d}`;

    // Format day text (e.g. "1 Oktober" if 1st of month)
    let dayText = `${dayNum}`;
    if (dayNum === 1 && !isOtherMonth) {
      dayText = `1 ${MONTH_NAMES_ID[date.getMonth()]}`;
    }

    // Header row with date number & hover quick add button
    const headerRow = document.createElement('div');
    headerRow.className = 'cell-header-row';

    const numSpan = document.createElement('span');
    numSpan.className = 'day-number-text';
    numSpan.textContent = dayText;
    headerRow.appendChild(numSpan);

    const btnQuickAdd = document.createElement('button');
    btnQuickAdd.className = 'btn-cell-add-quick';
    btnQuickAdd.title = `Tambahkan postingan pada ${dayNum} ${MONTH_NAMES_ID[date.getMonth()]}`;
    btnQuickAdd.innerHTML = '+';
    btnQuickAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openScheduleModal(date);
    });
    headerRow.appendChild(btnQuickAdd);

    cell.appendChild(headerRow);

    // Events and Posts container
    const eventsList = document.createElement('div');
    eventsList.className = 'cell-events-list';

    // 1. Holiday Pill
    const matchingHoliday = holidays.find((h) => h.dateStr === dateStr);
    if (matchingHoliday) {
      const holidayPill = document.createElement('div');
      holidayPill.className = `holiday-event-pill ${matchingHoliday.category === 'holiday' ? 'special' : ''}`;
      holidayPill.title = matchingHoliday.title;
      holidayPill.textContent = matchingHoliday.title;
      eventsList.appendChild(holidayPill);
    }

    // 2. Scheduled Posts on this day
    const matchingPosts = allPosts.filter((p) => p.dateStr === dateStr);
    matchingPosts.forEach((post) => {
      const postCard = document.createElement('div');
      postCard.className = 'scheduled-post-card';
      postCard.title = `${post.timeStr} • ${post.projectTitle} (${post.channelName})`;

      postCard.innerHTML = `
        <div class="post-card-thumb" style="background: ${post.thumbnailColor || '#7047eb'};">
          ${post.imageUrl ? `<img src="${post.imageUrl}" alt="${post.projectTitle}" />` : (post.thumbnailIcon || '✨')}
        </div>
        <div class="post-card-details">
          <span class="post-card-time">${post.timeStr}</span>
          <span class="post-card-title">${post.projectTitle}</span>
        </div>
        <span class="post-card-channel-badge">${post.channelIcon || '📸'}</span>
      `;

      postCard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPostDetailModal(post);
      });

      eventsList.appendChild(postCard);
    });

    cell.appendChild(eventsList);

    // Clicking anywhere on the cell also opens the schedule modal for this date
    cell.addEventListener('click', () => {
      this.openScheduleModal(date);
    });

    return cell;
  }

  // ==========================================================================
  // Modal: Tambahkan Postingan ke Kalender (Images 2, 3, 4, 5)
  // ==========================================================================
  public openScheduleModal(targetDate: Date) {
    this.formScheduledDate = new Date(targetDate);
    this.formScheduledTime = '14:40';
    this.selectedProject = null;
    this.selectedCuratedTemplate = null;
    if (this.captionInput) this.captionInput.value = '';

    // Render Recent Projects & Templates in Left Column
    this.renderModalProjects();
    this.renderModalTemplates();

    // Reset Right Column to View 1 (Main Form)
    this.showViewMainForm();
    this.updateSelectedPreview();
    this.updateDateTimeButtonText();
    this.updateChannelButtonText();

    if (this.modalScheduleOverlay) {
      this.modalScheduleOverlay.classList.add('active');
    }
  }

  public closeScheduleModal() {
    if (this.modalScheduleOverlay) {
      this.modalScheduleOverlay.classList.remove('active');
    }
  }

  private showViewMainForm() {
    if (this.viewMainForm) this.viewMainForm.style.display = 'flex';
    if (this.viewSchedulePicker) this.viewSchedulePicker.style.display = 'none';
    if (this.viewChannelPicker) this.viewChannelPicker.style.display = 'none';
  }

  private showViewSchedulePicker() {
    if (this.viewMainForm) this.viewMainForm.style.display = 'none';
    if (this.viewSchedulePicker) this.viewSchedulePicker.style.display = 'flex';
    if (this.viewChannelPicker) this.viewChannelPicker.style.display = 'none';

    this.miniCalViewDate = new Date(this.formScheduledDate.getFullYear(), this.formScheduledDate.getMonth(), 1);
    this.renderMiniCalendar();
    if (this.miniTimeInput) {
      this.miniTimeInput.value = this.formScheduledTime;
    }
  }

  private showViewChannelPicker() {
    if (this.viewMainForm) this.viewMainForm.style.display = 'none';
    if (this.viewSchedulePicker) this.viewSchedulePicker.style.display = 'none';
    if (this.viewChannelPicker) this.viewChannelPicker.style.display = 'flex';

    this.renderChannelOptionsList();
  }

  private renderModalProjects() {
    if (!this.projectsScrollContainer) return;
    this.projectsScrollContainer.innerHTML = '';

    const projects = getProjects();
    projects.forEach((proj) => {
      const card = document.createElement('div');
      card.className = `project-select-card ${this.selectedProject?.id === proj.id ? 'selected' : ''}`;

      card.innerHTML = `
        <div class="project-select-thumb" style="background: ${proj.thumbnailColor || 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'};">
          <span>${proj.thumbnailIcon || '🎨'}</span>
        </div>
        <span class="project-select-name" title="${proj.title}">${proj.title}</span>
      `;

      card.addEventListener('click', () => {
        this.selectedProject = proj;
        this.selectedCuratedTemplate = null;

        // Update selected states
        document.querySelectorAll('.project-select-card').forEach((el) => el.classList.remove('selected'));
        document.querySelectorAll('.template-select-card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');

        this.updateSelectedPreview();
      });

      this.projectsScrollContainer.appendChild(card);
    });

    // Auto-select first project if available
    if (projects.length > 0 && !this.selectedProject) {
      this.selectedProject = projects[0];
      const firstCard = this.projectsScrollContainer.querySelector('.project-select-card');
      if (firstCard) firstCard.classList.add('selected');
      this.updateSelectedPreview();
    }
  }

  private renderModalTemplates() {
    if (!this.templatesScrollContainer) return;
    this.templatesScrollContainer.innerHTML = '';

    CURATED_PLANNER_TEMPLATES.forEach((tmpl) => {
      const card = document.createElement('div');
      card.className = `template-select-card ${this.selectedCuratedTemplate?.id === tmpl.id ? 'selected' : ''}`;

      card.innerHTML = `
        <div class="template-mock-thumb" style="background: ${tmpl.color}; color: ${tmpl.accent}; border: 1px solid ${tmpl.accent}33;">
          <span>${tmpl.text}</span>
        </div>
        <span class="project-select-name" title="${tmpl.title}">${tmpl.title}</span>
      `;

      card.addEventListener('click', () => {
        this.selectedCuratedTemplate = tmpl;
        this.selectedProject = null;

        document.querySelectorAll('.project-select-card').forEach((el) => el.classList.remove('selected'));
        document.querySelectorAll('.template-select-card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');

        this.updateSelectedPreview();
      });

      this.templatesScrollContainer.appendChild(card);
    });
  }

  private updateSelectedPreview() {
    if (!this.summaryBoxTitle) return;

    if (this.selectedProject) {
      this.summaryBoxTitle.textContent = this.selectedProject.title;
      this.summaryBoxMeta.textContent = this.selectedProject.format || 'Instagram Post (4:5)';
      if (this.summaryBoxThumb) {
        this.summaryBoxThumb.style.background = this.selectedProject.thumbnailColor || '#7047eb';
        this.summaryBoxThumb.innerHTML = `<span>${this.selectedProject.thumbnailIcon || '🎨'}</span>`;
      }
      if (this.btnSubmitSchedule) this.btnSubmitSchedule.disabled = false;
    } else if (this.selectedCuratedTemplate) {
      this.summaryBoxTitle.textContent = this.selectedCuratedTemplate.title;
      this.summaryBoxMeta.textContent = `${this.selectedCuratedTemplate.category} Template`;
      if (this.summaryBoxThumb) {
        this.summaryBoxThumb.style.background = this.selectedCuratedTemplate.color;
        this.summaryBoxThumb.innerHTML = `<span style="font-size: 10px; font-weight: bold; color: ${this.selectedCuratedTemplate.accent};">T</span>`;
      }
      if (this.btnSubmitSchedule) this.btnSubmitSchedule.disabled = false;
    } else {
      this.summaryBoxTitle.textContent = 'Pilih desain atau template';
      this.summaryBoxMeta.textContent = 'Klik salah satu proyek di sebelah kiri';
      if (this.btnSubmitSchedule) this.btnSubmitSchedule.disabled = true;
    }
  }

  private updateDateTimeButtonText() {
    if (!this.dateTimeDisplaySpan) return;
    const dayName = DAY_NAMES_FULL[this.formScheduledDate.getDay()];
    const dateNum = this.formScheduledDate.getDate();
    const monthShort = MONTH_NAMES_ID[this.formScheduledDate.getMonth()].slice(0, 3);
    this.dateTimeDisplaySpan.textContent = `${dayName}, ${dateNum} ${monthShort}, ${this.formScheduledTime}`;
  }

  private updateChannelButtonText() {
    if (!this.channelDisplaySpan) return;
    this.channelDisplaySpan.innerHTML = `
      <span>${this.formSelectedChannel.icon}</span>
      <span>${this.formSelectedChannel.name}</span>
    `;
  }

  // ==========================================================================
  // Mini Calendar & Time Picker (View B - Image 4)
  // ==========================================================================
  private renderMiniCalendar() {
    if (!this.miniCalGrid) return;
    this.miniCalGrid.innerHTML = '';

    const year = this.miniCalViewDate.getFullYear();
    const month = this.miniCalViewDate.getMonth();

    if (this.miniCalMonthDisplay) {
      this.miniCalMonthDisplay.textContent = `${MONTH_NAMES_ID[month]} ${year}`;
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDayNum = prevMonthLastDay - i;
      const dayEl = document.createElement('div');
      dayEl.className = 'mini-cal-day other-month';
      dayEl.textContent = `${prevDayNum}`;
      this.miniCalGrid.appendChild(dayEl);
    }

    // Current month active days
    for (let d = 1; d <= totalDays; d++) {
      const curDate = new Date(year, month, d);
      const isSelected =
        curDate.getFullYear() === this.formScheduledDate.getFullYear() &&
        curDate.getMonth() === this.formScheduledDate.getMonth() &&
        curDate.getDate() === this.formScheduledDate.getDate();

      const dayEl = document.createElement('div');
      dayEl.className = `mini-cal-day ${isSelected ? 'selected' : ''}`;
      dayEl.textContent = `${d}`;

      dayEl.addEventListener('click', () => {
        this.formScheduledDate = new Date(year, month, d);
        this.renderMiniCalendar();
      });

      this.miniCalGrid.appendChild(dayEl);
    }
  }

  // ==========================================================================
  // Channel Picker (View C - Image 5)
  // ==========================================================================
  private renderChannelOptionsList() {
    if (!this.channelListOptionsContainer) return;
    this.channelListOptionsContainer.innerHTML = '';

    SOCIAL_CHANNELS.forEach((channel) => {
      const row = document.createElement('div');
      row.className = 'channel-option-row';

      row.innerHTML = `
        <div class="channel-icon-circle" style="background: ${channel.color}15; color: ${channel.color};">
          ${channel.icon}
        </div>
        <span class="channel-name-title">${channel.name}</span>
      `;

      row.addEventListener('click', () => {
        this.formSelectedChannel = channel;
        this.updateChannelButtonText();
        this.showViewMainForm();
      });

      this.channelListOptionsContainer.appendChild(row);
    });
  }

  // ==========================================================================
  // Submit Scheduled Post
  // ==========================================================================
  private submitSchedule(isImmediate: boolean) {
    if (!this.selectedProject && !this.selectedCuratedTemplate) {
      this.showToast('Pilih proyek atau template terlebih dahulu!');
      return;
    }

    const title = this.selectedProject?.title || this.selectedCuratedTemplate?.title || 'Untitled Post';
    const format = this.selectedProject?.format || 'Instagram Post (4:5)';
    const thumbColor = this.selectedProject?.thumbnailColor || this.selectedCuratedTemplate?.color || '#7047eb';
    const thumbIcon = this.selectedProject?.thumbnailIcon || '✨';
    const previewType = this.selectedProject?.previewType || 'green';

    const y = this.formScheduledDate.getFullYear();
    const m = this.formScheduledDate.getMonth() + 1 < 10 ? `0${this.formScheduledDate.getMonth() + 1}` : `${this.formScheduledDate.getMonth() + 1}`;
    const d = this.formScheduledDate.getDate() < 10 ? `0${this.formScheduledDate.getDate()}` : `${this.formScheduledDate.getDate()}`;
    const dateStr = `${y}-${m}-${d}`;

    const newPost: ScheduledPost = {
      id: `post_${Date.now()}`,
      projectId: this.selectedProject?.id || 'proj_marketing_ad',
      projectTitle: title,
      projectFormat: format,
      thumbnailColor: thumbColor,
      thumbnailIcon: thumbIcon,
      previewType: previewType,
      channel: this.formSelectedChannel.id as any,
      channelName: this.formSelectedChannel.name,
      channelIcon: this.formSelectedChannel.icon,
      channelColor: this.formSelectedChannel.color,
      dateStr: dateStr,
      timeStr: this.formScheduledTime || '14:40',
      caption: this.captionInput?.value.trim() || '',
      status: isImmediate ? 'published' : 'scheduled',
      createdAt: Date.now()
    };

    saveScheduledPost(newPost);
    this.closeScheduleModal();
    this.renderCalendar();

    if (isImmediate) {
      this.showToast(`Postingan "${title}" berhasil dipublikasikan sekarang! 🚀`);
    } else {
      this.showToast(`Postingan "${title}" berhasil dijadwalkan untuk ${d} ${MONTH_NAMES_ID[this.formScheduledDate.getMonth()]} pukul ${newPost.timeStr}! 📅`);
    }
  }

  // ==========================================================================
  // Post Detail Modal
  // ==========================================================================
  private openPostDetailModal(post: ScheduledPost) {
    if (!this.postDetailDialogOverlay) return;

    this.postDetailDialogOverlay.innerHTML = `
      <div class="post-detail-dialog">
        <button class="btn-close-modal" id="btnClosePostDetail">&times;</button>
        <div class="post-detail-header">
          <div class="post-detail-thumb" style="background: ${post.thumbnailColor || '#7047eb'};">
            ${post.imageUrl ? `<img src="${post.imageUrl}" alt="${post.projectTitle}" />` : (post.thumbnailIcon || '✨')}
          </div>
          <div class="post-detail-meta">
            <h3 class="post-detail-title">${post.projectTitle}</h3>
            <span class="post-detail-channel">${post.channelIcon} ${post.channelName}</span>
            <span class="post-detail-datetime">📅 ${post.dateStr} pukul ${post.timeStr} WIB</span>
          </div>
        </div>

        ${post.caption ? `<div class="post-detail-caption">${post.caption}</div>` : ''}

        <div class="post-detail-actions">
          <button class="btn-delete-post" id="btnDeleteScheduledPost">Hapus Jadwal</button>
          <button class="btn-open-editor" id="btnOpenInEditor">Buka di Editor</button>
        </div>
      </div>
    `;

    this.postDetailDialogOverlay.classList.add('active');

    const btnClose = this.postDetailDialogOverlay.querySelector('#btnClosePostDetail');
    btnClose?.addEventListener('click', () => {
      this.postDetailDialogOverlay.classList.remove('active');
    });

    const btnDelete = this.postDetailDialogOverlay.querySelector('#btnDeleteScheduledPost');
    btnDelete?.addEventListener('click', () => {
      deleteScheduledPost(post.id);
      this.postDetailDialogOverlay.classList.remove('active');
      this.renderCalendar();
      this.showToast(`Jadwal postingan telah dihapus`);
    });

    const btnEdit = this.postDetailDialogOverlay.querySelector('#btnOpenInEditor');
    btnEdit?.addEventListener('click', () => {
      window.location.href = `./index.html?id=${post.projectId || 'proj_marketing_ad'}`;
    });
  }

  // Toast Notification
  private showToast(message: string, durationMs = 3500) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  new WargativeContentPlanner();
});
