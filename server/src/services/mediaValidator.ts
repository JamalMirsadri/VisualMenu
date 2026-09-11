import path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm', '.mov']);

export class MediaValidator {
  /**
   * Detect real MIME type by inspecting initial binary buffer magic bytes
   */
  static detectMimeFromBuffer(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 12) return null;

    // 1. JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }

    // 3. WebP: RIFF .... WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }

    // 4. WebM: 1A 45 DF A3 (EBML)
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return 'video/webm';
    }

    // 5. MP4 / MOV: bytes 4-7 equal 'ftyp'
    const boxType = buffer.toString('ascii', 4, 8);
    if (boxType === 'ftyp' || boxType === 'moov') {
      const brand = buffer.toString('ascii', 8, 12).toLowerCase();
      if (brand.includes('qt')) {
        return 'video/quicktime';
      }
      return 'video/mp4';
    }

    return null;
  }

  /**
   * Validate uploaded media file buffer, declared MIME, and filename
   */
  static validate(file: { buffer: Buffer; originalname: string; mimetype: string }): ValidationResult {
    const ext = path.extname(file.originalname).toLowerCase();

    // 1. Extension check
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Unsupported file extension: '${ext}'. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
      };
    }

    // 2. Declared MIME check
    if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported MIME type: '${file.mimetype}'. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
      };
    }

    // 3. Magic bytes / Binary signature inspection
    const detectedMime = this.detectMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      return {
        valid: false,
        error: 'Invalid file signature: Content does not match recognized image or video format.',
      };
    }

    // Verify declared MIME matches detected MIME family
    const isDetectedImage = detectedMime.startsWith('image/');
    const isDeclaredImage = file.mimetype.startsWith('image/');
    if (isDetectedImage !== isDeclaredImage) {
      return {
        valid: false,
        error: `MIME mismatch: Declared '${file.mimetype}' but binary content is '${detectedMime}'.`,
      };
    }

    const isVideo = detectedMime.startsWith('video/');
    const mediaType: 'IMAGE' | 'VIDEO' = isVideo ? 'VIDEO' : 'IMAGE';

    // 4. Size limits
    const maxAllowedSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
    if (file.buffer.length > maxAllowedSize) {
      const maxMb = maxAllowedSize / (1024 * 1024);
      return {
        valid: false,
        error: `File size ${Math.round(file.buffer.length / 1024 / 1024)}MB exceeds maximum allowed ${maxMb}MB for ${mediaType.toLowerCase()}s.`,
      };
    }

    return {
      valid: true,
      detectedMime,
      mediaType,
    };
  }

  /**
   * Sanitize filename to prevent directory traversal or script injection
   */
  static sanitizeFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename, ext);
    const cleanedBase = base
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);
    return `${cleanedBase || 'upload'}${ext}`;
  }
}
