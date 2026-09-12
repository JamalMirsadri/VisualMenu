import { PrismaClient, MediaType, QrTargetType, AuditAction, Role, PlatformRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting deterministic database seeding...');

  // 1. Seed Demo Restaurant (Upsert by unique slug)
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo-restaurant' },
    update: {
      name: 'AURA Dining & Charcoal',
      tagline: 'Sensory Haute Gastronomy on Open Embers',
      description: 'A contemporary culinary sanctuary celebrating prime wood-fired cuts, seasonal coastal treasures, and artisanal cocktails in an atmospheric amber-lit setting.',
      logo: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=160&auto=format&fit=crop&q=80',
      coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
      phone: '+33 (0) 1 42 68 55 00',
      email: 'reservations@auradining.com',
      address: '28 Rue de la Paix, 75002 Paris, France',
      website: 'https://auradining.com',
      currency: 'EUR',
      currencySymbol: '€',
      defaultLanguage: 'en',
      active: true,
    },
    create: {
      slug: 'demo-restaurant',
      name: 'AURA Dining & Charcoal',
      tagline: 'Sensory Haute Gastronomy on Open Embers',
      description: 'A contemporary culinary sanctuary celebrating prime wood-fired cuts, seasonal coastal treasures, and artisanal cocktails in an atmospheric amber-lit setting.',
      logo: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=160&auto=format&fit=crop&q=80',
      coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
      phone: '+33 (0) 1 42 68 55 00',
      email: 'reservations@auradining.com',
      address: '28 Rue de la Paix, 75002 Paris, France',
      website: 'https://auradining.com',
      currency: 'EUR',
      currencySymbol: '€',
      defaultLanguage: 'en',
      active: true,
    },
  });

  console.log(`✓ Restaurant: ${restaurant.name} (${restaurant.id})`);

  // 2. Seed Restaurant Settings (Upsert by unique restaurantId)
  await prisma.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      primaryColor: '#eab308',
      secondaryColor: '#d97706',
      theme: 'dark-luxury',
      presentationMode: 'reels',
      language: 'en',
      secondaryLanguage: 'fr',
      showPrices: true,
      showCalories: true,
      showPreparationTime: true,
      taxEnabled: true,
      taxRate: 10.00,
      serviceChargeEnabled: false,
      serviceChargeRate: 0.00,
    },
    create: {
      restaurantId: restaurant.id,
      primaryColor: '#eab308',
      secondaryColor: '#d97706',
      theme: 'dark-luxury',
      presentationMode: 'reels',
      language: 'en',
      secondaryLanguage: 'fr',
      showPrices: true,
      showCalories: true,
      showPreparationTime: true,
      taxEnabled: true,
      taxRate: 10.00,
      serviceChargeEnabled: false,
      serviceChargeRate: 0.00,
    },
  });
  console.log('✓ Restaurant Settings configured');

  // 3. Seed QR Code (Upsert by unique slug)
  await prisma.qrCode.upsert({
    where: { slug: 'demo-restaurant-main' },
    update: {
      name: 'Main Dining Room Entrance QR',
      targetType: QrTargetType.RESTAURANT_MENU,
      targetValue: '/menu/demo-restaurant',
      active: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Main Dining Room Entrance QR',
      slug: 'demo-restaurant-main',
      targetType: QrTargetType.RESTAURANT_MENU,
      targetValue: '/menu/demo-restaurant',
      active: true,
    },
  });
  console.log('✓ QR Code configured');

  // 4. Seed Categories (Upsert by compound unique [restaurantId, name])
  const categoriesData = [
    {
      name: 'Starters',
      slug: 'starters',
      description: 'Intricate preludes, hand-carved crudos, and crisp warm bites',
      icon: 'Sparkles',
      image: 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=600&auto=format&fit=crop&q=80',
      displayOrder: 1,
      active: true,
    },
    {
      name: 'Main Course',
      slug: 'main-course',
      description: 'Coastal line-caught seafood, glazed duck, and artisanal pasta',
      icon: 'Utensils',
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80',
      displayOrder: 2,
      active: true,
    },
    {
      name: 'Grill',
      slug: 'grill',
      description: '45-day dry-aged cuts and charcoal-kissed marinades over binchotan',
      icon: 'Flame',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
      displayOrder: 3,
      active: true,
    },
    {
      name: 'Salad & Raw',
      slug: 'salad',
      description: 'Heirloom botanical harvests, artisan burrata, and tartare creations',
      icon: 'Leaf',
      image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
      displayOrder: 4,
      active: true,
    },
    {
      name: 'Desserts',
      slug: 'desserts',
      description: 'Sculpted confectionery, molten dark cocoa, and rare fruit notes',
      icon: 'Cake',
      image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
      displayOrder: 5,
      active: true,
    },
    {
      name: 'Drinks & Elixirs',
      slug: 'drinks',
      description: 'Smoked mixology, bespoke botanicals, and vintage pairings',
      icon: 'Wine',
      image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
      displayOrder: 6,
      active: true,
    },
  ];

  const categoryMap: Record<string, string> = {};
  for (const cat of categoriesData) {
    const record = await prisma.category.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: cat.name,
        },
      },
      update: {
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        image: cat.image,
        displayOrder: cat.displayOrder,
        active: cat.active,
      },
      create: {
        restaurantId: restaurant.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        image: cat.image,
        displayOrder: cat.displayOrder,
        active: cat.active,
      },
    });
    categoryMap[cat.slug] = record.id;
  }
  console.log(`✓ ${categoriesData.length} Categories seeded`);

  // 5. Seed Food Items & Associated Media
  const foodsData = [
    // Starters
    {
      categorySlug: 'starters',
      name: 'Truffle & Forest Mushroom Arancini',
      slug: 'truffle-forest-mushroom-arancini',
      tagline: 'Crisp Gold Panko & Black Truffle Coulis',
      description: 'Carnaroli rice slow-simmered with porcini stock, filled with molten Taleggio cheese, crisp panko crumb, and crowned with freshly shaved Norcia winter black truffle.',
      price: '14.50',
      currency: 'EUR',
      displayOrder: 1,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 12,
      calories: 380,
      ingredients: ['Carnaroli Rice', 'Black Winter Truffle', 'Taleggio DOP', 'Porcini Essence', 'Chive Oil'],
      allergens: ['Dairy', 'Gluten'],
      imageUrl: 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-chef-plating-a-delicious-salad-41712-large.mp4',
    },
    {
      categorySlug: 'starters',
      name: 'A5 Wagyu Beef Carpaccio',
      slug: 'a5-wagyu-beef-carpaccio',
      tagline: 'Miyazaki Wagyu, Caper Berries & Smoked Aioli',
      description: 'Tissue-thin ribbons of Japanese Miyazaki A5 Wagyu striploin, seasoned with Maldon smoked sea salt flakes, wild watercress, cured egg yolk shavings, and 24-month aged Parmigiano Reggiano.',
      price: '22.00',
      currency: 'EUR',
      displayOrder: 2,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 10,
      calories: 320,
      ingredients: ['A5 Miyazaki Wagyu', 'Cured Egg Yolk', 'Parmigiano 24M', 'White Truffle Emulsion', 'Microgreens'],
      allergens: ['Dairy', 'Eggs'],
      imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-putting-spices-on-raw-meat-40916-large.mp4',
    },
    {
      categorySlug: 'starters',
      name: 'Charred Spanish Octopus',
      slug: 'charred-spanish-octopus',
      tagline: 'Smoked Paprika Purée & Fingerling Crisps',
      description: 'Tender braised Galician octopus tentacle crisped over white binchotan coals, layered over silky saffron potato mousseline with chorizo oil and pickled mustard pearls.',
      price: '19.50',
      currency: 'EUR',
      displayOrder: 3,
      available: true,
      featured: false,
      spicyLevel: 1,
      preparationTime: 15,
      calories: 290,
      ingredients: ['Galician Octopus', 'Saffron Potato', 'Pimentón de la Vera', 'Pickled Shallots', 'Cilantro Cress'],
      allergens: ['Molluscs'],
      imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-meat-being-cooked-on-a-grill-42998-large.mp4',
    },

    // Grill
    {
      categorySlug: 'grill',
      name: 'Chicken Tikka Charcoal',
      slug: 'chicken-tikka-charcoal',
      tagline: 'Spiced & Charred Over Binchotan Embers',
      description: 'Free-range organic chicken thighs marinated for 24 hours in Greek yogurt, Kashmiri deghi chili, roasted cumin, and cold-pressed mustard oil, blistered over embers and served with burnt lime.',
      price: '13.90',
      currency: 'EUR',
      displayOrder: 4,
      available: true,
      featured: true,
      spicyLevel: 2,
      preparationTime: 18,
      calories: 460,
      ingredients: ['Free-range Chicken', 'Kashmiri Chili', 'Greek Yogurt', 'Wild Mint Chutney', 'Charred Lime'],
      allergens: ['Dairy'],
      imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-chicken-skewers-turning-on-a-charcoal-grill-40899-large.mp4',
    },
    {
      categorySlug: 'grill',
      name: '45-Day Dry-Aged Ribeye',
      slug: '45-day-dry-aged-ribeye',
      tagline: 'Bone-In Prime Cut with Bone Marrow Glaze',
      description: '350g Black Angus prime ribeye, dry-aged in Himalayan rock salt chambers for deep nutty richness, seared over smoking oak embers and rested with smoked rosemary bone marrow butter.',
      price: '36.50',
      currency: 'EUR',
      displayOrder: 5,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 22,
      calories: 780,
      ingredients: ['Black Angus Prime Beef', 'Bone Marrow Butter', 'Himalayan Salt', 'Roasted Garlic Head'],
      allergens: ['Dairy'],
      imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-meat-being-cooked-on-a-grill-42998-large.mp4',
    },
    {
      categorySlug: 'grill',
      name: 'Herb-Crusted Colorado Lamb Chops',
      slug: 'herb-crusted-colorado-lamb-chops',
      tagline: 'Pistachio Pistou, Charred Eggplant & Jus',
      description: 'Double-cut rack chops enveloped in a vibrant parsley, rosemary and Sicilian pistachio crust, paired with wood-smoked Japanese eggplant purée and spiced lamb reduction.',
      price: '32.00',
      currency: 'EUR',
      displayOrder: 6,
      available: true,
      featured: false,
      spicyLevel: 0,
      preparationTime: 20,
      calories: 640,
      ingredients: ['Colorado Lamb', 'Bronte Pistachio', 'Fresh Rosemary', 'Smoked Eggplant', 'Natural Jus'],
      allergens: ['Nuts'],
      imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1000&auto=format&fit=crop&q=85',
    },

    // Main Course
    {
      categorySlug: 'main-course',
      name: 'Pan-Seared Chilean Sea Bass',
      slug: 'pan-seared-chilean-sea-bass',
      tagline: 'Miso Mirin Glaze & Lemongrass Dashi',
      description: 'Sustainably caught Patagonian toothfish seared with a caramelized sweet white miso crust, served floating in a delicate lemongrass-infused dashi broth with charred baby bok choy.',
      price: '29.50',
      currency: 'EUR',
      displayOrder: 7,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 18,
      calories: 490,
      ingredients: ['Chilean Sea Bass', 'Saikyo White Miso', 'Lemongrass Dashi', 'Bok Choy', 'Sesame'],
      allergens: ['Fish', 'Soy', 'Sesame'],
      imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-chef-plating-a-delicious-salad-41712-large.mp4',
    },
    {
      categorySlug: 'main-course',
      name: 'Duck Breast Confit & Blood Orange',
      slug: 'duck-breast-confit-blood-orange',
      tagline: 'Crispy Skin, Spiced Parsnip & Thyme Reduction',
      description: 'Slow-poached then flash-crisped French duck breast served with caramelized parsnip silk, bitter Sicilian blood orange segment reduction, and sautéed wild chanterelles.',
      price: '27.00',
      currency: 'EUR',
      displayOrder: 8,
      available: true,
      featured: false,
      spicyLevel: 0,
      preparationTime: 16,
      calories: 580,
      ingredients: ['French Duck Breast', 'Blood Orange', 'Parsnip Silk', 'Wild Chanterelles'],
      allergens: ['Dairy'],
      imageUrl: 'https://images.unsplash.com/photo-1514944298352-1bc7d2c3df49?w=1000&auto=format&fit=crop&q=85',
    },

    // Salad & Raw
    {
      categorySlug: 'salad',
      name: 'Burrata Pugliese & Charred Peach',
      slug: 'burrata-pugliese-charred-peach',
      tagline: 'Creamy Stracciatella, Aged Balsamico & Basil',
      description: 'Artisanal 250g Apulian burrata, paired with grill-marked white peaches, heritage tomatoes, wild rocket, 12-year Modena balsamic glaze, and crispy sourdough crisps.',
      price: '16.50',
      currency: 'EUR',
      displayOrder: 9,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 10,
      calories: 420,
      ingredients: ['Pugliese Burrata', 'White Peach', 'Heirloom Tomatoes', '12Y Modena Aceto', 'Basil Oil'],
      allergens: ['Dairy', 'Gluten'],
      imageUrl: 'https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-chef-plating-a-delicious-salad-41712-large.mp4',
    },
    {
      categorySlug: 'salad',
      name: 'Yellowfin Tuna Tartare & Yuzu',
      slug: 'yellowfin-tuna-tartare-yuzu',
      tagline: 'Avocado Espuma, Black Caviar & Lotus Root',
      description: 'Hand-diced sashimi grade Pacific tuna tossed in yuzu-white soy dressing, topped with Imperial Baeri caviar, velvety avocado mousse, and golden fried lotus chips.',
      price: '21.00',
      currency: 'EUR',
      displayOrder: 10,
      available: true,
      featured: false,
      spicyLevel: 1,
      preparationTime: 12,
      calories: 280,
      ingredients: ['Yellowfin Tuna', 'Baeri Caviar', 'Hass Avocado', 'Yuzu Kosho', 'Lotus Root'],
      allergens: ['Fish', 'Soy'],
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1000&auto=format&fit=crop&q=85',
    },

    // Desserts
    {
      categorySlug: 'desserts',
      name: 'Valrhona Guanaja 70% Molten Dome',
      slug: 'valrhona-guanaja-molten-dome',
      tagline: 'Smoked Vanilla Gelato & Gold Leaf Shards',
      description: 'Warm dark chocolate sphere filled with molten Valrhona Guanaja lava, cracked open with Madagascar smoked bourbon vanilla bean gelato and 24K edible gold dusting.',
      price: '14.00',
      currency: 'EUR',
      displayOrder: 11,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 14,
      calories: 520,
      ingredients: ['Valrhona 70% Chocolate', 'Bourbon Vanilla Bean', 'Clotted Cream', '24K Gold Leaf'],
      allergens: ['Dairy', 'Eggs', 'Gluten'],
      imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-chocolate-cream-on-a-sponge-cake-41716-large.mp4',
    },
    {
      categorySlug: 'desserts',
      name: 'Bronte Pistachio & Wild Berry Panna Cotta',
      slug: 'bronte-pistachio-wild-berry-panna-cotta',
      tagline: 'Silky Cream, Tart Raspberry Glaze & Tuile',
      description: 'Delicate Sicilian pistachio panna cotta with velvety cream texture, balanced by tart macerated mountain raspberries and a fragile caramel honeycomb lace.',
      price: '12.50',
      currency: 'EUR',
      displayOrder: 12,
      available: true,
      featured: false,
      spicyLevel: 0,
      preparationTime: 8,
      calories: 390,
      ingredients: ['Bronte Pistachio Puree', 'Double Cream', 'Organic Raspberries', 'Honeycomb'],
      allergens: ['Dairy', 'Nuts'],
      imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1000&auto=format&fit=crop&q=85',
    },

    // Drinks
    {
      categorySlug: 'drinks',
      name: 'Smoked Rosemary Old Fashioned',
      slug: 'smoked-rosemary-old-fashioned',
      tagline: 'Bourbon Reserve, Bitters & Torch-Smoked Herbs',
      description: 'Woodford Reserve Kentucky Bourbon infused under a glass cloche with torched rosemary smoke, raw demerara sugar syrup, and barrel-aged Angostura aromatic bitters over a hand-carved ice sphere.',
      price: '16.00',
      currency: 'EUR',
      displayOrder: 13,
      available: true,
      featured: true,
      spicyLevel: 0,
      preparationTime: 6,
      calories: 195,
      ingredients: ['Woodford Reserve Bourbon', 'Organic Rosemary Smoke', 'Demerara', 'Orange Peel'],
      allergens: [],
      imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-drink-into-a-glass-with-ice-42457-large.mp4',
    },
    {
      categorySlug: 'drinks',
      name: 'Yuzu Botanical Spritz (Non-Alcoholic)',
      slug: 'yuzu-botanical-spritz',
      tagline: 'Sparkling Yuzu, Wild Mint & Elderflower',
      description: 'Cold-pressed Japanese yuzu juice gently lengthened with artisan elderflower botanical essence, crushed garden mint, sparkling mountain spring water, and dehydrated candied lime wheel.',
      price: '9.50',
      currency: 'EUR',
      displayOrder: 14,
      available: true,
      featured: false,
      spicyLevel: 0,
      preparationTime: 5,
      calories: 85,
      ingredients: ['Japanese Yuzu', 'Elderflower Cordial', 'Sparkling Spring Water', 'Garden Mint'],
      allergens: [],
      imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=1000&auto=format&fit=crop&q=85',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-drink-into-a-glass-with-ice-42457-large.mp4',
    },
  ];

  for (const food of foodsData) {
    const categoryId = categoryMap[food.categorySlug];
    if (!categoryId) continue;

    // Upsert food item by [restaurantId, slug]
    const foodItem = await prisma.foodItem.upsert({
      where: {
        restaurantId_slug: {
          restaurantId: restaurant.id,
          slug: food.slug,
        },
      },
      update: {
        categoryId,
        name: food.name,
        tagline: food.tagline,
        description: food.description,
        price: food.price,
        currency: food.currency,
        displayOrder: food.displayOrder,
        available: food.available,
        featured: food.featured,
        spicyLevel: food.spicyLevel,
        preparationTime: food.preparationTime,
        calories: food.calories,
        ingredients: food.ingredients,
        allergens: food.allergens,
        deletedAt: null, // Clear soft deletion if re-seeded
      },
      create: {
        restaurantId: restaurant.id,
        categoryId,
        name: food.name,
        slug: food.slug,
        tagline: food.tagline,
        description: food.description,
        price: food.price,
        currency: food.currency,
        displayOrder: food.displayOrder,
        available: food.available,
        featured: food.featured,
        spicyLevel: food.spicyLevel,
        preparationTime: food.preparationTime,
        calories: food.calories,
        ingredients: food.ingredients,
        allergens: food.allergens,
      },
    });

    // Seed or update Primary Image Media
    const existingImage = await prisma.media.findFirst({
      where: { foodItemId: foodItem.id, type: MediaType.IMAGE },
    });
    if (!existingImage) {
      await prisma.media.create({
        data: {
          restaurantId: restaurant.id,
          foodItemId: foodItem.id,
          type: MediaType.IMAGE,
          url: food.imageUrl,
          altText: `${food.name} photo`,
          isPrimary: true,
        },
      });
    }

    // Seed Video Media if present
    if (food.videoUrl) {
      const existingVideo = await prisma.media.findFirst({
        where: { foodItemId: foodItem.id, type: MediaType.VIDEO },
      });
      if (!existingVideo) {
        await prisma.media.create({
          data: {
            restaurantId: restaurant.id,
            foodItemId: foodItem.id,
            type: MediaType.VIDEO,
            url: food.videoUrl,
            altText: `${food.name} cinematic video`,
            isPrimary: false,
          },
        });
      }
    }
  }

  console.log(`✓ ${foodsData.length} Food items & media records seeded`);

  // 6. Seed Demo Users & UserRestaurant Role Assignments
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const demoUsers = [
    { email: 'owner@auradining.com', name: 'Elena Rostova', role: Role.OWNER },
    { email: 'admin@auradining.com', name: 'Julian Vance', role: Role.ADMIN },
    { email: 'manager@auradining.com', name: 'Sophie Laurent', role: Role.MANAGER },
    { email: 'staff@auradining.com', name: 'Lucas Moreau', role: Role.STAFF },
  ];

  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        active: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        active: true,
      },
    });

    await prisma.userRestaurant.upsert({
      where: {
        userId_restaurantId: {
          userId: user.id,
          restaurantId: restaurant.id,
        },
      },
      update: {
        role: u.role,
      },
      create: {
        userId: user.id,
        restaurantId: restaurant.id,
        role: u.role,
      },
    });
  }
  console.log(`✓ ${demoUsers.length} Users & Role assignments seeded (Password: Password123!)`);

  // 6b. Seed Deterministic Platform Users (SaaS Scope — No restaurant membership required)
  const platformUsers = [
    { email: 'platformadmin@auramenu.com', name: 'Alexander Wright', platformRole: PlatformRole.PLATFORM_ADMIN },
    { email: 'support@auramenu.com', name: 'Elena Gomez', platformRole: PlatformRole.PLATFORM_SUPPORT },
    { email: 'viewer@auramenu.com', name: 'Marcus Sterling', platformRole: PlatformRole.PLATFORM_VIEWER },
  ];

  for (const pu of platformUsers) {
    await prisma.user.upsert({
      where: { email: pu.email },
      update: {
        name: pu.name,
        passwordHash,
        platformRole: pu.platformRole,
        active: true,
      },
      create: {
        email: pu.email,
        name: pu.name,
        passwordHash,
        platformRole: pu.platformRole,
        active: true,
      },
    });
  }
  console.log(`✓ ${platformUsers.length} Platform Operators seeded (No restaurant membership required)`);

  // 6c. Seed SaaS Platform Settings
  const existingSettings = await prisma.platformSettings.findFirst();
  if (!existingSettings) {
    await prisma.platformSettings.create({
      data: {
        platformName: 'Aura SaaS Menu Platform',
        supportEmail: 'support@auramenu.com',
        defaultCurrency: 'EUR',
        defaultLanguage: 'en',
        maintenanceMode: false,
        allowRegistration: true,
      },
    });
  }
  console.log('✓ SaaS Platform Settings configured');

  // 7. Seed Tables & Table-specific QR Codes
  const tablesData = [
    { number: '1', name: 'Terrace Sunset 1', capacity: 2, location: 'Terrace', active: true },
    { number: '2', name: 'Main Dining 2', capacity: 4, location: 'Main Dining Room', active: true },
    { number: '3', name: 'Main Dining 3', capacity: 4, location: 'Main Dining Room', active: true },
    { number: '4', name: 'Private Booth 4', capacity: 6, location: 'VIP Mezzanine', active: true },
    { number: '5', name: "Chef's Counter 5", capacity: 2, location: "Chef's Counter", active: true },
    { number: '12', name: 'Garden Pergola 12', capacity: 4, location: 'Garden Pavilion', active: true },
  ];

  for (const t of tablesData) {
    const tableRecord = await prisma.table.upsert({
      where: {
        restaurantId_number: {
          restaurantId: restaurant.id,
          number: t.number,
        },
      },
      update: {
        name: t.name,
        capacity: t.capacity,
        location: t.location,
        active: t.active,
      },
      create: {
        restaurantId: restaurant.id,
        number: t.number,
        name: t.name,
        capacity: t.capacity,
        location: t.location,
        active: t.active,
      },
    });

    const qrSlug = `table-${t.number}-aura-dining`;
    await prisma.qrCode.upsert({
      where: {
        slug: qrSlug,
      },
      update: {
        tableId: tableRecord.id,
        name: `Table ${t.number} QR`,
        targetType: QrTargetType.TABLE_MENU,
        targetValue: `/menu/aura-dining/table/${t.number}`,
        active: true,
      },
      create: {
        restaurantId: restaurant.id,
        tableId: tableRecord.id,
        name: `Table ${t.number} QR`,
        slug: qrSlug,
        targetType: QrTargetType.TABLE_MENU,
        targetValue: `/menu/aura-dining/table/${t.number}`,
        active: true,
      },
    });
  }
  console.log(`✓ ${tablesData.length} Dining tables & Table QR codes seeded`);

  // 8. Record Seed in AuditLog
  await prisma.auditLog.create({
    data: {
      restaurantId: restaurant.id,
      action: AuditAction.CREATE,
      entityType: 'System',
      entityId: restaurant.id,
      metadata: { note: 'Initial database seed executed successfully' },
    },
  });
  console.log('✓ Initial audit log recorded');

  console.log('🎉 Deterministic seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
