/**
 * Project Store - Manages persistent projects across Home Dashboard and Wargative Editor
 */

export interface ProjectItem {
  id: string;
  title: string;
  format: string;
  width: number;
  height: number;
  updatedAt: number;
  thumbnailColor: string;
  thumbnailIcon: string;
  badgeText: string;
  badgeBg: string;
  badgeIconType?: string; // 'camera' | 'play' | 'compass' | 'doc' | 'star'
  previewType?: string; // visual style type matching Screenshot 1
  isTemplate?: boolean;
}

const STORAGE_LIST_KEY = 'wargative_projects_list';
const STORAGE_VER_KEY = 'wargative_projects_ver';
const CURRENT_VERSION = '2.2';
const SCENE_PREFIX = 'wargative_scene_';

// Initial projects matching the user's Canva dashboard screenshot exactly (14 projects across 2 rows)
const DEFAULT_PROJECTS: ProjectItem[] = [
  // ROW 1
  {
    id: 'proj_untitled',
    title: 'Untitled Design',
    format: 'Instagram Post (1:1)',
    width: 1080,
    height: 1080,
    updatedAt: Date.now() - 14 * 3600 * 1000, // 14 hours ago
    thumbnailColor: 'linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)',
    thumbnailIcon: '✨',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'untitled'
  },
  {
    id: 'proj_marketing_ad',
    title: 'Copy of Sahabat Film',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 3 * 3600 * 1000, // 3 hours ago
    thumbnailColor: '#10b981',
    thumbnailIcon: '🛍️',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'green'
  },
  {
    id: 'proj_macbook',
    title: 'ini hasil setelah gue pencet...',
    format: '1920 x 1080 px',
    width: 1920,
    height: 1080,
    updatedAt: Date.now() - 11 * 3600 * 1000, // 11 hours ago
    thumbnailColor: '#e2e8f0',
    thumbnailIcon: '💻',
    badgeText: '1920 x 10...',
    badgeBg: '#8b5cf6',
    badgeIconType: 'compass',
    previewType: 'macbook'
  },
  {
    id: 'proj_sa',
    title: 'sa',
    format: 'Instagram (A4)',
    width: 794,
    height: 1123,
    updatedAt: Date.now() - 18 * 24 * 3600 * 1000, // 18 days ago
    thumbnailColor: '#f8fafc',
    thumbnailIcon: '📄',
    badgeText: 'Instagram...',
    badgeBg: '#ec4899',
    badgeIconType: 'play',
    previewType: 'doc'
  },
  {
    id: 'proj_sahabat_horor',
    title: 'Sahabat Horor',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 1 * 24 * 3600 * 1000, // 1 day ago
    thumbnailColor: '#18181b',
    thumbnailIcon: '🎬',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'horor'
  },
  {
    id: 'proj_sahabat_film',
    title: 'Sahabat Film',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 1 * 24 * 3600 * 1000,
    thumbnailColor: '#09090b',
    thumbnailIcon: '🎞️',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'film'
  },
  {
    id: 'proj_nonton_film',
    title: 'Nonton Film',
    format: '1080 x 1920 px',
    width: 1080,
    height: 1920,
    updatedAt: Date.now() - 1 * 24 * 3600 * 1000,
    thumbnailColor: '#15803d',
    thumbnailIcon: '▶️',
    badgeText: '1080 x 192...',
    badgeBg: '#8b5cf6',
    badgeIconType: 'compass',
    previewType: 'nonton'
  },
  // ROW 2
  {
    id: 'proj_sahabat_pedia',
    title: 'Sahabat Pedia',
    format: 'Instagram Post (1:1)',
    width: 1080,
    height: 1080,
    updatedAt: Date.now() - 2 * 24 * 3600 * 1000, // 2 days ago
    thumbnailColor: '#09090b',
    thumbnailIcon: '📚',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'pedia'
  },
  {
    id: 'proj_sahabatgame_reels',
    title: 'SAHABATGAME REELS',
    format: '1080 x 1920 px',
    width: 1080,
    height: 1920,
    updatedAt: Date.now() - 2 * 24 * 3600 * 1000,
    thumbnailColor: '#1e293b',
    thumbnailIcon: '🎮',
    badgeText: '1080 x 192...',
    badgeBg: '#8b5cf6',
    badgeIconType: 'compass',
    previewType: 'game_reels'
  },
  {
    id: 'proj_copy_sahabat_game',
    title: 'Copy of Sahabat Game',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 17 * 24 * 3600 * 1000, // 17 days ago
    thumbnailColor: '#334155',
    thumbnailIcon: '🚔',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'copy_game'
  },
  {
    id: 'proj_sahabat_game',
    title: 'Sahabat Game',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 2 * 24 * 3600 * 1000,
    thumbnailColor: '#0284c7',
    thumbnailIcon: '🌴',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'game'
  },
  {
    id: 'proj_copy_sahabat_film_2',
    title: 'Copy of Sahabat Film',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 5 * 24 * 3600 * 1000, // 5 days ago
    thumbnailColor: '#451a03',
    thumbnailIcon: '🔥',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'warrior'
  },
  {
    id: 'proj_instagram',
    title: 'Instagram',
    format: '5000 x 5000 px',
    width: 5000,
    height: 5000,
    updatedAt: Date.now() - 8 * 24 * 3600 * 1000, // 8 days ago
    thumbnailColor: '#f1f5f9',
    thumbnailIcon: '📱',
    badgeText: '5000 x 50...',
    badgeBg: '#8b5cf6',
    badgeIconType: 'compass',
    previewType: 'instagram'
  },
  {
    id: 'proj_sahabat_tech',
    title: 'Sahabat Tech',
    format: 'Instagram Post (4:5)',
    width: 1080,
    height: 1350,
    updatedAt: Date.now() - 18 * 24 * 3600 * 1000, // 18 days ago
    thumbnailColor: '#0f172a',
    thumbnailIcon: '👁️',
    badgeText: 'Instagram P...',
    badgeBg: '#ef4444',
    badgeIconType: 'camera',
    previewType: 'tech'
  }
];

export function getProjects(): ProjectItem[] {
  try {
    const ver = localStorage.getItem(STORAGE_VER_KEY);
    const raw = localStorage.getItem(STORAGE_LIST_KEY);

    if (ver !== CURRENT_VERSION || !raw) {
      // If version changed, preserve any newly created user projects while updating defaults
      let userCreated: ProjectItem[] = [];
      if (raw) {
        try {
          const existing = JSON.parse(raw);
          if (Array.isArray(existing)) {
            userCreated = existing.filter(
              (p: ProjectItem) => !DEFAULT_PROJECTS.some((dp) => dp.id === p.id)
            );
          }
        } catch (e) {}
      }

      const merged = [...userCreated, ...DEFAULT_PROJECTS];
      localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(merged));
      localStorage.setItem(STORAGE_VER_KEY, CURRENT_VERSION);
      return merged;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PROJECTS;
  } catch (e) {
    console.error('Failed to load projects from localStorage:', e);
    return DEFAULT_PROJECTS;
  }
}

export function getProject(id: string): ProjectItem | undefined {
  const projects = getProjects();
  return projects.find((p) => p.id === id);
}

export function saveProjectMeta(item: ProjectItem): void {
  try {
    const projects = getProjects();
    const existingIndex = projects.findIndex((p) => p.id === item.id);
    if (existingIndex >= 0) {
      projects[existingIndex] = { ...projects[existingIndex], ...item, updatedAt: Date.now() };
      // Move to top
      const [updated] = projects.splice(existingIndex, 1);
      projects.unshift(updated);
    } else {
      projects.unshift({ ...item, updatedAt: Date.now() });
    }
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save project meta:', e);
  }
}

export function saveProjectScene(id: string, sceneString: string): boolean {
  try {
    localStorage.setItem(SCENE_PREFIX + id, sceneString);
    return true;
  } catch (e) {
    console.error('Failed to save scene data:', e);
    return false;
  }
}

export function getProjectScene(id: string): string | null {
  try {
    return localStorage.getItem(SCENE_PREFIX + id);
  } catch (e) {
    console.error('Failed to get scene data:', e);
    return null;
  }
}

export function duplicateProject(id: string): ProjectItem | null {
  try {
    const project = getProject(id);
    if (!project) return null;

    // 1. Verify source scene exists and is readable
    const sceneData = getProjectScene(id);
    if (!sceneData) {
      console.warn(`[duplicateProject] Source project scene not found for ${id}`);
      return null;
    }

    const newId = 'proj_' + Date.now();

    // 2. Copy scene to newId and verify storage integrity
    const saved = saveProjectScene(newId, sceneData);
    if (!saved || getProjectScene(newId) !== sceneData) {
      console.error(`[duplicateProject] Failed to persist duplicate scene for ${newId}`);
      try {
        localStorage.removeItem(SCENE_PREFIX + newId);
      } catch (err) {}
      return null;
    }

    // 3. Only after scene is verified, create and save new project metadata
    const copyItem: ProjectItem = {
      ...project,
      id: newId,
      title: project.title.startsWith('Copy of ') ? project.title : 'Copy of ' + project.title,
      updatedAt: Date.now()
    };

    saveProjectMeta(copyItem);
    return copyItem;
  } catch (e) {
    console.error('Failed to duplicate project:', e);
    return null;
  }
}

export function renameProject(id: string, newTitle: string): boolean {
  try {
    const projects = getProjects();
    const target = projects.find((p) => p.id === id);
    if (!target) return false;
    target.title = newTitle;
    target.updatedAt = Date.now();
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error('Failed to rename project:', e);
    return false;
  }
}

export function deleteProject(id: string): boolean {
  try {
    const projects = getProjects().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(projects));
    localStorage.removeItem(SCENE_PREFIX + id);
    return true;
  } catch (e) {
    console.error('Failed to delete project:', e);
    return false;
  }
}

export function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Edited just now';
  if (diffMin < 60) return `Edited ${diffMin}m ago`;
  if (diffHours < 24) return `Edited ${diffHours}h ago`;
  if (diffDays === 1) return 'Edited 1 d ago';
  return `Edited ${diffDays} d ago`;
}
