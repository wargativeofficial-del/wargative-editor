/**
 * Wargative AI Magic Studio - Conversational Design & Live Canvas Generator
 * Powered by Google Gemini 3.8 Flash
 */

import { callGemini } from '../common/geminiService';
import { saveProjectMeta, ProjectItem } from '../common/projectStore';

export interface DesignData {
  headline: string;
  subheadline: string;
  badge?: string;
  topic: string;
  colors: {
    bg: string;
    primary: string;
    accent: string;
    text: string;
    subtext: string;
  };
  imageUrl: string;
  summary: string;
  width: number;
  height: number;
}

export interface ChatMessageItem {
  role: 'user' | 'model';
  type?: 'text' | 'question' | 'summary_card';
  text: string;
  timestamp: number;
  designData?: DesignData;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessageItem[];
  waitingForTopic?: boolean;
  pendingFormat?: string;
  currentDesign?: DesignData;
}

const STORAGE_KEY = 'WARGATIVE_AI_SESSIONS_V3';

class WargativeAIChatManager {
  private sessions: ChatSession[] = [];
  private activeSessionId: string = '';
  private isThinking: boolean = false;
  private activeMode: string = '';

  // DOM Elements
  private chatTabsList!: HTMLElement;
  private btnNewChat!: HTMLButtonElement;
  private aiSplitWorkspace!: HTMLElement;
  private chatSidePanel!: HTMLElement;
  private chatInnerScroll!: HTMLElement;
  private aiWelcomeView!: HTMLElement;
  private aiChatStreamView!: HTMLElement;
  private chatMessagesContainer!: HTMLElement;
  private bottomPromptWrapper!: HTMLElement;
  private chatPromptInput!: HTMLTextAreaElement;
  private btnSendPrompt!: HTMLButtonElement;
  private btnQuickTools!: HTMLButtonElement;
  private quickToolsPopover!: HTMLElement;
  private btnVoiceMic!: HTMLButtonElement;
  private btnCarouselPrev!: HTMLButtonElement;
  private btnCarouselNext!: HTMLButtonElement;
  private cardsCarouselTrack!: HTMLElement;
  private activeModePill!: HTMLElement;
  private activeModeText!: HTMLElement;
  private btnClearMode!: HTMLButtonElement;
  private toastContainer!: HTMLElement;

  // Canvas Workspace Elements
  private canvasSidePanel!: HTMLElement;
  private canvasProjectName!: HTMLElement;
  private btnCanvasEdit!: HTMLButtonElement;
  private btnCanvasDownload!: HTMLButtonElement;
  private btnCanvasClose!: HTMLButtonElement;
  private liveDesignPage!: HTMLElement;
  private canvasPageWrapper!: HTMLElement;
  private zoomSlider!: HTMLInputElement;
  private zoomPercentage!: HTMLElement;

  // Canva Formatting Contextual Toolbar Elements
  private selectedElement: HTMLElement | null = null;
  private canvaContextToolbar!: HTMLElement;
  private toolFontSelect!: HTMLSelectElement;
  private toolFontNameDisplay!: HTMLElement;
  private toolSizeInput!: HTMLInputElement;
  private btnSizeMinus!: HTMLButtonElement;
  private btnSizePlus!: HTMLButtonElement;
  private nativeColorPicker!: HTMLInputElement;
  private textColorIndicator!: HTMLElement;
  private btnBold!: HTMLButtonElement;
  private btnItalic!: HTMLButtonElement;
  private btnUnderline!: HTMLButtonElement;
  private btnUppercase!: HTMLButtonElement;
  private btnAlign!: HTMLButtonElement;
  private btnBackgroundTool!: HTMLButtonElement;
  private btnPathTool!: HTMLButtonElement;
  private btnShadowTool!: HTMLButtonElement;
  private btnOpacityTool!: HTMLButtonElement;
  private btnPositionTool!: HTMLButtonElement;
  private btnDuplicateTool!: HTMLButtonElement;
  private btnUndo!: HTMLButtonElement;
  private btnRedo!: HTMLButtonElement;

  // Canvas History (Ctrl+Z, Ctrl+Y) and Clipboard (Ctrl+C, Ctrl+X, Ctrl+V)
  private canvasHistory: string[] = [];
  private canvasRedoHistory: string[] = [];
  private clipboardHtml: string | null = null;
  private isDraggingElement: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private elemStartLeft: number = 0;
  private elemStartTop: number = 0;

  constructor() {
    this.initDOM();
    this.loadSessions();
    this.bindEvents();
    this.bindCanvasEditorEvents();
    this.renderTabs();
    this.renderActiveView();
  }

  private initDOM() {
    this.chatTabsList = document.getElementById('chatTabsList') as HTMLElement;
    this.btnNewChat = document.getElementById('btnNewChat') as HTMLButtonElement;
    this.aiSplitWorkspace = document.getElementById('aiSplitWorkspace') as HTMLElement;
    this.chatSidePanel = document.getElementById('chatSidePanel') as HTMLElement;
    this.chatInnerScroll = document.getElementById('chatInnerScroll') as HTMLElement;
    this.aiWelcomeView = document.getElementById('aiWelcomeView') as HTMLElement;
    this.aiChatStreamView = document.getElementById('aiChatStreamView') as HTMLElement;
    this.chatMessagesContainer = document.getElementById('chatMessagesContainer') as HTMLElement;
    this.bottomPromptWrapper = document.getElementById('bottomPromptWrapper') as HTMLElement;
    this.chatPromptInput = document.getElementById('chatPromptInput') as HTMLTextAreaElement;
    this.btnSendPrompt = document.getElementById('btnSendPrompt') as HTMLButtonElement;
    this.btnQuickTools = document.getElementById('btnQuickTools') as HTMLButtonElement;
    this.quickToolsPopover = document.getElementById('quickToolsPopover') as HTMLElement;
    this.btnVoiceMic = document.getElementById('btnVoiceMic') as HTMLButtonElement;
    this.btnCarouselPrev = document.getElementById('btnCarouselPrev') as HTMLButtonElement;
    this.btnCarouselNext = document.getElementById('btnCarouselNext') as HTMLButtonElement;
    this.cardsCarouselTrack = document.getElementById('cardsCarouselTrack') as HTMLElement;
    this.activeModePill = document.getElementById('activeModePill') as HTMLElement;
    this.activeModeText = document.getElementById('activeModeText') as HTMLElement;
    this.btnClearMode = document.getElementById('btnClearMode') as HTMLButtonElement;
    this.toastContainer = document.getElementById('toastContainer') as HTMLElement;

    // Canvas Workspace
    this.canvasSidePanel = document.getElementById('canvasSidePanel') as HTMLElement;
    this.canvasProjectName = document.getElementById('canvasProjectName') as HTMLElement;
    this.btnCanvasEdit = document.getElementById('btnCanvasEdit') as HTMLButtonElement;
    this.btnCanvasDownload = document.getElementById('btnCanvasDownload') as HTMLButtonElement;
    this.btnCanvasClose = document.getElementById('btnCanvasClose') as HTMLButtonElement;
    this.liveDesignPage = document.getElementById('liveDesignPage') as HTMLElement;
    this.canvasPageWrapper = document.getElementById('canvasPageWrapper') as HTMLElement;
    this.zoomSlider = document.getElementById('zoomSlider') as HTMLInputElement;
    this.zoomPercentage = document.getElementById('zoomPercentage') as HTMLElement;

    // Canva Contextual Toolbar
    this.canvaContextToolbar = document.getElementById('canvaContextToolbar') as HTMLElement;
    this.toolFontSelect = document.getElementById('toolFontSelect') as HTMLSelectElement;
    this.toolFontNameDisplay = document.getElementById('toolFontNameDisplay') as HTMLElement;
    this.toolSizeInput = document.getElementById('toolSizeInput') as HTMLInputElement;
    this.btnSizeMinus = document.getElementById('btnSizeMinus') as HTMLButtonElement;
    this.btnSizePlus = document.getElementById('btnSizePlus') as HTMLButtonElement;
    this.nativeColorPicker = document.getElementById('nativeColorPicker') as HTMLInputElement;
    this.textColorIndicator = document.getElementById('textColorIndicator') as HTMLElement;
    this.btnBold = document.getElementById('btnBold') as HTMLButtonElement;
    this.btnItalic = document.getElementById('btnItalic') as HTMLButtonElement;
    this.btnUnderline = document.getElementById('btnUnderline') as HTMLButtonElement;
    this.btnUppercase = document.getElementById('btnUppercase') as HTMLButtonElement;
    this.btnAlign = document.getElementById('btnAlign') as HTMLButtonElement;
    this.btnBackgroundTool = document.getElementById('btnBackgroundTool') as HTMLButtonElement;
    this.btnPathTool = document.getElementById('btnPathTool') as HTMLButtonElement;
    this.btnShadowTool = document.getElementById('btnShadowTool') as HTMLButtonElement;
    this.btnOpacityTool = document.getElementById('btnOpacityTool') as HTMLButtonElement;
    this.btnPositionTool = document.getElementById('btnPositionTool') as HTMLButtonElement;
    this.btnDuplicateTool = document.getElementById('btnDuplicateTool') as HTMLButtonElement;
    this.btnUndo = document.getElementById('btnUndo') as HTMLButtonElement;
    this.btnRedo = document.getElementById('btnRedo') as HTMLButtonElement;
  }

  private loadSessions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
    } catch {
      this.sessions = [];
    }

    if (!this.sessions || this.sessions.length === 0) {
      const initialSession: ChatSession = {
        id: `chat-${Date.now()}`,
        title: 'Obrolan baru',
        createdAt: Date.now(),
        messages: []
      };
      this.sessions = [initialSession];
      this.activeSessionId = initialSession.id;
      this.saveSessions();
    } else {
      this.activeSessionId = this.sessions[0].id;
    }
  }

  private saveSessions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch (e) {
      console.error('Failed to save sessions to localStorage', e);
    }
  }

  private getActiveSession(): ChatSession {
    let session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) {
      session = this.sessions[0];
      this.activeSessionId = session.id;
    }
    return session;
  }

  public createNewSession() {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title: 'Obrolan baru',
      createdAt: Date.now(),
      messages: []
    };

    this.sessions.unshift(newSession);
    this.activeSessionId = newSession.id;
    this.saveSessions();

    this.renderTabs();
    this.renderActiveView();

    if (this.chatPromptInput) {
      this.chatPromptInput.value = '';
      this.chatPromptInput.focus();
    }

    this.showToast('Obrolan baru telah dibuat');
  }

  public switchSession(sessionId: string) {
    if (this.activeSessionId === sessionId) return;
    this.activeSessionId = sessionId;
    this.renderTabs();
    this.renderActiveView();
  }

  public deleteSession(sessionId: string, e?: Event) {
    if (e) e.stopPropagation();

    if (this.sessions.length <= 1) {
      const session = this.sessions[0];
      session.title = 'Obrolan baru';
      session.messages = [];
      session.currentDesign = undefined;
      session.waitingForTopic = false;
      this.saveSessions();
      this.renderTabs();
      this.renderActiveView();
      this.showToast('Obrolan telah dibersihkan');
      return;
    }

    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.sessions[0].id;
    }
    this.saveSessions();
    this.renderTabs();
    this.renderActiveView();
    this.showToast('Obrolan dihapus');
  }

  private renderTabs() {
    if (!this.chatTabsList) return;
    this.chatTabsList.innerHTML = '';

    this.sessions.forEach((session) => {
      const pill = document.createElement('button');
      pill.className = `chat-tab-pill ${session.id === this.activeSessionId ? 'active' : ''}`;
      pill.setAttribute('data-chat-id', session.id);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title-text';
      titleSpan.textContent = session.title || 'Obrolan baru';
      pill.appendChild(titleSpan);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Tutup obrolan';
      closeBtn.addEventListener('click', (e) => this.deleteSession(session.id, e));
      pill.appendChild(closeBtn);

      pill.addEventListener('click', () => this.switchSession(session.id));
      this.chatTabsList.appendChild(pill);
    });
  }

  private renderActiveView() {
    const session = this.getActiveSession();
    const hasMessages = session.messages && session.messages.length > 0;

    if (!hasMessages) {
      if (this.aiWelcomeView) this.aiWelcomeView.style.display = 'flex';
      if (this.aiChatStreamView) this.aiChatStreamView.style.display = 'none';
      this.closeSplitCanvas();
      return;
    }

    if (this.aiWelcomeView) this.aiWelcomeView.style.display = 'none';
    if (this.aiChatStreamView) this.aiChatStreamView.style.display = 'flex';

    this.renderMessageStream(session);

    // Keep split canvas closed by default so user sees the chat view (Image 3)
    this.closeSplitCanvas();
  }

  private renderMessageStream(session: ChatSession) {
    if (!this.chatMessagesContainer) return;
    this.chatMessagesContainer.innerHTML = '';

    session.messages.forEach((msg) => {
      const row = document.createElement('div');
      row.className = `chat-message-row ${msg.role}`;

      if (msg.role === 'user') {
        const wrapper = document.createElement('div');
        wrapper.className = 'user-msg-wrapper';

        const actions = document.createElement('div');
        actions.className = 'user-bubble-actions';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-bubble-copy';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Salin pesan';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(msg.text);
          this.showToast('Pesan disalin');
        });
        actions.appendChild(copyBtn);
        wrapper.appendChild(actions);

        const bubble = document.createElement('div');
        bubble.className = 'user-bubble';
        bubble.textContent = msg.text;
        wrapper.appendChild(bubble);

        row.appendChild(wrapper);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'model-msg-wrapper';

        if (msg.type === 'question') {
          const qText = document.createElement('div');
          qText.className = 'model-question-text';
          qText.textContent = msg.text;
          wrapper.appendChild(qText);
        } else if (msg.type === 'summary_card' && msg.designData) {
          const textEl = document.createElement('div');
          textEl.className = 'model-question-text';
          textEl.textContent = msg.text;
          wrapper.appendChild(textEl);

          // Chat Poster Preview Card (Matching User Image 3)
          const cardWrapper = document.createElement('div');
          cardWrapper.className = 'chat-poster-card-wrapper';

          const posterMockup = document.createElement('div');
          posterMockup.className = 'chat-poster-mockup-card';
          posterMockup.title = 'Klik untuk melihat & mengedit live di Canvas';
          posterMockup.innerHTML = `
            <div class="chat-poster-header" style="background: linear-gradient(180deg, ${msg.designData.colors.bg} 0%, rgba(12,35,64,0.9) 100%);">
              <div class="chat-poster-poly"></div>
              <h2 class="chat-poster-headline">${msg.designData.headline}</h2>
              <p class="chat-poster-subheadline">${msg.designData.subheadline}</p>
            </div>
            <div class="chat-poster-curve">
              <svg viewBox="0 0 500 40" preserveAspectRatio="none">
                <path d="M 0,20 Q 250,45 500,10 L 500,40 L 0,40 Z" fill="${msg.designData.colors.accent}" opacity="0.95"></path>
              </svg>
            </div>
            <div class="chat-poster-photo-section">
              <img src="${msg.designData.imageUrl}" class="chat-poster-img" alt="Poster Image" />
              <div class="chat-poster-overlay"></div>
              ${msg.designData.badge ? `<div class="chat-poster-badge" style="background: ${msg.designData.colors.accent};">${msg.designData.badge}</div>` : ''}
            </div>
          `;
          posterMockup.addEventListener('click', () => {
            if (msg.designData) this.openSplitCanvas(msg.designData);
          });
          cardWrapper.appendChild(posterMockup);

          // Action Buttons: [Edit] and [Membuka] (Image 3)
          const actionsRow = document.createElement('div');
          actionsRow.className = 'chat-poster-actions-row';

          const btnEdit = document.createElement('button');
          btnEdit.className = 'btn-chat-card-action';
          btnEdit.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Edit</span>
          `;
          btnEdit.title = 'Edit desain di Live Canvas';
          btnEdit.addEventListener('click', () => {
            if (msg.designData) this.openSplitCanvas(msg.designData);
          });
          actionsRow.appendChild(btnEdit);

          const btnOpen = document.createElement('button');
          btnOpen.className = 'btn-chat-card-action';
          btnOpen.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span>Membuka</span>
          `;
          btnOpen.title = 'Buka langsung di Wargative Editor';
          btnOpen.addEventListener('click', () => {
            if (msg.designData) this.openInWargativeEditor(msg.designData);
          });
          actionsRow.appendChild(btnOpen);

          cardWrapper.appendChild(actionsRow);

          // Versi terbaru Pill Button (Image 3)
          const versionPill = document.createElement('button');
          versionPill.className = 'chat-version-pill';
          versionPill.innerHTML = `
            <img src="${msg.designData.imageUrl}" class="chat-version-thumb" alt="Thumb" />
            <span>Versi terbaru</span>
            <span>↗</span>
          `;
          versionPill.title = 'Buka versi terbaru di Live Canvas';
          versionPill.addEventListener('click', () => {
            if (msg.designData) this.openSplitCanvas(msg.designData);
          });
          cardWrapper.appendChild(versionPill);

          wrapper.appendChild(cardWrapper);
        } else {
          const generalText = document.createElement('div');
          generalText.className = 'model-question-text';
          generalText.innerHTML = this.formatMarkdown(msg.text);
          wrapper.appendChild(generalText);
        }

        row.appendChild(wrapper);
      }

      this.chatMessagesContainer.appendChild(row);
    });

    this.scrollToBottom();
  }

  private formatMarkdown(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }

  private scrollToBottom() {
    if (this.chatInnerScroll) {
      setTimeout(() => {
        this.chatInnerScroll.scrollTop = this.chatInnerScroll.scrollHeight;
      }, 50);
    }
  }

  /**
   * Handles user sending a prompt
   */
  public async handleSendPrompt(customText?: string) {
    if (this.isThinking) return;

    const text = (customText || this.chatPromptInput.value || '').trim();
    if (!text) return;

    const session = this.getActiveSession();

    // Clear input
    this.chatPromptInput.value = '';
    this.chatPromptInput.style.height = 'auto';

    // Step 2 & 3: Check conversation state
    const isGenericDesignIntent = this.isGenericDesignPrompt(text);

    // If user clicked/typed "Buat postingan media sosial" without a topic
    if (isGenericDesignIntent && !session.waitingForTopic) {
      // 1. Add User Message
      session.messages.push({
        role: 'user',
        text: text,
        timestamp: Date.now()
      });

      // 2. Set Waiting For Topic state
      session.waitingForTopic = true;
      session.pendingFormat = text;

      // 3. AI Asks clarifying question
      let question = 'Tentang apa sebaiknya unggahan media sosial tersebut?';
      if (text.toLowerCase().includes('presentasi')) {
        question = 'Tentang apa sebaiknya dek presentasi tersebut?';
      } else if (text.toLowerCase().includes('pembelajaran')) {
        question = 'Bantu saya memahami, tentang materi atau topik apa dokumen pembelajaran tersebut?';
      } else if (text.toLowerCase().includes('flash sale') || text.toLowerCase().includes('banner')) {
        question = 'Produk atau penawaran apa yang ingin Anda promosikan pada banner ini?';
      }

      session.messages.push({
        role: 'model',
        type: 'question',
        text: question,
        timestamp: Date.now()
      });

      this.saveSessions();
      this.renderActiveView();
      return;
    }

    // Step 3 -> 4: User answered the topic (or typed a specific prompt with topic)
    if (session.waitingForTopic || isGenericDesignIntent) {
      const topic = text;
      session.waitingForTopic = false;

      // 1. Add User Answer
      session.messages.push({
        role: 'user',
        text: topic,
        timestamp: Date.now()
      });

      // Update session title (e.g. "Social Media - Sekolah")
      session.title = `Social Media - ${topic.slice(0, 16)}`;
      this.renderTabs();
      this.saveSessions();
      this.renderActiveView();

      // 2. Show "Pemikiran..." status
      this.showStatusPill('Pemikiran...', false);

      // 3. Open Split Workspace & Show live building skeleton on canvas
      setTimeout(() => {
        this.showStatusPill('Membuat desain', true);
        this.openSplitCanvasBuilding(topic);
      }, 700);

      // 4. Generate structured design with Gemini 3.8 Flash
      this.isThinking = true;
      try {
        const designData = await this.generateDesignJSON(session.pendingFormat || 'Buat postingan media sosial.', topic);

        this.hideStatusPill();
        session.currentDesign = designData;

        // 5. Add model summary message
        session.messages.push({
          role: 'model',
          type: 'summary_card',
          text: designData.summary,
          timestamp: Date.now(),
          designData: designData
        });

        this.saveSessions();
        this.renderMessageStream(session);

        // 6. Render completed poster live on the canvas!
        this.renderLivePoster(designData);
      } catch (err: any) {
        this.hideStatusPill();
        this.showToast(`Error: ${err.message || 'Gagal membuat desain'}`);
      } finally {
        this.isThinking = false;
      }
      return;
    }

    // Default general conversation flow
    session.messages.push({
      role: 'user',
      text: text,
      timestamp: Date.now()
    });

    if (session.title === 'Obrolan baru') {
      session.title = text.slice(0, 20);
      this.renderTabs();
    }

    this.saveSessions();
    this.renderActiveView();

    this.isThinking = true;
    this.showStatusPill('Pemikiran...', false);

    try {
      const response = await callGemini(text);
      this.hideStatusPill();
      session.messages.push({
        role: 'model',
        text: response,
        timestamp: Date.now()
      });
      this.saveSessions();
      this.renderMessageStream(session);
    } catch (err: any) {
      this.hideStatusPill();
      this.showToast(`Error: ${err.message}`);
    } finally {
      this.isThinking = false;
    }
  }

  private isGenericDesignPrompt(prompt: string): boolean {
    const p = prompt.toLowerCase();
    return (
      p.includes('buat postingan media sosial') ||
      p.includes('create a social media post') ||
      p.includes('rancanglah sebuah dek presentasi') ||
      p.includes('rencana pembelajaran') ||
      p.includes('banner promosi flash sale') ||
      p.includes('racik palet warna')
    );
  }

  private showStatusPill(text: string, isCreating: boolean) {
    this.hideStatusPill();
    if (!this.chatMessagesContainer) return;

    const row = document.createElement('div');
    row.className = 'chat-message-row model';
    row.id = 'activeStatusIndicatorRow';

    const pill = document.createElement('div');
    pill.className = `ai-status-indicator ${isCreating ? 'creating' : ''}`;
    pill.innerHTML = `
      <span class="status-orb ${isCreating ? 'purple' : ''}"></span>
      <span>${text}</span>
    `;
    row.appendChild(pill);
    this.chatMessagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  private hideStatusPill() {
    const existing = document.getElementById('activeStatusIndicatorRow');
    if (existing) existing.remove();
  }

  /**
   * Generates high-fidelity structured design using Gemini 3.8 Flash
   */
  private async generateDesignJSON(formatPrompt: string, topic: string): Promise<DesignData> {
    const prompt = `
Kamu adalah Canva AI Designer kelas dunia.
Format permintaan: "${formatPrompt}"
Topik spesifik: "${topic}"

Buatkan spesifikasi layout desain visual lengkap dalam format JSON murni (tanpa markdown backtick).
Format JSON yang WAJIB dihasilkan:
{
  "headline": "Judul Utama Yang Kuat & Catchy (Maksimal 5 Kata)",
  "subheadline": "Subjudul pendukung yang persuasif dan inspiratif (1 kalimat)",
  "badge": "TAGLINE / BADGE HURUF KAPITAL",
  "topic": "${topic}",
  "colors": {
    "bg": "#0c2340",
    "primary": "#1d4ed8",
    "accent": "#f59e0b",
    "text": "#ffffff",
    "subtext": "#cbd5e1"
  },
  "imageKeyword": "school,students,classroom",
  "summary": "Posting media sosial bertema ${topic} telah dibuat, dengan konsep \"[headline]\" dan nuansa pendidikan yang inspiratif, ramah, serta energik."
}
`;

    const systemInstruction = 'Kamu adalah sistem pembuat desain otomatis Canva. Hasilkan HANYA output JSON valid tanpa teks pengantar apapun.';

    try {
      const response = await callGemini(prompt, systemInstruction);
      const cleanJson = response.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const curatedPhoto = this.getTopicPhoto(topic, parsed.imageKeyword);

      return {
        headline: parsed.headline || 'Belajar Bersama, Tumbuh Bersama',
        subheadline: parsed.subheadline || 'Bangun masa depanmu di sekolah',
        badge: parsed.badge || 'SEKOLAH UNGGULAN',
        topic: topic,
        colors: parsed.colors || {
          bg: '#0c2340',
          primary: '#1d4ed8',
          accent: '#f59e0b',
          text: '#ffffff',
          subtext: '#cbd5e1'
        },
        imageUrl: curatedPhoto,
        summary: parsed.summary || `Posting media sosial bertema ${topic} telah dibuat dengan konsep "${parsed.headline}".`,
        width: 1080,
        height: 1350
      };
    } catch {
      // High-quality fallback for seamless user experience
      const fallbackPhoto = this.getTopicPhoto(topic);
      return {
        headline: 'Belajar Bersama, Tumbuh Bersama',
        subheadline: 'Bangun masa depanmu di sekolah',
        badge: 'SEKOLAH UNGGULAN',
        topic: topic,
        colors: {
          bg: '#0c2340',
          primary: '#1d4ed8',
          accent: '#f59e0b',
          text: '#ffffff',
          subtext: '#cbd5e1'
        },
        imageUrl: fallbackPhoto,
        summary: `Posting media sosial bertema ${topic} telah dibuat, dengan konsep "Belajar Bersama, Tumbuh Bersama" dan nuansa visual yang inspiratif, ramah, serta energik.`,
        width: 1080,
        height: 1350
      };
    }
  }

  private getTopicPhoto(topic: string, keywords?: string): string {
    const t = (topic + ' ' + (keywords || '')).toLowerCase();
    if (t.includes('sekolah') || t.includes('school') || t.includes('student') || t.includes('belajar') || t.includes('pendidikan')) {
      // High-res photo matching Screenshot 5 (happy students smiling together in school uniform / study)
      return 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1000&auto=format&fit=crop&q=80';
    } else if (t.includes('coffee') || t.includes('kopi') || t.includes('cafe')) {
      return 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1000&auto=format&fit=crop&q=80';
    } else if (t.includes('bisnis') || t.includes('business') || t.includes('presentasi')) {
      return 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1000&auto=format&fit=crop&q=80';
    } else if (t.includes('skincare') || t.includes('beauty') || t.includes('fashion')) {
      return 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1000&auto=format&fit=crop&q=80';
  }

  /**
   * Split Canvas Management
   */
  private openSplitCanvasBuilding(topic: string) {
    if (this.aiSplitWorkspace) this.aiSplitWorkspace.classList.add('split-active');
    if (this.canvasSidePanel) this.canvasSidePanel.style.display = 'flex';
    if (this.canvasProjectName) this.canvasProjectName.textContent = `Postingan Media Sosial (${topic})`;

    if (this.liveDesignPage) {
      this.liveDesignPage.className = 'live-design-page building';
      this.liveDesignPage.innerHTML = `
        <div class="building-pulse-content">
          <div class="building-spinner"></div>
          <span>Sedang merancang template live...</span>
        </div>
      `;
    }
  }

  private openSplitCanvas(design: DesignData) {
    if (this.aiSplitWorkspace) this.aiSplitWorkspace.classList.add('split-active');
    if (this.canvasSidePanel) this.canvasSidePanel.style.display = 'flex';
    if (this.canvasProjectName) this.canvasProjectName.textContent = design.headline;
    this.renderLivePoster(design);
  }

  private closeSplitCanvas() {
    if (this.aiSplitWorkspace) this.aiSplitWorkspace.classList.remove('split-active');
    if (this.canvasSidePanel) this.canvasSidePanel.style.display = 'none';
  }

  /**
   * Renders the complete live editable poster matching Screenshot 1 & 5
   */
  private renderLivePoster(data: DesignData) {
    if (!this.liveDesignPage) return;

    this.liveDesignPage.className = 'live-design-page';
    this.liveDesignPage.innerHTML = `
      <div class="poster-container" style="background-color: ${data.colors.bg};">
        <!-- Top Section: Header & Typography -->
        <div class="poster-header-section" style="background: linear-gradient(180deg, ${data.colors.bg} 0%, rgba(12,35,64,0.92) 100%);">
          <div class="poster-geometric-poly editable-element" id="livePolyEl" title="Bentuk Geometris (Bisa digeser)"></div>
          <h1 class="poster-headline editable-element" id="liveHeadlineEl" contenteditable="true" spellcheck="false" style="color: ${data.colors.text}; font-family: 'Montserrat', sans-serif;">${data.headline}</h1>
          <p class="poster-subheadline editable-element" id="liveSubheadlineEl" contenteditable="true" spellcheck="false" style="color: ${data.colors.subtext}; font-family: 'Plus Jakarta Sans', sans-serif;">${data.subheadline}</p>
        </div>

        <!-- Curve Divider Wave (Yellow/Gold Accent) -->
        <div class="poster-curve-divider">
          <svg viewBox="0 0 500 40" preserveAspectRatio="none">
            <path d="M 0,20 Q 250,45 500,10 L 500,40 L 0,40 Z" fill="${data.colors.accent}" opacity="0.95"></path>
          </svg>
        </div>

        <!-- Bottom Section: High-Res Photo & Accent -->
        <div class="poster-photo-section">
          <img src="${data.imageUrl}" class="poster-photo-img" alt="${data.topic}" />
          <div class="poster-photo-overlay"></div>
          ${data.badge ? `<div class="poster-footer-badge editable-element" id="liveBadgeEl" contenteditable="true" spellcheck="false" style="background: ${data.colors.accent};">${data.badge}</div>` : ''}
        </div>
      </div>
    `;

    this.rebindLiveCanvasElements();
    this.pushCanvasState();

    const headlineEl = document.getElementById('liveHeadlineEl');
    if (headlineEl) {
      setTimeout(() => this.selectCanvasElement(headlineEl, data), 200);
    }

    // Hook Edit Button to open in Wargative Studio
    if (this.btnCanvasEdit) {
      this.btnCanvasEdit.onclick = () => this.openInWargativeEditor(data);
    }

    // Hook Download Button
    if (this.btnCanvasDownload) {
      this.btnCanvasDownload.onclick = () => this.downloadCanvasPoster(data);
    }
  }

  /**
   * Rebinds all editable elements inside live canvas
   */
  private rebindLiveCanvasElements() {
    if (!this.liveDesignPage) return;
    const session = this.getActiveSession();
    const data = session.currentDesign;
    if (!data) return;

    const editableElements = this.liveDesignPage.querySelectorAll('.editable-element');
    editableElements.forEach((node) => {
      const el = node as HTMLElement;
      el.onclick = (e) => {
        e.stopPropagation();
        this.selectCanvasElement(el, data);
      };
      el.oninput = () => {
        if (el.id === 'liveHeadlineEl') data.headline = el.innerText.trim();
        else if (el.id === 'liveSubheadlineEl') data.subheadline = el.innerText.trim();
        else if (el.id === 'liveBadgeEl') data.badge = el.innerText.trim();
        this.saveSessions();
        this.pushCanvasState();
      };
      this.initElementDragging(el);
    });
  }

  /**
   * Element Drag & Drop repositioning
   */
  private initElementDragging(el: HTMLElement) {
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.element-action-toolbar')) return;
      if (document.activeElement === el && (e.target as HTMLElement).isContentEditable) return;

      this.isDraggingElement = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const computed = window.getComputedStyle(el);
      this.elemStartLeft = parseFloat(computed.left) || 0;
      this.elemStartTop = parseFloat(computed.top) || 0;

      const onMouseMove = (me: MouseEvent) => {
        if (!this.isDraggingElement) return;
        const dx = me.clientX - this.dragStartX;
        const dy = me.clientY - this.dragStartY;
        el.style.position = 'relative';
        el.style.left = `${this.elemStartLeft + dx}px`;
        el.style.top = `${this.elemStartTop + dy}px`;
      };

      const onMouseUp = () => {
        if (this.isDraggingElement) {
          this.isDraggingElement = false;
          this.pushCanvasState();
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Canvas Undo / Redo & Clipboard Support
   */
  public pushCanvasState() {
    if (!this.liveDesignPage) return;
    const clone = this.liveDesignPage.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.element-action-toolbar, .element-rot-handle').forEach((el) => el.remove());
    clone.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    const html = clone.innerHTML;

    if (this.canvasHistory.length === 0 || this.canvasHistory[this.canvasHistory.length - 1] !== html) {
      this.canvasHistory.push(html);
      if (this.canvasHistory.length > 50) this.canvasHistory.shift();
      this.canvasRedoHistory = [];
    }
  }

  public undoCanvasState() {
    if (this.canvasHistory.length > 1) {
      const current = this.canvasHistory.pop()!;
      this.canvasRedoHistory.push(current);
      const prev = this.canvasHistory[this.canvasHistory.length - 1];
      if (prev && this.liveDesignPage) {
        this.deselectCanvasElement();
        this.liveDesignPage.innerHTML = prev;
        this.rebindLiveCanvasElements();
        this.showToast('Urungkan aksi (Ctrl+Z)');
      }
    } else {
      this.showToast('Tidak ada lagi riwayat untuk diurungkan');
    }
  }

  public redoCanvasState() {
    if (this.canvasRedoHistory.length > 0) {
      const next = this.canvasRedoHistory.pop()!;
      this.canvasHistory.push(next);
      if (this.liveDesignPage) {
        this.deselectCanvasElement();
        this.liveDesignPage.innerHTML = next;
        this.rebindLiveCanvasElements();
        this.showToast('Ulangi aksi (Ctrl+Y)');
      }
    } else {
      this.showToast('Tidak ada lagi riwayat untuk diulangi');
    }
  }

  public copyCanvasElement() {
    if (this.selectedElement) {
      const clone = this.selectedElement.cloneNode(true) as HTMLElement;
      clone.classList.remove('selected');
      clone.querySelectorAll('.element-action-toolbar, .element-rot-handle').forEach((el) => el.remove());
      this.clipboardHtml = clone.outerHTML;
      this.showToast('Elemen disalin (Ctrl+C)');
    }
  }

  public cutCanvasElement() {
    if (this.selectedElement) {
      this.copyCanvasElement();
      this.pushCanvasState();
      this.selectedElement.remove();
      this.selectedElement = null;
      this.pushCanvasState();
      this.showToast('Elemen dipotong (Ctrl+X)');
    }
  }

  public pasteCanvasElement() {
    if (this.clipboardHtml && this.liveDesignPage) {
      this.pushCanvasState();
      const temp = document.createElement('div');
      temp.innerHTML = this.clipboardHtml;
      const el = temp.firstElementChild as HTMLElement;
      if (el) {
        el.id = `elem_${Date.now()}`;
        el.classList.remove('selected');
        el.contentEditable = 'true';
        el.spellcheck = false;

        const curTop = parseFloat(el.style.top) || 20;
        const curLeft = parseFloat(el.style.left) || 20;
        el.style.position = 'relative';
        el.style.top = `${curTop + 24}px`;
        el.style.left = `${curLeft + 24}px`;

        const targetContainer = this.liveDesignPage.querySelector('.poster-header-section') || this.liveDesignPage;
        targetContainer.appendChild(el);

        this.rebindLiveCanvasElements();
        const session = this.getActiveSession();
        if (session.currentDesign) {
          this.selectCanvasElement(el, session.currentDesign);
        }
        this.pushCanvasState();
        this.showToast('Elemen ditempel (Ctrl+V)');
      }
    }
  }

  public deleteSelectedCanvasElement() {
    if (this.selectedElement) {
      this.pushCanvasState();
      this.selectedElement.remove();
      this.selectedElement = null;
      this.pushCanvasState();
      this.showToast('Elemen dihapus');
    }
  }

  /**
   * Opens the AI-generated design directly into CE.SDK Wargative Studio (index.html)
   */
  private openInWargativeEditor(data: DesignData) {
    const liveHeadline = document.getElementById('liveHeadlineEl')?.innerText.trim() || data.headline;
    const liveSubheadline = document.getElementById('liveSubheadlineEl')?.innerText.trim() || data.subheadline;
    const liveBadge = document.getElementById('liveBadgeEl')?.innerText.trim() || data.badge || 'SEKOLAH UNGGULAN';

    const latestData: DesignData = {
      ...data,
      headline: liveHeadline,
      subheadline: liveSubheadline,
      badge: liveBadge,
      width: 1080,
      height: 1350
    };

    const session = this.getActiveSession();
    session.currentDesign = latestData;
    this.saveSessions();

    const projectId = `proj_ai_${Date.now()}`;

    // Store transfer data for CE.SDK scene builder in src/index.ts
    localStorage.setItem(
      'wargative_ai_transfer_design',
      JSON.stringify({
        ...latestData,
        projectId
      })
    );

    const projectItem: ProjectItem = {
      id: projectId,
      title: latestData.headline,
      format: `${latestData.width} × ${latestData.height} px`,
      width: latestData.width,
      height: latestData.height,
      updatedAt: Date.now(),
      thumbnailColor: 'linear-gradient(135deg, #0c2340 0%, #1d4ed8 100%)',
      thumbnailIcon: '✨',
      badgeText: 'AI Template',
      badgeBg: '#7c3aed',
      badgeIconType: 'star'
    };

    saveProjectMeta(projectItem);
    this.showToast('Membuka desain di Wargative Editor...');

    setTimeout(() => {
      window.location.href = `./index.html?id=${projectId}&source=ai_gen`;
    }, 250);
  }

  private bindCanvasEditorEvents() {
    // Deselect when clicking outside editable elements
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.editable-element') && !target.closest('.canva-context-toolbar')) {
        this.deselectCanvasElement();
      }
    });

    // Font Select
    this.toolFontSelect?.addEventListener('change', () => {
      const selectedOption = this.toolFontSelect.options[this.toolFontSelect.selectedIndex];
      const fontName = selectedOption ? selectedOption.text : 'Montserrat';
      if (this.toolFontNameDisplay) {
        this.toolFontNameDisplay.textContent = fontName;
      }
      if (this.selectedElement) {
        this.selectedElement.style.fontFamily = this.toolFontSelect.value;
      }
    });

    // Font Size Plus/Minus
    this.btnSizePlus?.addEventListener('click', () => {
      if (this.selectedElement) {
        const cur = parseFloat(window.getComputedStyle(this.selectedElement).fontSize) || 32;
        const next = Math.round(cur + 2);
        this.selectedElement.style.fontSize = `${next}px`;
        if (this.toolSizeInput) this.toolSizeInput.value = `${next}`;
      }
    });

    this.btnSizeMinus?.addEventListener('click', () => {
      if (this.selectedElement) {
        const cur = parseFloat(window.getComputedStyle(this.selectedElement).fontSize) || 32;
        const next = Math.max(12, Math.round(cur - 2));
        this.selectedElement.style.fontSize = `${next}px`;
        if (this.toolSizeInput) this.toolSizeInput.value = `${next}`;
      }
    });

    this.toolSizeInput?.addEventListener('change', () => {
      if (this.selectedElement) {
        const val = parseFloat(this.toolSizeInput.value) || 32;
        this.selectedElement.style.fontSize = `${val}px`;
      }
    });

    // Text Color
    this.nativeColorPicker?.addEventListener('input', () => {
      if (this.selectedElement) {
        const col = this.nativeColorPicker.value;
        this.selectedElement.style.color = col;
        if (this.textColorIndicator) this.textColorIndicator.style.background = col;
      }
    });

    // Bold Toggle
    this.btnBold?.addEventListener('click', () => {
      if (this.selectedElement) {
        const isBold = parseInt(window.getComputedStyle(this.selectedElement).fontWeight, 10) >= 700;
        this.selectedElement.style.fontWeight = isBold ? '400' : '900';
        this.btnBold.classList.toggle('active', !isBold);
      }
    });

    // Italic Toggle
    this.btnItalic?.addEventListener('click', () => {
      if (this.selectedElement) {
        const isItalic = window.getComputedStyle(this.selectedElement).fontStyle === 'italic';
        this.selectedElement.style.fontStyle = isItalic ? 'normal' : 'italic';
        this.btnItalic.classList.toggle('active', !isItalic);
      }
    });

    // Alignment Toggle
    this.btnAlign?.addEventListener('click', () => {
      if (this.selectedElement) {
        const cur = window.getComputedStyle(this.selectedElement).textAlign;
        let next = 'left';
        if (cur === 'left') next = 'center';
        else if (cur === 'center') next = 'right';
        else next = 'left';
        this.selectedElement.style.textAlign = next;
        this.showToast(`Perataan teks: ${next}`);
      }
    });

    // Uppercase Toggle
    this.btnUppercase?.addEventListener('click', () => {
      if (this.selectedElement) {
        const isUpper = window.getComputedStyle(this.selectedElement).textTransform === 'uppercase';
        this.selectedElement.style.textTransform = isUpper ? 'none' : 'uppercase';
        this.btnUppercase.classList.toggle('active', !isUpper);
      }
    });

    // Background Fill Tool
    this.btnBackgroundTool?.addEventListener('click', () => {
      if (this.selectedElement) {
        const hasBg = this.selectedElement.style.backgroundColor && this.selectedElement.style.backgroundColor !== 'transparent';
        if (hasBg) {
          this.selectedElement.style.backgroundColor = 'transparent';
          this.selectedElement.style.padding = '0';
          this.showToast('Latar belakang dihapus');
        } else {
          this.selectedElement.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
          this.selectedElement.style.borderRadius = '6px';
          this.selectedElement.style.padding = '4px 8px';
          this.showToast('Latar belakang ditambahkan');
        }
      } else {
        this.showToast('Pilih teks untuk mengatur background');
      }
    });

    // Path / Curved Text Tool
    this.btnPathTool?.addEventListener('click', () => {
      if (this.selectedElement) {
        const isCursive = this.selectedElement.style.fontFamily.includes('serif');
        this.selectedElement.style.letterSpacing = this.selectedElement.style.letterSpacing === '2px' ? 'normal' : '2px';
        this.showToast('Efek alur & spasi teks diterapkan');
      } else {
        this.showToast('Pilih teks untuk mengatur alur path');
      }
    });

    // Shadow Tool
    this.btnShadowTool?.addEventListener('click', () => {
      if (this.selectedElement) {
        const hasShadow = this.selectedElement.style.textShadow && this.selectedElement.style.textShadow !== 'none';
        if (hasShadow) {
          this.selectedElement.style.textShadow = 'none';
          this.showToast('Bayangan teks dinonaktifkan');
        } else {
          this.selectedElement.style.textShadow = '0 4px 14px rgba(0, 0, 0, 0.7)';
          this.showToast('Bayangan teks diaktifkan');
        }
      } else {
        this.showToast('Pilih teks untuk mengatur bayangan');
      }
    });

    // Opacity Tool
    this.btnOpacityTool?.addEventListener('click', () => {
      if (this.selectedElement) {
        const curOp = parseFloat(this.selectedElement.style.opacity || '1');
        let nextOp = 1;
        if (curOp >= 0.95) nextOp = 0.75;
        else if (curOp >= 0.7) nextOp = 0.5;
        else nextOp = 1;
        this.selectedElement.style.opacity = `${nextOp}`;
        this.showToast(`Transparansi: ${Math.round(nextOp * 100)}%`);
      } else {
        this.showToast('Pilih elemen untuk mengatur transparansi');
      }
    });

    // Position Tool
    this.btnPositionTool?.addEventListener('click', () => {
      if (this.selectedElement) {
        this.selectedElement.style.textAlign = 'center';
        this.showToast('Posisi diatur ke tengah');
      } else {
        this.showToast('Pilih elemen untuk mengatur posisi');
      }
    });

    // Duplicate Layer Tool
    this.btnDuplicateTool?.addEventListener('click', () => {
      if (this.selectedElement && this.selectedElement.parentElement) {
        const clone = this.selectedElement.cloneNode(true) as HTMLElement;
        clone.classList.remove('selected');
        const bar = clone.querySelector('.element-action-toolbar');
        if (bar) bar.remove();
        const rot = clone.querySelector('.element-rot-handle');
        if (rot) rot.remove();
        this.selectedElement.parentElement.appendChild(clone);
        this.showToast('Layer berhasil diduplikasi');
      } else {
        this.showToast('Pilih elemen yang ingin diduplikasi');
      }
    });

    // Undo / Redo
    this.btnUndo?.addEventListener('click', () => {
      this.undoCanvasState();
    });

    this.btnRedo?.addEventListener('click', () => {
      this.redoCanvasState();
    });
  }

  private selectCanvasElement(el: HTMLElement, data: DesignData) {
    if (this.selectedElement === el) return;
    this.deselectCanvasElement();

    this.selectedElement = el;
    el.classList.add('selected');

    // Add floating action bar (Screenshot 1: Rotate, Lock, Duplicate, Delete)
    const bar = document.createElement('div');
    bar.className = 'element-action-toolbar';
    bar.innerHTML = `
      <button class="element-action-btn btn-action-lock" title="Kunci / Buka Kunci">🔒</button>
      <button class="element-action-btn btn-action-dup" title="Duplikasi (Ctrl+C, Ctrl+V)">📄</button>
      <button class="element-action-btn btn-action-del" title="Hapus (Delete)">🗑️</button>
      <button class="element-action-btn" title="Lainnya">•••</button>
    `;

    // Hook action buttons
    const btnLock = bar.querySelector('.btn-action-lock') as HTMLElement;
    btnLock?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isLocked = el.contentEditable === 'false';
      el.contentEditable = isLocked ? 'true' : 'false';
      this.showToast(isLocked ? 'Elemen dibuka kuncinya' : 'Elemen dikunci');
    });

    const btnDup = bar.querySelector('.btn-action-dup') as HTMLElement;
    btnDup?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyCanvasElement();
      this.pasteCanvasElement();
    });

    const btnDel = bar.querySelector('.btn-action-del') as HTMLElement;
    btnDel?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSelectedCanvasElement();
    });

    el.appendChild(bar);

    // Add rotation handle
    const rot = document.createElement('div');
    rot.className = 'element-rot-handle';
    rot.innerHTML = '🔄';
    el.appendChild(rot);

    // Sync toolbar state
    const style = window.getComputedStyle(el);
    if (this.toolSizeInput) this.toolSizeInput.value = `${Math.round(parseFloat(style.fontSize))}`;
    if (this.btnBold) this.btnBold.classList.toggle('active', parseInt(style.fontWeight, 10) >= 700);
    if (this.btnItalic) this.btnItalic.classList.toggle('active', style.fontStyle === 'italic');
    if (this.textColorIndicator) this.textColorIndicator.style.background = style.color;

    // Sync font display name
    const family = style.fontFamily || '';
    if (this.toolFontNameDisplay) {
      if (family.includes('Inter')) this.toolFontNameDisplay.textContent = 'Inter';
      else if (family.includes('Plus Jakarta Sans')) this.toolFontNameDisplay.textContent = 'Plus Jakarta Sans';
      else if (family.includes('Playfair')) this.toolFontNameDisplay.textContent = 'Playfair Display';
      else this.toolFontNameDisplay.textContent = 'Montserrat';
    }
  }

  private deselectCanvasElement() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
      const bar = this.selectedElement.querySelector('.element-action-toolbar');
      if (bar) bar.remove();
      const rot = this.selectedElement.querySelector('.element-rot-handle');
      if (rot) rot.remove();
      this.selectedElement = null;
    }
  }

  /**
   * Downloads the live canvas directly as PNG image
   */
  private downloadCanvasPoster(data: DesignData) {
    this.showToast('Menyiapkan file unduhan...');

    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw background
    ctx.fillStyle = data.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw photo
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = data.imageUrl;
    img.onload = () => {
      // Draw image in lower half
      const imgHeight = canvas.height * 0.65;
      const imgY = canvas.height * 0.35;
      ctx.drawImage(img, 0, imgY, canvas.width, imgHeight);

      // Gradient overlay
      const gradient = ctx.createLinearGradient(0, imgY - 80, 0, canvas.height);
      gradient.addColorStop(0, data.colors.bg);
      gradient.addColorStop(0.3, 'rgba(12, 35, 64, 0.4)');
      gradient.addColorStop(1, 'rgba(12, 35, 64, 0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, imgY - 80, canvas.width, imgHeight + 80);

      // Gold wave
      ctx.fillStyle = data.colors.accent;
      ctx.beginPath();
      ctx.moveTo(0, imgY);
      ctx.quadraticCurveTo(canvas.width / 2, imgY + 60, canvas.width, imgY - 20);
      ctx.lineTo(canvas.width, imgY + 10);
      ctx.quadraticCurveTo(canvas.width / 2, imgY + 70, 0, imgY + 10);
      ctx.closePath();
      ctx.fill();

      // Header Text
      ctx.fillStyle = data.colors.text;
      ctx.font = 'bold 58px "Montserrat", sans-serif';
      ctx.fillText(data.headline, 60, 140);

      ctx.fillStyle = data.colors.subtext;
      ctx.font = '28px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(data.subheadline, 60, 210);

      // Trigger download
      const a = document.createElement('a');
      a.download = `wargative-${data.topic.toLowerCase().replace(/\s+/g, '-')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      this.showToast('Desain berhasil diunduh! 🎉');
    };

    img.onerror = () => {
      // Fallback text drawing
      ctx.fillStyle = data.colors.text;
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText(data.headline, 50, 150);
      const a = document.createElement('a');
      a.download = `wargative-${data.topic.toLowerCase()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      this.showToast('Desain diunduh!');
    };
  }

  public showToast(message: string, durationMs = 3000) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  private bindEvents() {
    // New Chat Button
    this.btnNewChat?.addEventListener('click', () => {
      this.createNewSession();
    });

    // Send Button
    this.btnSendPrompt?.addEventListener('click', () => {
      this.handleSendPrompt();
    });

    // Textarea Keydown
    this.chatPromptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendPrompt();
      }
    });

    // Textarea Auto-expand
    this.chatPromptInput?.addEventListener('input', () => {
      this.chatPromptInput.style.height = 'auto';
      this.chatPromptInput.style.height = `${Math.min(this.chatPromptInput.scrollHeight, 140)}px`;
    });

    // STEP 1: Suggestion Cards click puts text into the box chat (Screenshot 1 & 2)
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    suggestionCards.forEach((card) => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-card-prompt') || '';
        if (prompt && this.chatPromptInput) {
          this.chatPromptInput.value = prompt;
          this.chatPromptInput.focus();
          this.chatPromptInput.style.height = 'auto';
          this.chatPromptInput.style.height = `${Math.min(this.chatPromptInput.scrollHeight, 140)}px`;
          this.showToast(`Prompt dipilih: "${prompt}"`);
        }
      });
    });

    // Carousel Arrows
    this.btnCarouselPrev?.addEventListener('click', () => {
      if (this.cardsCarouselTrack) {
        this.cardsCarouselTrack.scrollBy({ left: -280, behavior: 'smooth' });
      }
    });

    this.btnCarouselNext?.addEventListener('click', () => {
      if (this.cardsCarouselTrack) {
        this.cardsCarouselTrack.scrollBy({ left: 280, behavior: 'smooth' });
      }
    });

    this.cardsCarouselTrack?.addEventListener('scroll', () => {
      this.updateCarouselArrows();
    });
    setTimeout(() => this.updateCarouselArrows(), 100);

    // Canvas Close Button
    this.btnCanvasClose?.addEventListener('click', () => {
      this.closeSplitCanvas();
    });

    // Zoom Slider
    this.zoomSlider?.addEventListener('input', () => {
      const zoom = parseInt(this.zoomSlider.value, 10);
      if (this.zoomPercentage) this.zoomPercentage.textContent = `${zoom}%`;
      if (this.canvasPageWrapper) {
        const scale = zoom / 64;
        this.canvasPageWrapper.style.transform = `scale(${scale})`;
      }
    });

    // Quick Tools (+) Popover Toggle
    this.btnQuickTools?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.quickToolsPopover?.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      this.quickToolsPopover?.classList.remove('show');
    });

    // Quick Tools Popover Items
    const popoverItems = document.querySelectorAll('.popover-item');
    popoverItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = item.getAttribute('data-tool');
        if (tool === 'magic-design') {
          this.setMode('magic-design', '🪄 Magic Design');
          this.chatPromptInput.value = 'Buat postingan media sosial.';
          this.chatPromptInput.focus();
        } else if (tool === 'magic-copy') {
          this.setMode('magic-copy', '✍️ Magic Copy');
          this.chatPromptInput.placeholder = 'Tuliskan topik konten / produk untuk copywriting viral...';
        } else if (tool === 'smart-palette') {
          this.setMode('smart-palette', '🎨 Smart Palette');
          this.chatPromptInput.placeholder = 'Tuliskan tema atau mood palet warna...';
        }
        this.quickToolsPopover?.classList.remove('show');
      });
    });

    // Clear Mode Button
    this.btnClearMode?.addEventListener('click', () => {
      this.activeMode = '';
      if (this.activeModePill) this.activeModePill.style.display = 'none';
      if (this.chatPromptInput) {
        this.chatPromptInput.placeholder = 'Tugas apa yang harus kita selesaikan selanjutnya?';
      }
    });

    // Speech-to-Text Microphone (Voice)
    this.btnVoiceMic?.addEventListener('click', () => {
      this.toggleVoiceInput();
    });

    // Canvas Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Arrow Keys)
    document.addEventListener('keydown', (e) => {
      if (this.canvasSidePanel && this.canvasSidePanel.style.display !== 'none') {
        const isCtrl = e.ctrlKey || e.metaKey;

        // Ctrl+Z (Undo)
        if (isCtrl && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.redoCanvasState();
          else this.undoCanvasState();
          return;
        }

        // Ctrl+Y (Redo)
        if (isCtrl && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.redoCanvasState();
          return;
        }

        // Ctrl+C (Copy)
        if (isCtrl && e.key.toLowerCase() === 'c') {
          if (this.selectedElement && (!window.getSelection() || window.getSelection()?.toString().length === 0)) {
            e.preventDefault();
            this.copyCanvasElement();
            return;
          }
        }

        // Ctrl+X (Cut)
        if (isCtrl && e.key.toLowerCase() === 'x') {
          if (this.selectedElement && (!window.getSelection() || window.getSelection()?.toString().length === 0)) {
            e.preventDefault();
            this.cutCanvasElement();
            return;
          }
        }

        // Ctrl+V (Paste)
        if (isCtrl && e.key.toLowerCase() === 'v') {
          if (this.clipboardHtml && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
            e.preventDefault();
            this.pasteCanvasElement();
            return;
          }
        }

        // Delete / Backspace (Delete element)
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedElement) {
          const isTyping = document.activeElement === this.selectedElement;
          if (!isTyping) {
            e.preventDefault();
            this.deleteSelectedCanvasElement();
            return;
          }
        }

        // Arrow Keys (Move 1px or 10px with Shift)
        if (this.selectedElement && e.key.startsWith('Arrow')) {
          const isTyping = document.activeElement === this.selectedElement;
          if (!isTyping) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const curTop = parseFloat(this.selectedElement.style.top) || 0;
            const curLeft = parseFloat(this.selectedElement.style.left) || 0;
            this.selectedElement.style.position = 'relative';

            if (e.key === 'ArrowUp') this.selectedElement.style.top = `${curTop - step}px`;
            if (e.key === 'ArrowDown') this.selectedElement.style.top = `${curTop + step}px`;
            if (e.key === 'ArrowLeft') this.selectedElement.style.left = `${curLeft - step}px`;
            if (e.key === 'ArrowRight') this.selectedElement.style.left = `${curLeft + step}px`;
            return;
          }
        }
      }
    });

    // AI Studio Navigation Item in Sidebar (always resets to home / session 1)
    const aiNavItems = document.querySelectorAll('.nav-item.ai-item');
    aiNavItems.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSplitCanvas();
        if (this.sessions && this.sessions.length > 0) {
          this.activeSessionId = this.sessions[0].id;
        }
        this.renderTabs();
        this.renderActiveView();
        this.showToast('Kembali ke beranda AI Studio');
      });
    });
  }

  private updateCarouselArrows() {
    if (!this.cardsCarouselTrack) return;
    const scrollLeft = this.cardsCarouselTrack.scrollLeft;
    const maxScrollLeft = this.cardsCarouselTrack.scrollWidth - this.cardsCarouselTrack.clientWidth;

    if (this.btnCarouselPrev) {
      if (scrollLeft > 15) {
        this.btnCarouselPrev.style.opacity = '1';
        this.btnCarouselPrev.style.pointerEvents = 'auto';
      } else {
        this.btnCarouselPrev.style.opacity = '0';
        this.btnCarouselPrev.style.pointerEvents = 'none';
      }
    }

    if (this.btnCarouselNext) {
      if (scrollLeft < maxScrollLeft - 15) {
        this.btnCarouselNext.style.opacity = '1';
        this.btnCarouselNext.style.pointerEvents = 'auto';
      } else {
        this.btnCarouselNext.style.opacity = '0';
        this.btnCarouselNext.style.pointerEvents = 'none';
      }
    }
  }

  private setMode(modeKey: string, modeLabel: string) {
    this.activeMode = modeKey;
    if (this.activeModePill && this.activeModeText) {
      this.activeModeText.textContent = modeLabel;
      this.activeModePill.style.display = 'inline-flex';
    }
  }

  private toggleVoiceInput() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.showToast('Browser Anda belum mendukung input suara.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;

      this.btnVoiceMic.classList.add('recording');
      this.showToast('🎙️ Mendengarkan... Silakan bicara.');

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (this.chatPromptInput) {
          this.chatPromptInput.value = (this.chatPromptInput.value ? this.chatPromptInput.value + ' ' : '') + transcript;
          this.chatPromptInput.focus();
        }
        this.btnVoiceMic.classList.remove('recording');
        this.showToast('Suara berhasil direkam!');
      };

      recognition.onerror = () => {
        this.btnVoiceMic.classList.remove('recording');
      };

      recognition.onend = () => {
        this.btnVoiceMic.classList.remove('recording');
      };

      recognition.start();
    } catch {
      this.btnVoiceMic.classList.remove('recording');
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new WargativeAIChatManager();
});
