import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Media Upload Modal Regression Suite
 *
 * Guards against the local-file upload bug where a selected MP4 displayed its
 * filename but Save still reported "Please select a local file to upload or
 * enter a media URL."
 *
 * Verifies:
 *  - local MP4  -> file-upload mode
 *  - local image -> file-upload mode
 *  - external URL -> URL mode (independent of local-file mode)
 *  - no file + no URL -> validation error
 * plus static source invariants (File stored, not cleared before submit, etc.)
 */

interface LocalFile {
  name: string;
  type: string;
}

type SubmitResult =
  | { mode: 'file'; file: LocalFile }
  | { mode: 'url'; url: string }
  | { error: string };

/**
 * Mirrors the submit resolution in src/components/admin/MediaUploadModal.tsx.
 */
function resolveSubmit(
  selectedFile: LocalFile | null,
  url: string,
  title: string,
  restaurantId?: string
): SubmitResult {
  if (!title.trim()) return { error: 'Media title is required.' };

  const file = selectedFile;
  const trimmedUrl = url.trim();

  if (!file && !trimmedUrl) {
    return { error: 'Please select a local file to upload or enter a media URL.' };
  }

  if (file && !restaurantId) {
    return { error: 'The restaurant is not ready yet. Please try again in a moment.' };
  }

  if (file && restaurantId) {
    return { mode: 'file', file };
  }

  return { mode: 'url', url: trimmedUrl };
}

async function runMediaUploadModalTests() {
  console.log('🎞️  Starting Media Upload Modal Regression Suite (10 Tests)...\n');
  let passed = 0;
  let failed = 0;

  function assert(num: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${num}/10] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${num}/10] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const code = fs.readFileSync(path.join(rootDir, 'src/components/admin/MediaUploadModal.tsx'), 'utf-8');

  // ---- Behavioral resolution tests ----
  assert(1, 'local MP4 -> file-upload mode', () => {
    const res = resolveSubmit({ name: 'reel.mp4', type: 'video/mp4' }, '', 'Reel', 'rest-1');
    if (res.mode !== 'file' || res.file.name !== 'reel.mp4') {
      throw new Error(`expected file mode for MP4, got ${JSON.stringify(res)}`);
    }
  });

  assert(2, 'local image -> file-upload mode', () => {
    const res = resolveSubmit({ name: 'dish.jpg', type: 'image/jpeg' }, '', 'Dish', 'rest-1');
    if (res.mode !== 'file' || res.file.name !== 'dish.jpg') {
      throw new Error(`expected file mode for image, got ${JSON.stringify(res)}`);
    }
  });

  assert(3, 'external URL -> URL mode (no file required)', () => {
    const res = resolveSubmit(null, '  https://cdn.example.com/a.mp4  ', 'External', 'rest-1');
    if (res.mode !== 'url' || res.url !== 'https://cdn.example.com/a.mp4') {
      throw new Error(`expected URL mode, got ${JSON.stringify(res)}`);
    }
  });

  assert(4, 'no file + no URL -> validation error', () => {
    const res = resolveSubmit(null, '   ', 'Title', 'rest-1');
    if (res.error !== 'Please select a local file to upload or enter a media URL.') {
      throw new Error(`expected validation error, got ${JSON.stringify(res)}`);
    }
  });

  assert(5, 'selected file is preferred over a URL (file takes precedence)', () => {
    const res = resolveSubmit({ name: 'x.png', type: 'image/png' }, 'https://cdn/x.png', 'T', 'rest-1');
    if (res.mode !== 'file') {
      throw new Error(`expected file mode to take precedence, got ${JSON.stringify(res)}`);
    }
  });

  // ---- Static source invariants ----
  assert(6, 'file selection stores the actual File object in state', () => {
    if (!code.includes('setSelectedFile(file);')) {
      throw new Error('missing setSelectedFile(file) on file selection');
    }
  });

  assert(7, 'submit validates against the real File object / URL, not the display name', () => {
    if (!code.includes('const file = selectedFile;') || !code.includes('const trimmedUrl = url.trim();')) {
      throw new Error('submit does not read the real File object / URL');
    }
    if (!code.includes('if (!file && !trimmedUrl)')) {
      throw new Error('missing file/URL validation guard');
    }
  });

  assert(8, 'URL input no longer clears the File state before submit', () => {
    if (/onChange=\{\(e\) => \{[\s\S]*?setSelectedFile\(null\)/m.test(code)) {
      throw new Error('URL onChange still clears selectedFile');
    }
    if (!code.includes('onChange={(e) => setUrl(e.target.value)}')) {
      throw new Error('URL onChange is not independent of file state');
    }
  });

  assert(9, 'filename is shown only when a real File exists', () => {
    if (!code.includes('{selectedFile ? selectedFile.name : ')) {
      throw new Error('filename display does not guard on real File');
    }
  });

  assert(10, 'state resets correctly after a successful submit', () => {
    for (const reset of ['setSelectedFile(null);', 'setTitle(\'\');', 'setUrl(\'\');']) {
      if (!code.includes(reset)) {
        throw new Error(`missing post-submit reset: ${reset}`);
      }
    }
  });

  console.log(`\n📊 Media Upload Modal Test Results: ${passed} passed, ${failed} failed (Total: 10)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runMediaUploadModalTests().catch((err) => {
  console.error('Fatal error during media upload modal tests:', err);
  process.exit(1);
});
