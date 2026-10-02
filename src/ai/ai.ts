/**
 * Wargative AI - Frontend Logic powered by Gemini 3.8 Flash
 */

import {
  generateMagicCopy,
  generateDesignConcept,
  generateSmartPalette,
  chatWithCopilot,
  ChatMessage,
  DesignConcept,
  ColorPaletteResult
} from '../common/geminiService';

import { saveProjectMeta, ProjectItem } from '../common/projectStore';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabButtons = document.querySelectorAll('.ai-tab-btn');
  const toolPanels = document.querySelectorAll('.ai-tool-panel');
  const toastContainer = document.getElementById('toastContainer') as HTMLElement;

  // Magic Design Elements
  const designPromptInput = document.getElementById('designPromptInput') as HTMLTextAreaElement;
  const btnGenerateDesign = document.getElementById('btnGenerateDesign') as HTMLButtonElement;
  const designResultBox = document.getElementById('designResultBox') as HTMLElement;

  // Magic Write Elements
  const copyPromptInput = document.getElementById('copyPromptInput') as HTMLTextAreaElement;
  const copyTypeSelect = document.getElementById('copyTypeSelect') as HTMLSelectElement;
  const copyToneSelect = document.getElementById('copyToneSelect') as HTMLSelectElement;
  const btnGenerateCopy = document.getElementById('btnGenerateCopy') as HTMLButtonElement;
  const copyResultBox = document.getElementById('copyResultBox') as HTMLElement;

  // Smart Palette Elements
  const paletteThemeInput = document.getElementById('paletteThemeInput') as HTMLInputElement;
  const btnGeneratePalette = document.getElementById('btnGeneratePalette') as HTMLButtonElement;
  const paletteResultBox = document.getElementById('paletteResultBox') as HTMLElement;

  // Chat Co-Pilot Elements
  const chatMessagesBox = document.getElementById('chatMessagesBox') as HTMLElement;
  const chatInputField = document.getElementById('chatInputField') as HTMLInputElement;
  const btnSendChat = document.getElementById('btnSendChat') as HTMLButtonElement;

  // Suggestion Chips
  const promptChips = document.querySelectorAll('.prompt-chip');

  // Chat State
  const chatHistory: ChatMessage[] = [];

  // Toast Notification
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

  // Tab Switching
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      toolPanels.forEach((panel) => {
        const p = panel as HTMLElement;
        if (p.id === `panel-${tabId}`) {
          p.style.display = 'block';
        } else {
          p.style.display = 'none';
        }
      });
    });
  });

  // Suggestion Chips Click
  promptChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-prompt') || chip.textContent || '';
      const targetId = chip.getAttribute('data-target');

      if (targetId === 'design' && designPromptInput) {
        designPromptInput.value = text;
        designPromptInput.focus();
      } else if (targetId === 'copy' && copyPromptInput) {
        copyPromptInput.value = text;
        copyPromptInput.focus();
      } else if (targetId === 'palette' && paletteThemeInput) {
        paletteThemeInput.value = text;
        paletteThemeInput.focus();
      } else if (targetId === 'chat' && chatInputField) {
        chatInputField.value = text;
        chatInputField.focus();
      }
    });
  });

  // ============================================================================
  // 1. Magic Design Generator
  // ============================================================================
  btnGenerateDesign?.addEventListener('click', async () => {
    const prompt = designPromptInput.value.trim();
    if (!prompt) {
      showToast('Mohon masukkan deskripsi konsep desain Anda');
      designPromptInput.focus();
      return;
    }

    btnGenerateDesign.disabled = true;
    btnGenerateDesign.innerHTML = `<span>⟳</span><span>Merancang Desain dengan Gemini 3.8 Flash...</span>`;

    try {
      const concept: DesignConcept = await generateDesignConcept(prompt);
      renderDesignConceptResult(concept);
      showToast('Konsep desain berhasil dirancang! 🪄');
    } catch (err: any) {
      console.error('Magic Design error:', err);
      showToast(`Gagal merancang desain: ${err.message}`);
    } finally {
      btnGenerateDesign.disabled = false;
      btnGenerateDesign.innerHTML = `<span>🪄</span><span>Rancang Konsep Desain</span>`;
    }
  });

  function renderDesignConceptResult(concept: DesignConcept) {
    if (!designResultBox) return;

    const paletteHtml = concept.colorPalette
      .map(
        (c) => `
        <div style="display:inline-flex; align-items:center; gap:6px; background:#fff; padding:4px 10px; border-radius:9999px; border:1px solid #e2e8f0; font-size:12px;">
          <span style="width:14px; height:14px; border-radius:50%; background:${c.hex}; border:1px solid #cbd5e1; display:inline-block;"></span>
          <span style="font-weight:700;">${c.hex}</span>
          <span style="color:#64748b; font-size:11px;">(${c.name})</span>
        </div>
      `
      )
      .join('');

    designResultBox.innerHTML = `
      <div class="ai-result-card">
        <div class="result-header">
          <div class="result-badge">
            <span>🪄</span>
            <span>Konsep Desain: ${concept.title} (${concept.width} × ${concept.height} px)</span>
          </div>
          <div class="result-actions">
            <button class="btn-copy-result" id="btnCopyConcept">
              <span>📋</span> Salin Teks
            </button>
            <button class="btn-open-studio" id="btnOpenConceptStudio">
              <span>🎨</span> Buka di Wargative Studio
            </button>
          </div>
        </div>

        <div class="result-body">
          <p><strong>🎯 Judul Utama (Headline):</strong><br>${concept.headline}</p>
          <p style="margin-top:10px;"><strong>💡 Sub-Judul:</strong><br>${concept.subheadline}</p>
          <p style="margin-top:10px;"><strong>📝 Teks Konten:</strong><br>${concept.bodyText}</p>
          <p style="margin-top:10px;"><strong>🔘 Tombol Call-to-Action:</strong><br>${concept.callToAction}</p>
          
          <div style="margin-top:14px;">
            <p style="margin-bottom:6px;"><strong>🎨 Rekomendasi Palet Warna:</strong></p>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">${paletteHtml}</div>
          </div>

          <p style="margin-top:14px; padding:10px 14px; background:#ede9fe; border-radius:8px; font-size:13px; color:#5b21b6;">
            <strong>✨ Saran Tata Letak Visual:</strong> ${concept.visualAdvice}
          </p>
        </div>
      </div>
    `;

    designResultBox.style.display = 'block';

    // Copy Concept Text
    document.getElementById('btnCopyConcept')?.addEventListener('click', () => {
      const fullText = `Headline: ${concept.headline}\nSubheadline: ${concept.subheadline}\nBody: ${concept.bodyText}\nCTA: ${concept.callToAction}`;
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('Konsep teks disalin ke clipboard! 📋');
      });
    });

    // Open in Wargative Studio
    document.getElementById('btnOpenConceptStudio')?.addEventListener('click', () => {
      const newId = 'proj_' + Date.now();
      const newProject: ProjectItem = {
        id: newId,
        title: concept.title,
        format: `${concept.width} x ${concept.height} px`,
        width: concept.width,
        height: concept.height,
        updatedAt: Date.now(),
        thumbnailColor: concept.colorPalette[0]?.hex || '#7047eb',
        thumbnailIcon: '🪄',
        badgeText: 'AI Design',
        badgeBg: '#7047eb',
        badgeIconType: 'camera'
      };

      saveProjectMeta(newProject);
      showToast('Membuka konsep desain di Wargative Studio... 🎨');

      setTimeout(() => {
        window.location.href = `./index.html?id=${newId}&w=${concept.width}&h=${concept.height}&name=${encodeURIComponent(
          concept.headline
        )}`;
      }, 300);
    });
  }

  // ============================================================================
  // 2. Magic Write & Copywriter
  // ============================================================================
  btnGenerateCopy?.addEventListener('click', async () => {
    const topic = copyPromptInput.value.trim();
    if (!topic) {
      showToast('Mohon masukkan topik / deskripsi produk Anda');
      copyPromptInput.focus();
      return;
    }

    const type = (copyTypeSelect.value as any) || 'instagram';
    const tone = (copyToneSelect.value as any) || 'catchy';

    btnGenerateCopy.disabled = true;
    btnGenerateCopy.innerHTML = `<span>⟳</span><span>Menulis Copy dengan Gemini 3.8 Flash...</span>`;

    try {
      const copy = await generateMagicCopy({ topic, type, tone, language: 'id' });
      renderCopyResult(copy, type);
      showToast('Copywriting siap digunakan! ✍️');
    } catch (err: any) {
      console.error('Magic Write error:', err);
      showToast(`Gagal menulis copy: ${err.message}`);
    } finally {
      btnGenerateCopy.disabled = false;
      btnGenerateCopy.innerHTML = `<span>✍️</span><span>Buat Copywriting</span>`;
    }
  });

  function renderCopyResult(text: string, type: string) {
    if (!copyResultBox) return;

    copyResultBox.innerHTML = `
      <div class="ai-result-card">
        <div class="result-header">
          <div class="result-badge">
            <span>✍️</span>
            <span style="text-transform: capitalize;">Hasil Magic Write (${type})</span>
          </div>
          <div class="result-actions">
            <button class="btn-copy-result" id="btnCopyWriting">
              <span>📋</span> Salin Semua
            </button>
            <button class="btn-open-studio" id="btnCreateDesignWithCopy">
              <span>🎨</span> Buat Desain dengan Teks Ini
            </button>
          </div>
        </div>

        <div class="result-body">${text}</div>
      </div>
    `;

    copyResultBox.style.display = 'block';

    document.getElementById('btnCopyWriting')?.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Naskah copy berhasil disalin ke clipboard! 📋');
      });
    });

    document.getElementById('btnCreateDesignWithCopy')?.addEventListener('click', () => {
      const newId = 'proj_' + Date.now();
      const firstLine = text.split('\n')[0].replace(/[*#]/g, '').trim().slice(0, 30) || 'AI Copy Design';

      const newProject: ProjectItem = {
        id: newId,
        title: firstLine,
        format: 'Instagram Post (1:1)',
        width: 1080,
        height: 1080,
        updatedAt: Date.now(),
        thumbnailColor: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
        thumbnailIcon: '✍️',
        badgeText: 'AI Copy',
        badgeBg: '#ec4899',
        badgeIconType: 'camera'
      };

      saveProjectMeta(newProject);
      showToast('Membuka studio dengan teks copy... 🎨');

      setTimeout(() => {
        window.location.href = `./index.html?id=${newId}&w=1080&h=1080&name=${encodeURIComponent(firstLine)}`;
      }, 300);
    });
  }

  // ============================================================================
  // 3. Smart Palette Generator
  // ============================================================================
  btnGeneratePalette?.addEventListener('click', async () => {
    const theme = paletteThemeInput.value.trim();
    if (!theme) {
      showToast('Mohon masukkan tema palet warna');
      paletteThemeInput.focus();
      return;
    }

    btnGeneratePalette.disabled = true;
    btnGeneratePalette.innerHTML = `<span>⟳</span><span>Meracik Palet dengan Gemini 3.8 Flash...</span>`;

    try {
      const result: ColorPaletteResult = await generateSmartPalette(theme);
      renderPaletteResult(result);
      showToast('Palet warna berhasil diracik! 🎨');
    } catch (err: any) {
      console.error('Palette error:', err);
      showToast(`Gagal meracik palet: ${err.message}`);
    } finally {
      btnGeneratePalette.disabled = false;
      btnGeneratePalette.innerHTML = `<span>🎨</span><span>Racik Palet Warna</span>`;
    }
  });

  function renderPaletteResult(result: ColorPaletteResult) {
    if (!paletteResultBox) return;

    const swatchesHtml = result.colors
      .map(
        (c) => `
        <div class="palette-swatch-item" onclick="navigator.clipboard.writeText('${c.hex}'); window.showToast('Hex ${c.hex} disalin!');">
          <div class="swatch-color-box" style="background: ${c.hex};"></div>
          <div class="swatch-info">
            <span class="swatch-hex">${c.hex}</span>
            <span class="swatch-name">${c.name} • ${c.role}</span>
          </div>
        </div>
      `
      )
      .join('');

    paletteResultBox.innerHTML = `
      <div class="ai-result-card">
        <div class="result-header">
          <div class="result-badge">
            <span>🎨</span>
            <span>Palet: ${result.themeName}</span>
          </div>
          <div class="result-actions">
            <button class="btn-copy-result" id="btnCopyGradient">
              <span>🌈</span> Salin CSS Gradient
            </button>
          </div>
        </div>

        <p style="font-size:13px; color:#475569;">${result.description}</p>
        
        <div style="height:36px; border-radius:8px; background:${result.gradient}; margin-top:8px;" title="${result.gradient}"></div>

        <div class="palette-swatches-grid">
          ${swatchesHtml}
        </div>
        <span style="font-size:11px; color:#94a3b8; margin-top:4px;">Klik kotak warna untuk menyalin kode HEX</span>
      </div>
    `;

    paletteResultBox.style.display = 'block';

    document.getElementById('btnCopyGradient')?.addEventListener('click', () => {
      navigator.clipboard.writeText(`background: ${result.gradient};`).then(() => {
        showToast('CSS Gradient disalin ke clipboard! 🌈');
      });
    });
  }

  // ============================================================================
  // 4. AI Design Co-Pilot Live Chat
  // ============================================================================
  async function handleSendChat() {
    const text = chatInputField.value.trim();
    if (!text) return;

    chatInputField.value = '';

    // Append user message to UI
    appendChatBubble('user', text);

    // Append thinking bubble
    const thinkingEl = appendChatBubble('model', '✨ Wargative AI sedang berpikir...');

    btnSendChat.disabled = true;

    try {
      const reply = await chatWithCopilot(chatHistory, text);
      thinkingEl.innerHTML = reply.replace(/\n/g, '<br>');

      // Update history
      chatHistory.push(
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: reply }] }
      );
    } catch (err: any) {
      thinkingEl.textContent = `Maaf, terjadi kesalahan: ${err.message}`;
    } finally {
      btnSendChat.disabled = false;
      chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
    }
  }

  function appendChatBubble(role: 'user' | 'model', content: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = content.replace(/\n/g, '<br>');
    chatMessagesBox.appendChild(bubble);
    chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
    return bubble;
  }

  btnSendChat?.addEventListener('click', handleSendChat);
  chatInputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendChat();
  });

  // Global toast function for inline swatch clicks
  (window as any).showToast = showToast;
});
