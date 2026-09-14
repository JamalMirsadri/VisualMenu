import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPublicMediaUrl, extractStorageKey, isLocalMediaUrl } from '../src/config';
import { LocalStorageProvider } from '../src/services/storageProvider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Media URL Handling Regression Suite
 *
 * Verifies the permanent media URL fix:
 *   - backend emits absolute public URLs when PUBLIC_BASE_URL is set
 *   - storage key stays separate from the public URL
 *   - legacy relative /uploads URLs and external URLs are handled correctly
 *   - the frontend resolver preserves absolute URLs and resolves legacy /uploads
 */

async function runMediaUrlTests() {
  console.log('🎬  Starting Media URL Handling Regression Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${desc}:`, err.message || err);
      failed++;
    }
  }

  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;

  // 1. Relative URL when PUBLIC_BASE_URL unset
  delete process.env.PUBLIC_BASE_URL;
  assert('buildPublicMediaUrl returns relative /uploads URL when PUBLIC_BASE_URL unset', () => {
    const url = buildPublicMediaUrl('restaurants/abc/file.mp4');
    if (url !== '/uploads/restaurants/abc/file.mp4') throw new Error(`got ${url}`);
  });

  // 2. Absolute URL when PUBLIC_BASE_URL set
  process.env.PUBLIC_BASE_URL = 'https://visualmenu.outlethubs.com';
  assert('buildPublicMediaUrl returns absolute URL when PUBLIC_BASE_URL set', () => {
    const url = buildPublicMediaUrl('restaurants/abc/file.mp4');
    if (url !== 'https://visualmenu.outlethubs.com/uploads/restaurants/abc/file.mp4') {
      throw new Error(`got ${url}`);
    }
  });

  // 3. Trailing slash stripped
  process.env.PUBLIC_BASE_URL = 'https://visualmenu.outlethubs.com/';
  assert('PUBLIC_BASE_URL trailing slash is stripped', () => {
    const url = buildPublicMediaUrl('x/y.mp4');
    if (url !== 'https://visualmenu.outlethubs.com/uploads/x/y.mp4') throw new Error(`got ${url}`);
  });

  // 4. Relative local URL detection + key extraction
  assert('relative /uploads URL is local and extracts its storage key', () => {
    if (!isLocalMediaUrl('/uploads/a/b.mp4')) throw new Error('relative upload not detected as local');
    if (extractStorageKey('/uploads/a/b.mp4') !== 'a/b.mp4') throw new Error('wrong key extracted');
  });

  // 5. Absolute local URL detection + key extraction
  process.env.PUBLIC_BASE_URL = 'https://visualmenu.outlethubs.com';
  assert('absolute /uploads URL is local and extracts its storage key', () => {
    const url = 'https://visualmenu.outlethubs.com/uploads/a/b.mp4';
    if (!isLocalMediaUrl(url)) throw new Error('absolute upload not detected as local');
    if (extractStorageKey(url) !== 'a/b.mp4') throw new Error('wrong key extracted');
  });

  // 6. External URL preserved (never treated as local)
  assert('external URL is preserved and not treated as local', () => {
    const url = 'https://images.unsplash.com/photo.jpg';
    if (isLocalMediaUrl(url)) throw new Error('external URL misdetected as local');
    if (extractStorageKey(url) !== null) throw new Error('external URL should have no storage key');
  });

  // 7. LocalStorageProvider upload: absolute public URL + separate storage key
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-url-test-'));
  try {
    process.env.PUBLIC_BASE_URL = 'https://visualmenu.outlethubs.com';
    const provider = new LocalStorageProvider(tmpDir);
    const result = await provider.upload(
      { buffer: Buffer.from('fake-mp4-bytes'), originalname: 'dish.mp4', mimetype: 'video/mp4' },
      { folder: 'restaurants/abc' }
    );

    assert('upload returns an absolute public URL', () => {
      if (!result.url.startsWith('https://visualmenu.outlethubs.com/uploads/')) {
        throw new Error(`got ${result.url}`);
      }
    });

    assert('upload key is the storage path (no public base)', () => {
      if (result.key.startsWith('https://') || result.key.startsWith('/uploads/')) {
        throw new Error(`key leaked public base: ${result.key}`);
      }
      if (!result.key.includes('dish')) throw new Error(`key missing filename: ${result.key}`);
    });

    assert('file is written to the storage dir under the key', () => {
      const filePath = path.join(tmpDir, result.key);
      if (!fs.existsSync(filePath)) throw new Error(`missing ${filePath}`);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 8. Frontend resolver static invariants
  const frontendConfig = fs.readFileSync(path.join(__dirname, '../../src/config.ts'), 'utf-8');
  assert('frontend resolveMediaUrl exists', () => {
    if (!frontendConfig.includes('export function resolveMediaUrl')) throw new Error('resolveMediaUrl missing');
  });
  assert('frontend resolver preserves absolute/data/blob URLs', () => {
    if (!frontendConfig.includes("startsWith('data:')") || !frontendConfig.includes("startsWith('blob:')")) {
      throw new Error('missing data:/blob: preservation');
    }
  });
  assert('frontend resolver handles legacy /uploads URLs', () => {
    if (!frontendConfig.includes("startsWith('/uploads/')")) throw new Error('missing /uploads handling');
  });

  // Restore env
  if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;

  console.log(`\n📊 Media URL Handling Results: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  if (failed > 0) process.exit(1);
}

runMediaUrlTests().catch((err) => {
  console.error('Fatal error during media URL tests:', err);
  process.exit(1);
});
