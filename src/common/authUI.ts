/**
 * Wargative Auth UI Component
 * Provides clean, modern Login & Sign Up modal and navbar user status.
 */

import {
  isConfigured,
  signInUser,
  signUpUser,
  signOutUser,
  getCurrentUser,
  onAuthStateChange
} from './authClient';

export class WargativeAuthUI {
  private modalEl: HTMLElement | null = null;
  private currentMode: 'login' | 'signup' = 'login';

  constructor() {
    this.createModalDOM();
    this.bindEvents();
    this.initUserSessionSync();
  }

  private createModalDOM() {
    // Avoid creating multiple modals
    if (document.getElementById('wargativeAuthModalOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'wargativeAuthModalOverlay';
    overlay.className = 'wargative-auth-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    overlay.innerHTML = `
      <div class="wargative-auth-card" style="
        background: #ffffff;
        border-radius: 20px;
        width: 100%;
        max-width: 420px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        border: 1px solid #e2e8f0;
        overflow: hidden;
        animation: authFadeIn 0.2s ease-out;
      ">
        <!-- Header -->
        <div style="padding: 24px 24px 16px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #7047eb, #9065ff); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px;">
              W
            </div>
            <div>
              <div style="font-weight: 800; font-size: 17px; color: #0f172a; line-height: 1.2;">Wargative Studio</div>
              <div style="font-size: 12px; color: #64748b;" id="authModalSubheading">Masuk ke akun Anda</div>
            </div>
          </div>
          <button id="btnCloseAuthModal" type="button" style="background: none; border: none; font-size: 24px; line-height: 1; color: #94a3b8; cursor: pointer; padding: 4px;">&times;</button>
        </div>

        <!-- Warning if Supabase is not configured yet -->
        <div id="authConfigWarning" style="display: ${isConfigured ? 'none' : 'block'}; margin: 16px 24px 0 24px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; font-size: 12px; color: #92400e; line-height: 1.5;">
          ⚠️ <strong>Supabase Belum Dikonfigurasi:</strong><br />
          Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env.local</code> untuk mengaktifkan koneksi live ke database Anda.
        </div>

        <!-- Tabs -->
        <div style="display: flex; border-bottom: 1px solid #f1f5f9; margin-top: 12px; padding: 0 24px;">
          <button id="btnTabAuthLogin" type="button" style="flex: 1; padding: 12px 0; background: none; border: none; border-bottom: 2.5px solid #7047eb; font-weight: 700; font-size: 14px; color: #7047eb; cursor: pointer;">
            Masuk
          </button>
          <button id="btnTabAuthSignup" type="button" style="flex: 1; padding: 12px 0; background: none; border: none; border-bottom: 2.5px solid transparent; font-weight: 600; font-size: 14px; color: #64748b; cursor: pointer;">
            Daftar Baru
          </button>
        </div>

        <!-- Form Body -->
        <form id="wargativeAuthForm" style="padding: 24px;">
          <!-- Error & Success Alert -->
          <div id="authAlertBox" style="display: none; padding: 11px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 16px; line-height: 1.4;"></div>

          <!-- Email Field -->
          <div style="margin-bottom: 16px; text-align: left;">
            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
              Alamat Email
            </label>
            <input
              type="email"
              id="authInputEmail"
              required
              placeholder="nama@email.com"
              style="width: 100%; padding: 11px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; box-sizing: border-box; outline: none; font-family: inherit;"
            />
          </div>

          <!-- Password Field -->
          <div style="margin-bottom: 20px; text-align: left;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 700; color: #334155;">
                Password
              </label>
              <span style="font-size: 11px; color: #64748b;">Min. 6 karakter</span>
            </div>
            <input
              type="password"
              id="authInputPassword"
              required
              minlength="6"
              placeholder="••••••••"
              style="width: 100%; padding: 11px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; box-sizing: border-box; outline: none; font-family: inherit;"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            id="btnSubmitAuth"
            style="
              width: 100%;
              padding: 13px;
              background: linear-gradient(135deg, #7047eb 0%, #9065ff 100%);
              color: #ffffff;
              border: none;
              border-radius: 10px;
              font-weight: 700;
              font-size: 14px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              box-shadow: 0 4px 12px rgba(112, 71, 235, 0.28);
            "
          >
            <span id="btnSubmitAuthText">Masuk Sekarang</span>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;
  }

  private bindEvents() {
    const overlay = document.getElementById('wargativeAuthModalOverlay');
    const btnClose = document.getElementById('btnCloseAuthModal');
    const tabLogin = document.getElementById('btnTabAuthLogin');
    const tabSignup = document.getElementById('btnTabAuthSignup');
    const form = document.getElementById('wargativeAuthForm') as HTMLFormElement;

    btnClose?.addEventListener('click', () => this.closeModal());

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });

    tabLogin?.addEventListener('click', () => this.switchTab('login'));
    tabSignup?.addEventListener('click', () => this.switchTab('signup'));

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleFormSubmit();
    });
  }

  public openModal(mode: 'login' | 'signup' = 'login') {
    this.switchTab(mode);
    this.clearAlert();
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      setTimeout(() => {
        const emailInput = document.getElementById('authInputEmail') as HTMLInputElement;
        emailInput?.focus();
      }, 100);
    }
  }

  public closeModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      this.clearAlert();
    }
  }

  private switchTab(mode: 'login' | 'signup') {
    this.currentMode = mode;
    const tabLogin = document.getElementById('btnTabAuthLogin');
    const tabSignup = document.getElementById('btnTabAuthSignup');
    const btnText = document.getElementById('btnSubmitAuthText');
    const subHeading = document.getElementById('authModalSubheading');

    this.clearAlert();

    if (mode === 'login') {
      if (tabLogin) {
        tabLogin.style.borderBottomColor = '#7047eb';
        tabLogin.style.color = '#7047eb';
        tabLogin.style.fontWeight = '700';
      }
      if (tabSignup) {
        tabSignup.style.borderBottomColor = 'transparent';
        tabSignup.style.color = '#64748b';
        tabSignup.style.fontWeight = '600';
      }
      if (btnText) btnText.textContent = 'Masuk Sekarang';
      if (subHeading) subHeading.textContent = 'Masuk ke akun Anda';
    } else {
      if (tabSignup) {
        tabSignup.style.borderBottomColor = '#7047eb';
        tabSignup.style.color = '#7047eb';
        tabSignup.style.fontWeight = '700';
      }
      if (tabLogin) {
        tabLogin.style.borderBottomColor = 'transparent';
        tabLogin.style.color = '#64748b';
        tabLogin.style.fontWeight = '600';
      }
      if (btnText) btnText.textContent = 'Buat Akun Baru';
      if (subHeading) subHeading.textContent = 'Daftarkan akun multi-user Anda';
    }
  }

  private showAlert(message: string, isError = true) {
    const alertBox = document.getElementById('authAlertBox');
    if (!alertBox) return;

    alertBox.style.display = 'block';
    if (isError) {
      alertBox.style.background = '#fef2f2';
      alertBox.style.color = '#991b1b';
      alertBox.style.border = '1px solid #fee2e2';
      alertBox.innerHTML = `⚠️ ${message}`;
    } else {
      alertBox.style.background = '#f0fdf4';
      alertBox.style.color = '#166534';
      alertBox.style.border = '1px solid #dcfce7';
      alertBox.innerHTML = `✅ ${message}`;
    }
  }

  private clearAlert() {
    const alertBox = document.getElementById('authAlertBox');
    if (alertBox) alertBox.style.display = 'none';
  }

  private async handleFormSubmit() {
    const emailEl = document.getElementById('authInputEmail') as HTMLInputElement;
    const passEl = document.getElementById('authInputPassword') as HTMLInputElement;
    const btnSubmit = document.getElementById('btnSubmitAuth') as HTMLButtonElement;
    const btnText = document.getElementById('btnSubmitAuthText');

    if (!emailEl || !passEl) return;

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      this.showAlert('Harap isi alamat email dan password.');
      return;
    }

    if (password.length < 6) {
      this.showAlert('Password minimal 6 karakter.');
      return;
    }

    if (btnSubmit) btnSubmit.disabled = true;
    if (btnText) btnText.textContent = 'Memproses...';

    try {
      if (this.currentMode === 'login') {
        const res = await signInUser(email, password);
        if (res.error) {
          this.showAlert(res.error, true);
        } else {
          this.showAlert(`Berhasil masuk! Selamat datang, ${res.user?.email}`, false);
          setTimeout(() => {
            this.closeModal();
            this.syncNavUserHeader();
          }, 1000);
        }
      } else {
        const res = await signUpUser(email, password);
        if (res.error) {
          this.showAlert(res.error, true);
        } else {
          if (res.session) {
            this.showAlert(`Pendaftaran berhasil! Anda telah masuk sebagai ${res.user?.email}.`, false);
            setTimeout(() => {
              this.closeModal();
              this.syncNavUserHeader();
            }, 1000);
          } else {
            this.showAlert(`Pendaftaran berhasil! Cek email Anda (${email}) untuk verifikasi akun, lalu login.`, false);
          }
        }
      }
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
      if (btnText) {
        btnText.textContent = this.currentMode === 'login' ? 'Masuk Sekarang' : 'Buat Akun Baru';
      }
    }
  }

  private initUserSessionSync() {
    this.syncNavUserHeader();

    onAuthStateChange(() => {
      this.syncNavUserHeader();
    });
  }

  public async syncNavUserHeader() {
    const user = await getCurrentUser();

    // Look for target container in header/navbar
    const containers = document.querySelectorAll('.wargative-user-auth-slot');

    containers.forEach((container) => {
      if (user) {
        const initial = (user.email || 'U')[0].toUpperCase();
        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 5px 12px; border-radius: 999px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background: #7047eb; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;">
                ${initial}
              </div>
              <span style="font-size: 12.5px; font-weight: 700; color: #1e293b; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${user.email}
              </span>
            </div>
            <button
              id="btnAuthHeaderLogout"
              type="button"
              style="padding: 7px 12px; font-size: 12px; font-weight: 700; background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
              title="Keluar dari akun Wargative"
            >
              Keluar
            </button>
          </div>
        `;

        container.querySelector('#btnAuthHeaderLogout')?.addEventListener('click', async () => {
          await signOutUser();
          this.syncNavUserHeader();
          window.location.reload();
        });
      } else {
        container.innerHTML = `
          <button
            id="btnAuthHeaderLogin"
            type="button"
            style="padding: 8px 16px; font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #7047eb 0%, #9065ff 100%); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(112, 71, 235, 0.2);"
          >
            <span>👤</span>
            <span>Masuk / Daftar</span>
          </button>
        `;

        container.querySelector('#btnAuthHeaderLogin')?.addEventListener('click', () => {
          this.openModal('login');
        });
      }
    });
  }
}

// Singleton global export
export const authUI = new WargativeAuthUI();
