import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildPublicMediaUrl } from '../config';

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export interface MediaStorageProvider {
  upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult>;
  delete(key: string): Promise<boolean>;
  replace(key: string, file: UploadFileInput): Promise<UploadResult>;
  getUrl(key: string): string;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * 1. Local Filesystem Storage Provider
 * Saves files into the local filesystem under public /uploads directory.
 */
export class LocalStorageProvider implements MediaStorageProvider {
  private baseDir: string;

  constructor(baseDir = path.join(process.cwd(), 'uploads')) {
    this.baseDir = baseDir;

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult> {
    const folder = options?.folder ? options.folder.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const targetDir = folder ? path.join(this.baseDir, folder) : this.baseDir;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const randomHash = crypto.randomBytes(12).toString('hex');
    const safeBaseName = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);
    const filename = `${safeBaseName}-${randomHash}${ext}`;
    const filePath = path.join(targetDir, filename);

    await fs.promises.writeFile(filePath, file.buffer);

    const key = folder ? `${folder}/${filename}` : filename;
    const url = buildPublicMediaUrl(key);

    return {
      url,
      key,
      size: file.buffer.length,
      mimeType: file.mimetype,
    };
  }

  async delete(key: string): Promise<boolean> {
    const safeKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(this.baseDir, safeKey);

    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async replace(key: string, file: UploadFileInput): Promise<UploadResult> {
    await this.delete(key);
    return await this.upload(file, { folder: path.dirname(key) !== '.' ? path.dirname(key) : undefined });
  }

  getUrl(key: string): string {
    const safeKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
    return buildPublicMediaUrl(safeKey.replace(/\\/g, '/'));
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    // For local dev, signed URL returns the static URL
    return this.getUrl(key);
  }
}

/**
 * 2. AWS S3 Storage Provider (Cloud Architecture Blueprint)
 */
export class S3StorageProvider implements MediaStorageProvider {
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || 'menu-media-bucket';
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  async upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult> {
    const folder = options?.folder || 'media';
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const key = `${folder}/${crypto.randomUUID()}${ext}`;
    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      url,
      key,
      size: file.buffer.length,
      mimeType: file.mimetype,
    };
  }

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async replace(key: string, file: UploadFileInput): Promise<UploadResult> {
    return this.upload(file, { folder: path.dirname(key) });
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `${this.getUrl(key)}?expires=${Date.now() + 3600000}`;
  }
}

/**
 * 3. Cloudflare R2 Storage Provider
 */
export class R2StorageProvider implements MediaStorageProvider {
  private accountId: string;
  private bucket: string;

  constructor() {
    this.accountId = process.env.R2_ACCOUNT_ID || 'r2-account-id';
    this.bucket = process.env.R2_BUCKET || 'menu-media-r2';
  }

  async upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult> {
    const folder = options?.folder || 'media';
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const key = `${folder}/${crypto.randomUUID()}${ext}`;
    const url = `https://${this.bucket}.${this.accountId}.r2.cloudflarestorage.com/${key}`;

    return {
      url,
      key,
      size: file.buffer.length,
      mimeType: file.mimetype,
    };
  }

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async replace(key: string, file: UploadFileInput): Promise<UploadResult> {
    return this.upload(file, { folder: path.dirname(key) });
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.${this.accountId}.r2.cloudflarestorage.com/${key}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `${this.getUrl(key)}?token=r2-signed-token`;
  }
}

/**
 * 4. Supabase Storage Provider
 */
export class SupabaseStorageProvider implements MediaStorageProvider {
  private projectUrl: string;
  private bucket: string;

  constructor() {
    this.projectUrl = process.env.SUPABASE_URL || 'https://xyzcompany.supabase.co';
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'menu-media';
  }

  async upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult> {
    const folder = options?.folder || 'media';
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const key = `${folder}/${crypto.randomUUID()}${ext}`;
    const url = `${this.projectUrl}/storage/v1/object/public/${this.bucket}/${key}`;

    return {
      url,
      key,
      size: file.buffer.length,
      mimeType: file.mimetype,
    };
  }

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async replace(key: string, file: UploadFileInput): Promise<UploadResult> {
    return this.upload(file, { folder: path.dirname(key) });
  }

  getUrl(key: string): string {
    return `${this.projectUrl}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `${this.getUrl(key)}?token=supabase-signed`;
  }
}

/**
 * 5. Cloudinary Storage Provider
 */
export class CloudinaryStorageProvider implements MediaStorageProvider {
  private cloudName: string;

  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'demo-cloud';
  }

  async upload(file: UploadFileInput, options?: { folder?: string }): Promise<UploadResult> {
    const folder = options?.folder || 'media';
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const key = `${folder}/${crypto.randomUUID()}${ext}`;
    const url = `https://res.cloudinary.com/${this.cloudName}/image/upload/v1/${key}`;

    return {
      url,
      key,
      size: file.buffer.length,
      mimeType: file.mimetype,
    };
  }

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async replace(key: string, file: UploadFileInput): Promise<UploadResult> {
    return this.upload(file, { folder: path.dirname(key) });
  }

  getUrl(key: string): string {
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/v1/${key}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return this.getUrl(key);
  }
}

/**
 * Storage Provider Factory
 */
let defaultProvider: MediaStorageProvider | null = null;

export function getStorageProvider(): MediaStorageProvider {
  if (defaultProvider) return defaultProvider;

  const providerType = process.env.STORAGE_PROVIDER?.toUpperCase();
  switch (providerType) {
    case 'S3':
    case 'AWS':
      defaultProvider = new S3StorageProvider();
      break;
    case 'R2':
    case 'CLOUDFLARE':
      defaultProvider = new R2StorageProvider();
      break;
    case 'SUPABASE':
      defaultProvider = new SupabaseStorageProvider();
      break;
    case 'CLOUDINARY':
      defaultProvider = new CloudinaryStorageProvider();
      break;
    default:
      defaultProvider = new LocalStorageProvider();
      break;
  }

  return defaultProvider;
}
