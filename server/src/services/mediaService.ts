import { MediaType } from '@prisma/client';
import { prisma } from '../prisma';
import { getStorageProvider, UploadFileInput } from './storageProvider';
import { MediaValidator } from './mediaValidator';
import { extractStorageKey, isLocalMediaUrl } from '../config';

export interface CreateMediaInput {
  restaurantId: string;
  foodItemId?: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  duration?: string;
  altText?: string;
  isPrimary?: boolean;
  width?: number;
  height?: number;
  desktopUrl?: string;
  mobileUrl?: string;
  posterUrl?: string;
  sourceType?: string;
}

export interface ListMediaOptions {
  type?: MediaType;
  page?: number;
  limit?: number;
}

export interface PaginatedMediaResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class MediaService {
  /**
   * Save media metadata record linked to a restaurant and optional food item
   */
  static async createMedia(input: CreateMediaInput) {
    if (input.foodItemId && input.isPrimary) {
      // If marking as primary, unset other primaries for this food item
      await prisma.media.updateMany({
        where: { foodItemId: input.foodItemId },
        data: { isPrimary: false },
      });
    }

    return await prisma.media.create({
      data: {
        restaurantId: input.restaurantId,
        foodItemId: input.foodItemId || null,
        type: input.type,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl || null,
        filename: input.filename || null,
        mimeType: input.mimeType || null,
        size: input.size || null,
        duration: input.duration || null,
        altText: input.altText || null,
        isPrimary: Boolean(input.isPrimary),
        width: input.width || null,
        height: input.height || null,
        desktopUrl: input.desktopUrl || null,
        mobileUrl: input.mobileUrl || null,
        posterUrl: input.posterUrl || null,
        sourceType: input.sourceType || 'EXTERNAL_URL',
      },
    });
  }

  /**
   * Upload binary file with validation and persist media record
   */
  static async uploadAndCreateMedia(
    restaurantId: string,
    file: UploadFileInput,
    extra?: {
      foodItemId?: string;
      altText?: string;
      isPrimary?: boolean;
      posterUrl?: string;
      width?: number;
      height?: number;
      duration?: string;
      desktopUrl?: string;
      mobileUrl?: string;
      sourceType?: string;
    }
  ) {
    // 1. Strict validation
    const validation = MediaValidator.validate(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid media file.');
    }

    const sanitizedName = MediaValidator.sanitizeFilename(file.originalname);
    const storage = getStorageProvider();

    // 2. Upload to storage provider
    const uploadResult = await storage.upload(
      {
        buffer: file.buffer,
        originalname: sanitizedName,
        mimetype: validation.detectedMime || file.mimetype,
      },
      { folder: `restaurants/${restaurantId}` }
    );

    // 3. Create Media database record
    const mediaType = validation.mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;
    return await this.createMedia({
      restaurantId,
      foodItemId: extra?.foodItemId,
      type: mediaType,
      url: uploadResult.url,
      filename: sanitizedName,
      mimeType: uploadResult.mimeType,
      size: uploadResult.size,
      altText: extra?.altText,
      isPrimary: extra?.isPrimary,
      width: extra?.width,
      height: extra?.height,
      duration: extra?.duration,
      posterUrl: extra?.posterUrl,
      desktopUrl: extra?.desktopUrl,
      mobileUrl: extra?.mobileUrl,
      sourceType: extra?.sourceType || 'UPLOAD',
    });
  }

  /**
   * Replace an existing media item while preserving food associations
   */
  static async replaceMedia(
    id: string,
    options: {
      file?: UploadFileInput;
      url?: string;
      posterUrl?: string;
      width?: number;
      height?: number;
      duration?: string;
      mimeType?: string;
      size?: number;
      desktopUrl?: string;
      mobileUrl?: string;
    },
    restaurantId?: string
  ) {
    const existing = await prisma.media.findFirst({
      where: {
        id,
        ...(restaurantId ? { restaurantId } : {}),
      },
    });

    if (!existing) {
      throw new Error('Media not found.');
    }

    let newUrl = options.url || existing.url;
    let newMimeType = options.mimeType || existing.mimeType;
    let newSize = options.size !== undefined ? options.size : existing.size;
    let newFilename = existing.filename;
    let newType = existing.type;
    let newSourceType = existing.sourceType;

    if (options.file) {
      const validation = MediaValidator.validate(options.file);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid media file.');
      }

      newFilename = MediaValidator.sanitizeFilename(options.file.originalname);
      const storage = getStorageProvider();

      const uploadResult = await storage.upload(
        {
          buffer: options.file.buffer,
          originalname: newFilename,
          mimetype: validation.detectedMime || options.file.mimetype,
        },
        { folder: `restaurants/${existing.restaurantId}` }
      );

      newUrl = uploadResult.url;
      newMimeType = uploadResult.mimeType;
      newSize = uploadResult.size;
      newType = validation.mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;
      newSourceType = 'UPLOAD';

      // Clean up old local file if different
      if (existing.url && isLocalMediaUrl(existing.url) && existing.url !== newUrl) {
        const oldKey = extractStorageKey(existing.url);
        if (oldKey) await storage.delete(oldKey).catch(() => {});
      }
    }

    const updated = await prisma.media.update({
      where: { id: existing.id },
      data: {
        url: newUrl,
        type: newType,
        mimeType: newMimeType,
        size: newSize,
        filename: newFilename,
        sourceType: newSourceType,
        posterUrl: options.posterUrl !== undefined ? options.posterUrl : existing.posterUrl,
        width: options.width !== undefined ? options.width : existing.width,
        height: options.height !== undefined ? options.height : existing.height,
        duration: options.duration !== undefined ? options.duration : existing.duration,
        desktopUrl: options.desktopUrl !== undefined ? options.desktopUrl : existing.desktopUrl,
        mobileUrl: options.mobileUrl !== undefined ? options.mobileUrl : existing.mobileUrl,
      },
    });

    return updated;
  }

  /**
   * List media metadata for a restaurant with optional pagination
   */
  static async listByRestaurant(
    restaurantId: string,
    options?: MediaType | ListMediaOptions
  ): Promise<any[] | PaginatedMediaResult> {
    const isOptionsObject = typeof options === 'object' && options !== null;
    const type = isOptionsObject ? options.type : (options as MediaType | undefined);
    const page = isOptionsObject && options.page ? Math.max(1, Number(options.page)) : undefined;
    const limit = isOptionsObject && options.limit ? Math.min(100, Math.max(1, Number(options.limit))) : undefined;

    const where = {
      restaurantId,
      ...(type ? { type } : {}),
    };

    const include = {
      foodItem: {
        select: { id: true, name: true },
      },
    };

    if (page !== undefined && limit !== undefined) {
      const [total, items] = await Promise.all([
        prisma.media.count({ where }),
        prisma.media.findMany({
          where,
          include,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    return await prisma.media.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Dissociate media from food item without deleting media
   */
  static async unlinkFromFood(id: string) {
    return await prisma.media.update({
      where: { id },
      data: { foodItemId: null },
    });
  }

  /**
   * Delete media metadata and clean up storage, with dish protection
   */
  static async deleteMedia(id: string, options?: { restaurantId?: string; force?: boolean }) {
    const existing = await prisma.media.findFirst({
      where: {
        id,
        ...(options?.restaurantId ? { restaurantId: options.restaurantId } : {}),
      },
    });

    if (!existing) {
      throw new Error('Media not found.');
    }

    // Check for linked active dishes
    let linkedDishes: { id: string; name: string }[] = [];
    if (existing.foodItemId) {
      const dish = await prisma.foodItem.findUnique({
        where: { id: existing.foodItemId },
        select: { id: true, name: true },
      });
      if (dish) {
        linkedDishes = [dish];
      }
    }

    if (linkedDishes.length > 0 && !options?.force) {
      const error: any = new Error(
        `Cannot delete media: it is currently used by ${linkedDishes.length} dish(es) (${linkedDishes.map(d => d.name).join(', ')}). Remove it from dishes first or use force deletion.`
      );
      error.code = 'MEDIA_IN_USE';
      error.linkedDishes = linkedDishes;
      throw error;
    }

    // Try deleting physical file from storage provider if local upload
    const key = extractStorageKey(existing.url);
    if (key) {
      const storage = getStorageProvider();
      await storage.delete(key).catch(() => {});
    }

    return await prisma.media.delete({
      where: { id: existing.id },
    });
  }
}
