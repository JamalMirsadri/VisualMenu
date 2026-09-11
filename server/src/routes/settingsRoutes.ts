import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess } from '../middleware/authMiddleware';

export const settingsRouter = Router();

// Allowed Enums & Constants
export const VALID_THEMES = new Set(['DARK_LUXURY', 'LIGHT_MINIMAL', 'WARM_RESTAURANT', 'MODERN_GLASS']);
export const VALID_PRESENTATION_MODES = new Set(['INDIVIDUAL_VIDEO', 'SHARED_ENVIRONMENT', 'VISUAL_IMAGE']);
export const VALID_TEXT_STYLES = new Set(['SERIF', 'SANS', 'MODERN']);
export const VALID_BUTTON_STYLES = new Set(['ROUNDED', 'PILL', 'SQUARE', 'GLASS', 'OUTLINE']);
export const VALID_BACKGROUND_STYLES = new Set(['SOLID', 'GRADIENT', 'SUBTLE_MESH', 'DARK_BLUR']);
export const VALID_CARD_STYLES = new Set(['FLOATING', 'MINIMAL', 'GLASSMORPHISM', 'BORDERED', 'ROUNDED_LG', 'ROUNDED_XL', 'ROUNDED_2XL', 'SQUARE', 'GLASS']);
export const VALID_ANIMATION_STYLES = new Set(['SMOOTH', 'FAST', 'CINEMATIC', 'MINIMAL']);
export const VALID_CATEGORY_STYLES = new Set(['PILLS', 'TEXT', 'MINIMAL', 'ICON_PLUS_TEXT']);
export const VALID_FOOD_INFO_POSITIONS = new Set(['BOTTOM', 'SIDE', 'OVERLAY', 'BOTTOM_OVERLAY', 'SIDE_PANEL', 'CARD_ATTACHED']);
export const VALID_PROGRESS_STYLES = new Set(['BAR', 'BARS', 'DOTS', 'NUMBERS', 'HIDDEN', 'NONE']);
export const VALID_LIGHTING_PRESETS = new Set(['WARM', 'COOL', 'DRAMATIC', 'NATURAL', 'NEUTRAL', 'DARK', 'SOFT']);
export const VALID_ENTRANCE_MOTIONS = new Set(['FADE', 'SLIDE_UP', 'SCALE', 'RISE', 'NONE', 'FADE_UP', 'SCALE_UP', 'SLIDE_RIGHT', 'SMOOTH']);
export const VALID_EXIT_MOTIONS = new Set(['FADE', 'SLIDE_DOWN', 'SCALE_DOWN', 'NONE', 'SMOOTH', 'SLIDE_LEFT']);
export const VALID_CAMERA_MOTIONS = new Set(['NONE', 'SUBTLE_ZOOM', 'PARALLAX_DRIFT', 'GENTLE_ZOOM', 'SLOW_PAN', 'STATIC']);
export const VALID_OVERLAY_STYLES = new Set(['GRADIENT_BOTTOM', 'FULL_DIM', 'MINIMAL_SCRIM', 'SUBTLE', 'MEDIUM', 'HEAVY', 'GRADIENT']);

// Helper to normalize theme aliases
export function normalizeTheme(val?: string): string {
  if (!val) return 'DARK_LUXURY';
  const u = val.toUpperCase().replace(/-/g, '_');
  if (VALID_THEMES.has(u)) return u;
  if (val === 'dark-luxury') return 'DARK_LUXURY';
  if (val === 'light-minimal') return 'LIGHT_MINIMAL';
  if (val === 'warm-restaurant') return 'WARM_RESTAURANT';
  if (val === 'modern-glass') return 'MODERN_GLASS';
  return val;
}

// Helper to normalize presentation mode aliases
export function normalizePresentationMode(val?: string): string {
  if (!val) return 'INDIVIDUAL_VIDEO';
  const u = val.toUpperCase().replace(/-/g, '_');
  if (VALID_PRESENTATION_MODES.has(u)) return u;
  if (val === 'reels' || val === 'individual') return 'INDIVIDUAL_VIDEO';
  if (val === 'shared-environment') return 'SHARED_ENVIRONMENT';
  if (val === 'visual-image' || val === 'image') return 'VISUAL_IMAGE';
  return val;
}

// GET /api/restaurants/:restaurantId/settings
settingsRouter.get(
  '/restaurants/:restaurantId/settings',
  validateUuidParams(['restaurantId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER, Role.STAFF]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const settings = await prisma.restaurantSettings.findUnique({
        where: { restaurantId },
      });

      if (!settings) {
        res.status(404).json({
          success: false,
          message: 'Restaurant settings not found.',
          errorCode: 'SETTINGS_NOT_FOUND',
        });
        return;
      }

      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/restaurants/:restaurantId/settings (OWNER & ADMIN only)
settingsRouter.put(
  '/restaurants/:restaurantId/settings',
  validateUuidParams(['restaurantId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const b = req.body;

      // 1. Validate & Normalize Theme
      let normalizedTheme: string | undefined;
      if (b.theme !== undefined) {
        normalizedTheme = normalizeTheme(b.theme);
        if (!VALID_THEMES.has(normalizedTheme)) {
          res.status(400).json({
            success: false,
            errorCode: 'VALIDATION_ERROR',
            message: `Invalid theme '${b.theme}'. Allowed: ${Array.from(VALID_THEMES).join(', ')}`,
          });
          return;
        }
      }

      // 2. Validate & Normalize Presentation Mode
      let normalizedMode: string | undefined;
      if (b.presentationMode !== undefined) {
        normalizedMode = normalizePresentationMode(b.presentationMode);
        if (!VALID_PRESENTATION_MODES.has(normalizedMode)) {
          res.status(400).json({
            success: false,
            errorCode: 'VALIDATION_ERROR',
            message: `Invalid presentationMode '${b.presentationMode}'. Allowed: ${Array.from(VALID_PRESENTATION_MODES).join(', ')}`,
          });
          return;
        }
      }

      // 3. Validate Visual Styling Enums if provided
      if (b.textStyle !== undefined && !VALID_TEXT_STYLES.has(b.textStyle.toUpperCase())) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Invalid textStyle '${b.textStyle}'. Allowed: ${Array.from(VALID_TEXT_STYLES).join(', ')}`,
        });
        return;
      }

      if (b.buttonStyle !== undefined && !VALID_BUTTON_STYLES.has(b.buttonStyle.toUpperCase())) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Invalid buttonStyle '${b.buttonStyle}'. Allowed: ${Array.from(VALID_BUTTON_STYLES).join(', ')}`,
        });
        return;
      }

      if (b.cardStyle !== undefined && !VALID_CARD_STYLES.has(b.cardStyle.toUpperCase())) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Invalid cardStyle '${b.cardStyle}'. Allowed: ${Array.from(VALID_CARD_STYLES).join(', ')}`,
        });
        return;
      }

      if (b.categoryStyle !== undefined && !VALID_CATEGORY_STYLES.has(b.categoryStyle.toUpperCase())) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Invalid categoryStyle '${b.categoryStyle}'. Allowed: ${Array.from(VALID_CATEGORY_STYLES).join(', ')}`,
        });
        return;
      }

      if (b.lightingPreset !== undefined && !VALID_LIGHTING_PRESETS.has(b.lightingPreset.toUpperCase())) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Invalid lightingPreset '${b.lightingPreset}'. Allowed: ${Array.from(VALID_LIGHTING_PRESETS).join(', ')}`,
        });
        return;
      }

      const updated = await prisma.restaurantSettings.upsert({
        where: { restaurantId },
        update: {
          primaryColor: b.primaryColor,
          secondaryColor: b.secondaryColor,
          accentColor: b.accentColor,
          theme: normalizedTheme,
          presentationMode: normalizedMode,
          textStyle: b.textStyle ? b.textStyle.toUpperCase() : undefined,
          buttonStyle: b.buttonStyle ? b.buttonStyle.toUpperCase() : undefined,
          backgroundStyle: b.backgroundStyle ? b.backgroundStyle.toUpperCase() : undefined,
          cardStyle: b.cardStyle ? b.cardStyle.toUpperCase() : undefined,
          animationStyle: b.animationStyle ? b.animationStyle.toUpperCase() : undefined,
          categoryStyle: b.categoryStyle ? b.categoryStyle.toUpperCase() : undefined,
          foodInfoPosition: b.foodInfoPosition ? b.foodInfoPosition.toUpperCase() : undefined,
          progressIndicatorStyle: b.progressIndicatorStyle ? b.progressIndicatorStyle.toUpperCase() : undefined,
          environmentBackground: b.environmentBackground,
          tableSurface: b.tableSurface,
          lightingPreset: b.lightingPreset ? b.lightingPreset.toUpperCase() : undefined,
          foodEntranceAnimation: b.foodEntranceAnimation ? b.foodEntranceAnimation.toUpperCase() : undefined,
          foodExitAnimation: b.foodExitAnimation ? b.foodExitAnimation.toUpperCase() : undefined,
          cameraMotion: b.cameraMotion ? b.cameraMotion.toUpperCase() : undefined,
          overlayStyle: b.overlayStyle ? b.overlayStyle.toUpperCase() : undefined,
          language: b.language,
          secondaryLanguage: b.secondaryLanguage,
          showPrices: b.showPrices !== undefined ? Boolean(b.showPrices) : undefined,
          showCalories: b.showCalories !== undefined ? Boolean(b.showCalories) : undefined,
          showPreparationTime: b.showPreparationTime !== undefined ? Boolean(b.showPreparationTime) : undefined,
          showAllergens: b.showAllergens !== undefined ? Boolean(b.showAllergens) : undefined,
          showIngredients: b.showIngredients !== undefined ? Boolean(b.showIngredients) : undefined,
          showFavoriteButton: b.showFavoriteButton !== undefined ? Boolean(b.showFavoriteButton) : undefined,
          showDetailsButton: b.showDetailsButton !== undefined ? Boolean(b.showDetailsButton) : undefined,
          showOrderButton: b.showOrderButton !== undefined ? Boolean(b.showOrderButton) : undefined,
        },
        create: {
          restaurantId,
          primaryColor: b.primaryColor || '#eab308',
          secondaryColor: b.secondaryColor || '#d97706',
          accentColor: b.accentColor || '#f59e0b',
          theme: normalizedTheme || 'DARK_LUXURY',
          presentationMode: normalizedMode || 'INDIVIDUAL_VIDEO',
          textStyle: b.textStyle ? b.textStyle.toUpperCase() : 'SERIF',
          buttonStyle: b.buttonStyle ? b.buttonStyle.toUpperCase() : 'PILL',
          backgroundStyle: b.backgroundStyle ? b.backgroundStyle.toUpperCase() : 'DARK_BLUR',
          cardStyle: b.cardStyle ? b.cardStyle.toUpperCase() : 'GLASSMORPHISM',
          animationStyle: b.animationStyle ? b.animationStyle.toUpperCase() : 'CINEMATIC',
          categoryStyle: b.categoryStyle ? b.categoryStyle.toUpperCase() : 'PILLS',
          foodInfoPosition: b.foodInfoPosition ? b.foodInfoPosition.toUpperCase() : 'BOTTOM_OVERLAY',
          progressIndicatorStyle: b.progressIndicatorStyle ? b.progressIndicatorStyle.toUpperCase() : 'BAR',
          environmentBackground: b.environmentBackground || 'DARK_STUDIO',
          tableSurface: b.tableSurface || 'DARK_MARBLE',
          lightingPreset: b.lightingPreset ? b.lightingPreset.toUpperCase() : 'WARM',
          foodEntranceAnimation: b.foodEntranceAnimation ? b.foodEntranceAnimation.toUpperCase() : 'SCALE',
          foodExitAnimation: b.foodExitAnimation ? b.foodExitAnimation.toUpperCase() : 'FADE',
          cameraMotion: b.cameraMotion ? b.cameraMotion.toUpperCase() : 'SUBTLE_ZOOM',
          overlayStyle: b.overlayStyle ? b.overlayStyle.toUpperCase() : 'GRADIENT_BOTTOM',
          language: b.language || 'en',
          secondaryLanguage: b.secondaryLanguage,
          showPrices: b.showPrices !== undefined ? Boolean(b.showPrices) : true,
          showCalories: b.showCalories !== undefined ? Boolean(b.showCalories) : true,
          showPreparationTime: b.showPreparationTime !== undefined ? Boolean(b.showPreparationTime) : true,
          showAllergens: b.showAllergens !== undefined ? Boolean(b.showAllergens) : true,
          showIngredients: b.showIngredients !== undefined ? Boolean(b.showIngredients) : true,
          showFavoriteButton: b.showFavoriteButton !== undefined ? Boolean(b.showFavoriteButton) : true,
          showDetailsButton: b.showDetailsButton !== undefined ? Boolean(b.showDetailsButton) : true,
          showOrderButton: b.showOrderButton !== undefined ? Boolean(b.showOrderButton) : true,
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'RestaurantSettings',
        entityId: updated.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);
