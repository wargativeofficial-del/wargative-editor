/**
 * Planner Store - Manages scheduled social media posts and calendar events
 * for Wargative Content Planner (Canva Planner Clone)
 */

export type SocialPlatformId = 'instagram' | 'tiktok' | 'facebook' | 'threads' | 'youtube' | 'twitter' | 'pinterest';

export interface SocialAccountConnection {
  channelId: SocialPlatformId;
  name: string;
  handle: string;
  connected: boolean;
  avatarUrl?: string;
  accessToken?: string;
  accountId?: string;
  apiKey?: string;
  connectedAt?: number;
}

export interface ScheduledPost {
  id: string;
  projectId?: string;
  projectTitle: string;
  projectFormat?: string;
  thumbnailColor?: string;
  thumbnailIcon?: string;
  previewType?: string;
  imageUrl?: string;
  channel: SocialPlatformId;
  channelName: string;
  channelIcon: string;
  channelColor: string;
  dateStr: string; // Format: YYYY-MM-DD, e.g. "2026-10-02"
  timeStr: string; // Format: HH:MM, e.g. "14:40"
  caption: string;
  status: 'scheduled' | 'published';
  createdAt: number;
}

export interface CalendarHoliday {
  dateStr: string; // Format: YYYY-MM-DD
  title: string;
  category: 'holiday' | 'event' | 'awareness';
}

const STORAGE_POSTS_KEY = 'wargative_scheduled_posts';
const STORAGE_CONNECTIONS_KEY = 'wargative_social_connections';
const STORAGE_VER_KEY = 'wargative_planner_ver';
const CURRENT_VERSION = '1.3';

// Preset holidays and events matching Canva Content Planner screenshot (Image 1)
const DEFAULT_HOLIDAYS: CalendarHoliday[] = [
  { dateStr: '2026-09-30', title: 'Hari Podcast Internasional', category: 'event' },
  { dateStr: '2026-10-02', title: 'Hari Senyum Sedunia', category: 'awareness' },
  { dateStr: '2026-10-04', title: 'Hari Hewan Sedunia', category: 'awareness' },
  { dateStr: '2026-10-31', title: 'Halloween', category: 'holiday' },
  { dateStr: '2026-10-01', title: 'Hari Kopi Internasional', category: 'event' },
  { dateStr: '2026-10-05', title: 'Hari Guru Sedunia', category: 'awareness' },
  { dateStr: '2026-10-10', title: 'Hari Kesehatan Mental Sedunia', category: 'awareness' },
  { dateStr: '2026-10-24', title: 'Hari PBB', category: 'holiday' },
  { dateStr: '2026-10-28', title: 'Hari Sumpah Pemuda', category: 'holiday' }
];

// Initial default scheduled posts matching the Canva planner screenshot
const DEFAULT_POSTS: ScheduledPost[] = [
  {
    id: 'post_default_1',
    projectId: 'proj_marketing_ad',
    projectTitle: 'Copy of Sahabat Film',
    projectFormat: 'Instagram Post (4:5)',
    thumbnailColor: '#10b981',
    thumbnailIcon: '🛍️',
    previewType: 'green',
    channel: 'instagram',
    channelName: 'Instagram Business',
    channelIcon: '📸',
    channelColor: '#e1306c',
    dateStr: '2026-10-02',
    timeStr: '14:40',
    caption: 'Teaser perdana Sahabat Film sudah tayang! Jangan lewatkan cerita seru dan inspiratif akhir pekan ini. ✨🎬 #SahabatFilm #Wargative',
    status: 'scheduled',
    createdAt: Date.now() - 3600000
  },
  {
    id: 'post_default_2',
    projectId: 'proj_sahabat_horor',
    projectTitle: 'Sahabat Horor - Teaser Poster',
    projectFormat: 'Instagram Post (4:5)',
    thumbnailColor: '#18181b',
    thumbnailIcon: '🎬',
    previewType: 'horor',
    channel: 'facebook',
    channelName: 'Halaman Facebook',
    channelIcon: '📘',
    channelColor: '#1877f2',
    dateStr: '2026-10-14',
    timeStr: '19:00',
    caption: 'Malam jumat bersama Sahabat Horor. Siap untuk mengungkap misteri berikutnya? 👻🕯️',
    status: 'scheduled',
    createdAt: Date.now() - 7200000
  },
  {
    id: 'post_default_3',
    projectId: 'proj_sahabat_pedia',
    projectTitle: 'Sahabat Pedia - Trivia Belajar',
    projectFormat: 'Instagram Post (1:1)',
    thumbnailColor: '#09090b',
    thumbnailIcon: '📚',
    previewType: 'pedia',
    channel: 'twitter',
    channelName: 'X (Twitter)',
    channelIcon: '𝕏',
    channelColor: '#000000',
    dateStr: '2026-10-21',
    timeStr: '10:15',
    caption: 'Tahukah kamu? Belajar 20 menit secara konsisten setiap hari lebih efektif daripada belajar semalaman sebelum ujian! 💡🧠',
    status: 'scheduled',
    createdAt: Date.now() - 10800000
  }
];

export function getScheduledPosts(): ScheduledPost[] {
  try {
    const ver = localStorage.getItem(STORAGE_VER_KEY);
    const raw = localStorage.getItem(STORAGE_POSTS_KEY);

    if (ver !== CURRENT_VERSION || !raw) {
      let userCreated: ScheduledPost[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            userCreated = parsed.filter(
              (p: ScheduledPost) => !DEFAULT_POSTS.some((dp) => dp.id === p.id)
            );
          }
        } catch (e) {}
      }

      const merged = [...userCreated, ...DEFAULT_POSTS];
      localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(merged));
      localStorage.setItem(STORAGE_VER_KEY, CURRENT_VERSION);
      return merged;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_POSTS;
  } catch (e) {
    console.error('Failed to get scheduled posts from localStorage:', e);
    return DEFAULT_POSTS;
  }
}

export function saveScheduledPost(post: ScheduledPost): void {
  try {
    const posts = getScheduledPosts();
    const existingIndex = posts.findIndex((p) => p.id === post.id);
    if (existingIndex >= 0) {
      posts[existingIndex] = post;
    } else {
      posts.unshift(post);
    }
    localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(posts));
  } catch (e) {
    console.error('Failed to save scheduled post:', e);
  }
}

export function deleteScheduledPost(id: string): void {
  try {
    const posts = getScheduledPosts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(posts));
  } catch (e) {
    console.error('Failed to delete scheduled post:', e);
  }
}

export function getHolidays(year: number, month: number): CalendarHoliday[] {
  // Returns holidays matching year and month (1-indexed month: 1=Jan, 10=Oct)
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const prefix = `${year}-${monthStr}`;

  return DEFAULT_HOLIDAYS.map((h) => {
    // Also adapt to current year if year differs
    const parts = h.dateStr.split('-');
    if (parts[0] !== `${year}` && parts[1] === monthStr) {
      return {
        ...h,
        dateStr: `${year}-${parts[1]}-${parts[2]}`
      };
    }
    return h;
  }).filter((h) => h.dateStr.startsWith(prefix));
}

// Default Social Connections
const DEFAULT_CONNECTIONS: SocialAccountConnection[] = [
  {
    channelId: 'instagram',
    name: 'Instagram Business',
    handle: '@wargative.id',
    connected: true,
    avatarUrl: '',
    connectedAt: Date.now() - 86400000 * 3
  },
  {
    channelId: 'facebook',
    name: 'Halaman Facebook',
    handle: 'Wargative Official Page',
    connected: true,
    avatarUrl: '',
    connectedAt: Date.now() - 86400000 * 5
  },
  {
    channelId: 'tiktok',
    name: 'TikTok',
    handle: '@wargative.creatives',
    connected: false
  },
  {
    channelId: 'threads',
    name: 'Threads',
    handle: '@wargative.id',
    connected: false
  },
  {
    channelId: 'youtube',
    name: 'YouTube',
    handle: 'Wargative Studio Channel',
    connected: false
  }
];

export function getSocialConnections(): SocialAccountConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_CONNECTIONS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_CONNECTIONS_KEY, JSON.stringify(DEFAULT_CONNECTIONS));
      return DEFAULT_CONNECTIONS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Merge with default channels in case new ones were added
      const existingIds = new Set(parsed.map((p) => p.channelId));
      let updated = [...parsed];
      DEFAULT_CONNECTIONS.forEach((dc) => {
        if (!existingIds.has(dc.channelId)) {
          updated.push(dc);
        }
      });
      return updated;
    }
    return DEFAULT_CONNECTIONS;
  } catch (e) {
    console.error('Failed to get social connections:', e);
    return DEFAULT_CONNECTIONS;
  }
}

export function getSocialConnection(channelId: SocialPlatformId): SocialAccountConnection | undefined {
  const connections = getSocialConnections();
  return connections.find((c) => c.channelId === channelId);
}

export function saveSocialConnection(connection: SocialAccountConnection): void {
  try {
    const connections = getSocialConnections();
    const idx = connections.findIndex((c) => c.channelId === connection.channelId);
    if (idx >= 0) {
      connections[idx] = connection;
    } else {
      connections.push(connection);
    }
    localStorage.setItem(STORAGE_CONNECTIONS_KEY, JSON.stringify(connections));
  } catch (e) {
    console.error('Failed to save social connection:', e);
  }
}

export function disconnectSocialConnection(channelId: SocialPlatformId): void {
  try {
    const connections = getSocialConnections();
    const idx = connections.findIndex((c) => c.channelId === channelId);
    if (idx >= 0) {
      connections[idx].connected = false;
      connections[idx].accessToken = undefined;
      connections[idx].accountId = undefined;
      connections[idx].apiKey = undefined;
      localStorage.setItem(STORAGE_CONNECTIONS_KEY, JSON.stringify(connections));
    }
  } catch (e) {
    console.error('Failed to disconnect social connection:', e);
  }
}

