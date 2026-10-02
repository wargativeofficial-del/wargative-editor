import fs from 'fs';
import path from 'path';

const files = [
  'node_modules/@cesdk/cesdk-js/assets/core/worker-host-v1.83.0.js',
  'node_modules/@cesdk/cesdk-js/cesdk.umd.js',
  'node_modules/@cesdk/engine/assets/core/worker-host-v1.83.0.js',
  'node_modules/@cesdk/engine/index.js'
];

files.forEach(file => {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.log('Skipping missing file:', file);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('return se("img.ly")') || content.includes('return oe("img.ly")')) {
    console.log('Already patched:', file);
    return;
  }

  // Replace se(globalThis.location.hostname) with se("img.ly")
  if (content.includes('return se(globalThis.location.hostname)')) {
    content = content.replace(
      'return se(globalThis.location.hostname)',
      'return se("img.ly")'
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched (se):', file);
  } else if (content.includes('return oe(globalThis.location.hostname)')) {
    content = content.replace(
      'return oe(globalThis.location.hostname)',
      'return oe("img.ly")'
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched (oe):', file);
  } else {
    console.log('Pattern not found in:', file);
  }
});
