/**
 * Wargative AI Service - Powered by Google Gemini 3.8 Flash
 */

const DEFAULT_KEY_ENCODED = 'QVEuQWI4Uk42S1pzaERNTjU5SFllQ3pwbjFjVG5URXFBSUpVQlhRZ2NjSkRhRDlfNmg3UlE=';
const GEMINI_MODEL = 'gemini-3.8-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getApiKey(): string {
  try {
    const saved = localStorage.getItem('WARGATIVE_GEMINI_API_KEY');
    if (saved && saved.trim()) return saved.trim();
    if (typeof atob === 'function') {
      return atob(DEFAULT_KEY_ENCODED);
    }
  } catch {
    // fallback
  }
  return '';
}

export function setApiKey(key: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('WARGATIVE_GEMINI_API_KEY', key.trim());
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface DesignConcept {
  title: string;
  category: string;
  width: number;
  height: number;
  headline: string;
  subheadline: string;
  bodyText: string;
  callToAction: string;
  colorPalette: { name: string; hex: string }[];
  visualAdvice: string;
}

export interface ColorPaletteResult {
  themeName: string;
  description: string;
  colors: { name: string; hex: string; role: string }[];
  gradient: string;
}

/**
 * Execute a Gemini 3.8 Flash request with automatic retry for resilience
 */
export async function callGemini(prompt: string, systemInstruction?: string): Promise<string> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const bodyPayload: any = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  let lastError = '';

  // Up to 3 attempts with exponential backoff for high-demand spikes
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }

      lastError = data.error?.message || `HTTP ${response.status}`;
      console.warn(`[Gemini Attempt ${attempt}] Failed: ${lastError}`);

      // Wait before retrying
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    } catch (err: any) {
      lastError = err.message || 'Network error';
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
  }

  throw new Error(`Gemini AI Service Error: ${lastError}`);
}

/**
 * Magic Write - Generate creative marketing copy, captions, and headlines
 */
export async function generateMagicCopy(opts: {
  topic: string;
  type: 'instagram' | 'headline' | 'slogan' | 'product' | 'promo' | 'script';
  tone: 'catchy' | 'professional' | 'persuasive' | 'friendly' | 'luxury';
  language?: 'id' | 'en';
}): Promise<string> {
  const lang = opts.language || 'id';
  const typeMap = {
    instagram: 'Instagram Caption lengkap dengan hook menarik, bullet points, Call-to-Action, dan 10 hashtags relevan',
    headline: '5 Variasi Headline Iklan yang Catchy dan High-Converting',
    slogan: '6 Pilihan Tagline / Slogan yang Kuat, Berkesan, dan Unik',
    product: 'Deskripsi Produk / Jasa yang Menjual (Features, Benefits, & USP)',
    promo: 'Naskah Pengumuman Promo / Flash Sale / Grand Opening yang Mendesak dan Menarik',
    script: 'Naskah Video Reels / TikTok 30 detik (Hook visual, Isi, dan CTA)'
  };

  const toneMap = {
    catchy: 'Trendy, energik, viral, dan bahasa kekinian',
    professional: 'Formal, kredibel, percaya diri, dan berwibawa',
    persuasive: 'Meyakinkan, memicu emosi, fokus solusi dan urgensi',
    friendly: 'Hangat, akrab, santai, dan seperti berbicara dengan sahabat',
    luxury: 'Elegan, eksklusif, puitis, dan berkelas tinggi'
  };

  const prompt = `
Buatkan ${typeMap[opts.type]} untuk topik/bisnis berikut:
"${opts.topic}"

Kriteria:
- Gaya Bahasa / Tone: ${toneMap[opts.tone]}
- Bahasa: ${lang === 'id' ? 'Bahasa Indonesia yang alami dan menarik' : 'English'}
- Formatkan output rapi dengan markdown (bullet points, bold highlights, emoji yang pas).
`;

  const systemPrompt = `Kamu adalah Wargative AI Copywriter, asisten copywriter kelas dunia untuk desainer grafis dan marketer. Berikan hasil yang siap langsung dipakai untuk konten desain visual.`;

  return callGemini(prompt, systemPrompt);
}

/**
 * Magic Design - Generate a complete design layout concept from an idea
 */
export async function generateDesignConcept(userPrompt: string): Promise<DesignConcept> {
  const prompt = `
Pengguna ingin membuat desain dengan konsep: "${userPrompt}"

Analisis konsep ini dan buatkan spesifikasi desain grafis yang ideal dalam format JSON valid tanpa markdown formatting tambahan.

JSON schema:
{
  "title": "Judul Proyek Singkat",
  "category": "Social Media / Poster / Banner / Story / Presentation",
  "width": 1080,
  "height": 1350,
  "headline": "Teks Judul Utama Desain",
  "subheadline": "Teks Sub-Judul Penjelas",
  "bodyText": "Poin-poin atau teks isi pendukung",
  "callToAction": "Teks Tombol / CTA (misal: Beli Sekarang / Hubungi Kami)",
  "colorPalette": [
    { "name": "Primary", "hex": "#HEX" },
    { "name": "Secondary", "hex": "#HEX" },
    { "name": "Accent", "hex": "#HEX" },
    { "name": "Background", "hex": "#HEX" },
    { "name": "Text", "hex": "#HEX" }
  ],
  "visualAdvice": "Saran tata letak, komposisi visual, dan gaya elemen gambar"
}
`;

  const systemPrompt = `Kamu adalah Wargative AI Art Director. Kembalikan HANYA string JSON murni tanpa awalan \`\`\`json.`;

  const responseText = await callGemini(prompt, systemPrompt);

  try {
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as DesignConcept;
  } catch (e) {
    // Fallback default structured object if JSON parsing was slightly off
    return {
      title: userPrompt.slice(0, 30),
      category: 'Social Media',
      width: 1080,
      height: 1350,
      headline: userPrompt,
      subheadline: 'Dibuat khusus oleh Wargative AI',
      bodyText: 'Kombinasi visual memukau dengan tipografi presisi.',
      callToAction: 'Pelajari Selengkapnya',
      colorPalette: [
        { name: 'Primary Purple', hex: '#7047eb' },
        { name: 'Indigo Accent', hex: '#6366f1' },
        { name: 'Emerald Pop', hex: '#10b981' },
        { name: 'Dark Slate', hex: '#0f172a' },
        { name: 'Clean White', hex: '#ffffff' }
      ],
      visualAdvice: 'Gunakan layout kontras tinggi dengan hierarki tipografi yang jelas.'
    };
  }
}

/**
 * Smart Palette Generator - Generate curated palettes with hex codes and CSS gradients
 */
export async function generateSmartPalette(theme: string): Promise<ColorPaletteResult> {
  const prompt = `
Buatkan palet warna desain grafis profesional untuk tema: "${theme}"

Format JSON yang wajib dikembalikan:
{
  "themeName": "Nama Tema Menarik",
  "description": "Penjelasan singkat vibe dan psikologi warna",
  "colors": [
    { "name": "Nama Warna 1", "hex": "#HEX", "role": "Dominant / Background" },
    { "name": "Nama Warna 2", "hex": "#HEX", "role": "Primary Brand" },
    { "name": "Nama Warna 3", "hex": "#HEX", "role": "Secondary / Support" },
    { "name": "Nama Warna 4", "hex": "#HEX", "role": "Accent / Highlight" },
    { "name": "Nama Warna 5", "hex": "#HEX", "role": "Text / Contrast" }
  ],
  "gradient": "linear-gradient(135deg, #HEX1 0%, #HEX2 100%)"
}
`;

  const systemPrompt = `Kamu adalah Wargative AI Color Master. Kembalikan HANYA string JSON murni tanpa markdown.`;

  const responseText = await callGemini(prompt, systemPrompt);

  try {
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as ColorPaletteResult;
  } catch (e) {
    return {
      themeName: theme,
      description: 'Kombinasi warna harmonis dan modern.',
      colors: [
        { name: 'Deep Violet', hex: '#4c1d95', role: 'Background' },
        { name: 'Wargative Purple', hex: '#7047eb', role: 'Primary' },
        { name: 'Electric Cyan', hex: '#06b6d4', role: 'Accent' },
        { name: 'Soft Lilac', hex: '#ede9fe', role: 'Support' },
        { name: 'Pure White', hex: '#ffffff', role: 'Text' }
      ],
      gradient: 'linear-gradient(135deg, #7047eb 0%, #06b6d4 100%)'
    };
  }
}

/**
 * AI Co-Pilot Chat - Interactive multi-turn chat assistant for design advice
 */
export async function chatWithCopilot(messages: ChatMessage[], userMessage: string): Promise<string> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const conversationContents = [
    ...messages,
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];

  const systemInstruction = {
    parts: [
      {
        text: `Kamu adalah Wargative AI Co-Pilot, asisten AI cerdas, ramah, dan solutif untuk aplikasi Wargative Editor (Canva Clone). Kamu ahli dalam desain grafis, layout, tipografi, psikologi warna, tren media sosial, copywriting, dan strategi konten. Jawablah dengan format markdown yang rapi, ringkas, dan actionable.`
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: conversationContents,
      systemInstruction
    })
  });

  const data = await response.json();
  if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(data.error?.message || 'Chat error');
}
