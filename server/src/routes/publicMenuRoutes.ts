import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

export const publicMenuRouter = Router();

async function getRestaurantMenuData(restaurantSlug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      description: true,
      logo: true,
      coverImage: true,
      phone: true,
      email: true,
      address: true,
      website: true,
      favicon: true,
      currency: true,
      currencySymbol: true,
      defaultLanguage: true,
      active: true,
      settings: {
        select: {
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          theme: true,
          presentationMode: true,
          textStyle: true,
          buttonStyle: true,
          backgroundStyle: true,
          cardStyle: true,
          animationStyle: true,
          categoryStyle: true,
          foodInfoPosition: true,
          progressIndicatorStyle: true,
          environmentBackground: true,
          tableSurface: true,
          lightingPreset: true,
          foodEntranceAnimation: true,
          foodExitAnimation: true,
          cameraMotion: true,
          overlayStyle: true,
          language: true,
          secondaryLanguage: true,
          showPrices: true,
          showCalories: true,
          showPreparationTime: true,
          showAllergens: true,
          showIngredients: true,
          showFavoriteButton: true,
          showDetailsButton: true,
          showOrderButton: true,
          taxEnabled: true,
          taxRate: true,
          serviceChargeEnabled: true,
          serviceChargeRate: true,
        },
      },
      categories: {
        where: { active: true },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          icon: true,
          image: true,
          displayOrder: true,
          active: true,
        },
      },
      foods: {
        where: {
          available: true,
          deletedAt: null,
          category: { active: true },
        },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          categoryId: true,
          name: true,
          slug: true,
          tagline: true,
          description: true,
          price: true,
          currency: true,
          available: true,
          featured: true,
          spicyLevel: true,
          preparationTime: true,
          displayOrder: true,
          calories: true,
          ingredients: true,
          allergens: true,
          media: {
            select: {
              id: true,
              type: true,
              url: true,
              thumbnailUrl: true,
              isPrimary: true,
              width: true,
              height: true,
              desktopUrl: true,
              mobileUrl: true,
              posterUrl: true,
            },
          },
        },
      },
    },
  });

  if (!restaurant) {
    return null;
  }

  const formattedFoods = restaurant.foods.map((food) => {
    const primaryImage =
      food.media.find((m) => m.type === 'IMAGE' && m.isPrimary) ||
      food.media.find((m) => m.type === 'IMAGE');
    const primaryVideo = food.media.find((m) => m.type === 'VIDEO');

    return {
      id: food.id,
      restaurantId: restaurant.id,
      categoryId: food.categoryId,
      name: food.name,
      slug: food.slug,
      tagline: food.tagline || undefined,
      description: food.description || '',
      price: Number(food.price),
      currency: food.currency,
      currencySymbol: restaurant.currencySymbol,
      available: food.available,
      featured: food.featured,
      spicyLevel: food.spicyLevel,
      preparationTime: food.preparationTime || undefined,
      displayOrder: food.displayOrder,
      order: food.displayOrder,
      calories: food.calories || undefined,
      ingredients: food.ingredients,
      allergens: food.allergens,
      image: primaryImage?.url || '',
      video: primaryVideo?.url || undefined,
      desktopUrl: primaryVideo?.desktopUrl || primaryImage?.desktopUrl || undefined,
      mobileUrl: primaryVideo?.mobileUrl || primaryImage?.mobileUrl || undefined,
      posterUrl: primaryVideo?.posterUrl || primaryImage?.posterUrl || undefined,
      media: food.media,
    };
  });

  return {
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      tagline: restaurant.tagline || '',
      description: restaurant.description || '',
      logo: restaurant.logo || '',
      coverImage: restaurant.coverImage || undefined,
      favicon: restaurant.favicon || undefined,
      phone: restaurant.phone || '',
      email: restaurant.email || '',
      address: restaurant.address || '',
      website: restaurant.website || '',
      currency: restaurant.currency,
      currencySymbol: restaurant.currencySymbol,
      primaryLanguage: restaurant.defaultLanguage,
      secondaryLanguage: restaurant.settings?.secondaryLanguage || '',
      openingHours: '18:00 – 00:00',
      isActive: restaurant.active,
      isMenuActive: restaurant.active,
      theme: {
        primaryColor: restaurant.settings?.primaryColor || '#eab308',
        secondaryColor: restaurant.settings?.secondaryColor || '#d97706',
        accentColor: restaurant.settings?.accentColor || '#f59e0b',
        theme: restaurant.settings?.theme || 'DARK_LUXURY',
        presentationMode: restaurant.settings?.presentationMode || 'INDIVIDUAL_VIDEO',
        textStyle: restaurant.settings?.textStyle || 'SERIF',
        buttonStyle: restaurant.settings?.buttonStyle || 'PILL',
        backgroundStyle: restaurant.settings?.backgroundStyle || 'DARK_BLUR',
        cardStyle: restaurant.settings?.cardStyle || 'GLASSMORPHISM',
        animationStyle: restaurant.settings?.animationStyle || 'CINEMATIC',
        categoryStyle: restaurant.settings?.categoryStyle || 'PILLS',
        darkLuxury: restaurant.settings?.theme === 'DARK_LUXURY' || restaurant.settings?.theme === 'dark-luxury',
      },
    },
    settings: restaurant.settings,
    categories: restaurant.categories.map((c) => ({
      id: c.id,
      restaurantId: restaurant.id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      icon: c.icon || undefined,
      image: c.image || undefined,
      order: c.displayOrder,
      isActive: c.active,
    })),
    foods: formattedFoods,
  };
}

/**
 * GET /api/menu/:restaurantSlug
 * Public composite endpoint for menu browsing.
 */
publicMenuRouter.get(
  '/:restaurantSlug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantSlug } = req.params;
      const data = await getRestaurantMenuData(restaurantSlug);

      if (!data) {
        res.status(404).json({
          success: false,
          message: `Restaurant with slug '${restaurantSlug}' was not found.`,
          errorCode: 'RESTAURANT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/menu/:restaurantSlug/table/:tableNumber
 * Resolves table metadata along with customer menu.
 */
publicMenuRouter.get(
  '/:restaurantSlug/table/:tableNumber',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantSlug, tableNumber } = req.params;
      const data = await getRestaurantMenuData(restaurantSlug);

      if (!data) {
        res.status(404).json({
          success: false,
          message: `Restaurant with slug '${restaurantSlug}' was not found.`,
          errorCode: 'RESTAURANT_NOT_FOUND',
        });
        return;
      }

      const table = await prisma.table.findUnique({
        where: {
          restaurantId_number: {
            restaurantId: data.restaurant.id,
            number: tableNumber,
          },
        },
        select: {
          id: true,
          number: true,
          name: true,
          capacity: true,
          location: true,
          active: true,
        },
      });

      if (!table) {
        res.status(404).json({
          success: false,
          message: `Table '${tableNumber}' was not found at ${data.restaurant.name}.`,
          errorCode: 'TABLE_NOT_FOUND',
          data,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ...data,
          table,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
