/**
 * Wargative AI Magic Studio - Multi-Chat & Gemini 3.8 Flash Assistant
 */

import { callGemini } from '../common/geminiService';
import { saveProjectMeta, ProjectItem } from '../common/projectStore';

export interface ChatMessageItem {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  conceptData?: {
    title: string;
    width: number;
    height: number;
    headline: string;
    subheadline?: string;
    bodyText?: string;
    callToAction?: string;
    colors?: string[];
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessageItem[];
}

const STORAGE_KEY = 'WARGATIVE_AI_SESSIONS_V2';

class WargativeAIChatManager {
  private sessions: ChatSession[] = [];
  private activeSessionId: string = '';
  private isThinking: boolean = false;
  private activeMode: string = '';

  // DOM Elements
  private chatTabsList!: HTMLElement;
  private btnNewChat!: HTMLButtonElement;
  private aiCanvasArea!: HTMLElement;
  private aiWelcomeView!: HTMLElement;
  private aiChatStreamView!: HTMLElement;
  private chatMessagesContainer!: HTMLElement;
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

  constructor() {
    this.initDOM();
    this.loadSessions();
    this.bindEvents();
    this.renderTabs();
    this.renderActiveView();
  }

  private initDOM() {
    this.chatTabsList = document.getElementById('chatTabsList') as HTMLElement;
    this.btnNewChat = document.getElementById('btnNewChat') as HTMLButtonElement;
    this.aiCanvasArea = document.getElementById('aiCanvasArea') as HTMLElement;
    this.aiWelcomeView = document.getElementById('aiWelcomeView') as HTMLElement;
    this.aiChatStreamView = document.getElementById('aiChatStreamView') as HTMLElement;
    this.chatMessagesContainer = document.getElementById('chatMessagesContainer') as HTMLElement;
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
      // Reset single session to blank
      const session = this.sessions[0];
      session.title = 'Obrolan baru';
      session.messages = [];
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
      return;
    }

    if (this.aiWelcomeView) this.aiWelcomeView.style.display = 'none';
    if (this.aiChatStreamView) this.aiChatStreamView.style.display = 'flex';

    this.renderMessageStream(session);
  }

  private renderMessageStream(session: ChatSession) {
    if (!this.chatMessagesContainer) return;
    this.chatMessagesContainer.innerHTML = '';

    session.messages.forEach((msg, idx) => {
      const row = document.createElement('div');
      row.className = `chat-message-row ${msg.role}`;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.innerHTML = msg.role === 'user' ? 'W' : '✨';
      row.appendChild(avatar);

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.innerHTML = this.formatMarkdown(msg.text);

      // Add actions bar for model messages
      if (msg.role === 'model') {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'message-actions-bar';

        // Copy button
        const btnCopy = document.createElement('button');
        btnCopy.className = 'btn-msg-action';
        btnCopy.innerHTML = '📋 Salin';
        btnCopy.addEventListener('click', () => {
          navigator.clipboard.writeText(msg.text);
          this.showToast('Jawaban disalin ke clipboard!');
        });
        actionsBar.appendChild(btnCopy);

        // Open in Wargative Studio button if concept detected or suggested
        if (msg.conceptData || this.detectDesignIntent(msg.text)) {
          const btnStudio = document.createElement('button');
          btnStudio.className = 'btn-msg-action btn-open-studio';
          btnStudio.innerHTML = '🪄 Buka di Wargative Studio';
          btnStudio.addEventListener('click', () => {
            this.openInStudio(msg);
          });
          actionsBar.appendChild(btnStudio);
        }

        bubble.appendChild(actionsBar);
      }

      row.appendChild(bubble);
      this.chatMessagesContainer.appendChild(row);
    });

    // Scroll to bottom
    this.scrollToBottom();
  }

  private detectDesignIntent(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('headline') ||
      lower.includes('palet warna') ||
      lower.includes('layout') ||
      lower.includes('poster') ||
      lower.includes('instagram') ||
      lower.includes('presentasi') ||
      lower.includes('banner')
    );
  }

  private openInStudio(msg: ChatMessageItem) {
    const title = msg.conceptData?.title || 'Wargative AI Concept';
    const width = msg.conceptData?.width || 1080;
    const height = msg.conceptData?.height || 1080;

    const projectId = `proj-ai-${Date.now()}`;
    const projectItem: ProjectItem = {
      id: projectId,
      title: title,
      format: `${width} × ${height} px`,
      width: width,
      height: height,
      updatedAt: Date.now(),
      thumbnailColor: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
      thumbnailIcon: '✨',
      badgeText: 'AI Concept',
      badgeBg: '#8b5cf6',
      badgeIconType: 'star'
    };

    saveProjectMeta(projectItem);
    this.showToast('Membuka konsep di Wargative Studio...');
    setTimeout(() => {
      window.location.href = `./index.html?projectId=${projectId}&title=${encodeURIComponent(title)}&width=${width}&height=${height}`;
    }, 400);
  }

  private formatMarkdown(raw: string): string {
    if (!raw) return '';

    let html = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Blockquote
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Bullet lists
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');

    // Clean multiple linebreaks into paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map((p) => {
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<blockquote')) {
          return p;
        }
        return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
      })
      .join('');

    return html;
  }

  private scrollToBottom() {
    if (this.aiCanvasArea) {
      setTimeout(() => {
        this.aiCanvasArea.scrollTop = this.aiCanvasArea.scrollHeight;
      }, 50);
    }
  }

  public async handleSendPrompt(customText?: string) {
    if (this.isThinking) return;

    const text = (customText || this.chatPromptInput.value || '').trim();
    if (!text) return;

    const session = this.getActiveSession();

    // Auto rename session title on first user message if default
    if (session.title === 'Obrolan baru' || !session.title) {
      session.title = this.generateShortTitle(text);
      this.renderTabs();
    }

    // Add user message
    const userMsg: ChatMessageItem = {
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    session.messages.push(userMsg);
    this.saveSessions();

    // Clear input
    this.chatPromptInput.value = '';
    this.chatPromptInput.style.height = 'auto';

    // Show stream view
    this.renderActiveView();

    // Add thinking indicator
    this.isThinking = true;
    this.showThinkingBubble();

    try {
      let systemPrompt = `Kamu adalah Wargative AI Magic Studio Co-Pilot, asisten desain grafis kelas dunia ditenagai Gemini 3.8 Flash di dalam aplikasi Wargative Editor (Canva Clone).
Karaktermu: Kreatif, ramah, visioner, to-the-point, dan berorientasi hasil.
Format jawabanmu dengan Markdown yang indah, sertakan poin-poin terstruktur, rekomendasi palet warna (HEX), saran tipografi, hook copywriting, dan struktur layout jika relevan.`;

      if (this.activeMode === 'magic-design') {
        systemPrompt += `\nFOKUS MODE: Magic Design. Rancang struktur visual lengkap (Headline, Subheadline, Body, Call to Action, Warna HEX, Dimensi piksel, Saran elemen layout).`;
      } else if (this.activeMode === 'magic-copy') {
        systemPrompt += `\nFOKUS MODE: Magic Copywriting. Buatkan variasi teks iklan, caption medsos viral, dan slogan persuasif.`;
      } else if (this.activeMode === 'smart-palette') {
        systemPrompt += `\nFOKUS MODE: Smart Palette. Berikan 5 kode HEX harmonis lengkap dengan nama dan peran warna serta CSS gradient.`;
      }

      const responseText = await callGemini(text, systemPrompt);

      // Remove thinking bubble
      this.hideThinkingBubble();

      // Add Model Message
      const modelMsg: ChatMessageItem = {
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };

      session.messages.push(modelMsg);
      this.saveSessions();

      this.renderMessageStream(session);
    } catch (err: any) {
      this.hideThinkingBubble();
      this.showToast(`Error: ${err.message || 'Gagal memproses permintaan'}`);

      const errorMsg: ChatMessageItem = {
        role: 'model',
        text: `⚠️ Maaf, terjadi kendala saat menghubungi Gemini 3.8 Flash. Silakan coba lagi.\n\n*Detail: ${err.message}*`,
        timestamp: Date.now()
      };
      session.messages.push(errorMsg);
      this.saveSessions();
      this.renderMessageStream(session);
    } finally {
      this.isThinking = false;
    }
  }

  private generateShortTitle(prompt: string): string {
    const clean = prompt.replace(/[^\w\s]/gi, '').trim();
    const words = clean.split(/\s+/);
    if (words.length <= 3) return clean.slice(0, 24);
    return words.slice(0, 3).join(' ') + '...';
  }

  private showThinkingBubble() {
    if (!this.chatMessagesContainer) return;
    const thinkingRow = document.createElement('div');
    thinkingRow.className = 'chat-message-row model thinking-row';
    thinkingRow.id = 'activeThinkingBubble';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '✨';
    thinkingRow.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble thinking-bubble';
    bubble.innerHTML = `
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <span style="font-size: 13px; color: #8b5cf6; margin-left: 6px; font-weight: 600;">Gemini 3.8 Flash sedang merancang...</span>
    `;
    thinkingRow.appendChild(bubble);

    this.chatMessagesContainer.appendChild(thinkingRow);
    this.scrollToBottom();
  }

  private hideThinkingBubble() {
    const existing = document.getElementById('activeThinkingBubble');
    if (existing) existing.remove();
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
      this.chatPromptInput.style.height = `${Math.min(this.chatPromptInput.scrollHeight, 160)}px`;
    });

    // Suggestion Cards
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    suggestionCards.forEach((card) => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt') || '';
        if (prompt) {
          this.handleSendPrompt(prompt);
        }
      });
    });

    // Carousel Prev & Next Arrow Buttons
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

    // Track scroll listener to toggle arrow visibility
    this.cardsCarouselTrack?.addEventListener('scroll', () => {
      this.updateCarouselArrows();
    });

    // Initial check
    setTimeout(() => this.updateCarouselArrows(), 100);

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
          this.chatPromptInput.placeholder = 'Deskripsikan poster/desain yang ingin kamu buat (misal: Poster Coffee Shop Grand Opening)...';
        } else if (tool === 'magic-copy') {
          this.setMode('magic-copy', '✍️ Magic Copy');
          this.chatPromptInput.placeholder = 'Tuliskan topik konten / produk untuk dibuatkan copywriting viral...';
        } else if (tool === 'smart-palette') {
          this.setMode('smart-palette', '🎨 Smart Palette');
          this.chatPromptInput.placeholder = 'Tuliskan tema atau mood palet warna (misal: Sunset Cyberpunk Tokyo)...';
        }
        this.quickToolsPopover?.classList.remove('show');
        this.chatPromptInput.focus();
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
  }

  private updateCarouselArrows() {
    if (!this.cardsCarouselTrack) return;
    const scrollLeft = this.cardsCarouselTrack.scrollLeft;
    const maxScrollLeft = this.cardsCarouselTrack.scrollWidth - this.cardsCarouselTrack.clientWidth;

    // Toggle Left Arrow
    if (this.btnCarouselPrev) {
      if (scrollLeft > 15) {
        this.btnCarouselPrev.style.opacity = '1';
        this.btnCarouselPrev.style.pointerEvents = 'auto';
      } else {
        this.btnCarouselPrev.style.opacity = '0';
        this.btnCarouselPrev.style.pointerEvents = 'none';
      }
    }

    // Toggle Right Arrow
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
