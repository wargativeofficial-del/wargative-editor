import fs from 'fs';

async function generate() {
  const BASE_URL = 'https://cdn.img.ly/packages/imgly/cesdk-js/1.83.0/assets';
  const res = await fetch(BASE_URL + '/ly.img.templates.premium/content.json');
  const data = await res.json();

  const templates = data.assets.map((a) => {
    const group = (a.groups && a.groups[0]) || 'other';
    const label = (a.label && a.label.en) || a.id;
    const uri = a.meta.uri.replace('{{base_url}}', BASE_URL);
    const thumbUri = a.meta.thumbUri.replace('{{base_url}}', BASE_URL);
    const tags = (a.tags && a.tags.en) || [];
    return {
      id: a.id,
      label,
      group,
      tags,
      uri,
      thumbUri
    };
  });

  const fileContent = `/**
 * Wargative Templates Catalog
 * 100 verified CE.SDK premium templates across E-Commerce, Event, Personal, Professional, Socials
 */

export interface WargativeTemplate {
  id: string;
  label: string;
  group: 'e-commerce' | 'event' | 'personal' | 'professional' | 'socials';
  tags: string[];
  uri: string;
  thumbUri: string;
}

export const WARGATIVE_TEMPLATES: WargativeTemplate[] = ${JSON.stringify(templates, null, 2)};
`;

  fs.writeFileSync('src/common/wargativeTemplates.ts', fileContent, 'utf8');
  console.log('Successfully generated src/common/wargativeTemplates.ts with ' + templates.length + ' templates');
}

generate();
