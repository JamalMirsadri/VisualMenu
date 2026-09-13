import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticateToken } from '../middleware/authMiddleware';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { PERMISSION_CATALOG, ROLE_PERMISSIONS } from '../constants/permissions';

export const authRouter = Router();
import { getJwtSecret } from '../config';

function resolveUserRestaurantPermissions(ur: {
  role: Role;
  status: string;
  jobTemplate: string | null;
  permissions: { permission: { key: string } }[];
}): string[] {
  if (ur.status === 'DISABLED') {
    return [];
  }
  if (ur.role === Role.OWNER) {
    return PERMISSION_CATALOG.map((p) => p.key);
  }
  if (ur.permissions && ur.permissions.length > 0) {
    return ur.permissions.map((p) => p.permission.key);
  }
  if (ur.jobTemplate === null) {
    return (ROLE_PERMISSIONS[ur.role] || []) as string[];
  }
  return [];
}

/**
 * POST /api/auth/login
 * Validates user credentials and issues a JWT token with restaurant assignments.
 */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      errorCode: 'MISSING_CREDENTIALS',
      message: 'Email and password are required.',
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        userRestaurants: {
          include: {
            restaurant: {
              select: {
                id: true,
                slug: true,
                name: true,
                logo: true,
              },
            },
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.active) {
      res.status(401).json({
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    const restaurants = user.userRestaurants.map((ur) => ({
      id: ur.restaurant.id,
      name: ur.restaurant.name,
      slug: ur.restaurant.slug,
      logo: ur.restaurant.logo,
      role: ur.role,
      status: ur.status,
      jobTemplate: ur.jobTemplate,
      permissions: resolveUserRestaurantPermissions(ur),
    }));

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole || null,
        },
        token,
        restaurants,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'An unexpected error occurred during login.',
    });
  }
});

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile and restaurant permissions.
 */
authRouter.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        userRestaurants: {
          include: {
            restaurant: {
              select: {
                id: true,
                slug: true,
                name: true,
                logo: true,
              },
            },
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        errorCode: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
      return;
    }

    const restaurants = user.userRestaurants.map((ur) => ({
      id: ur.restaurant.id,
      name: ur.restaurant.name,
      slug: ur.restaurant.slug,
      logo: ur.restaurant.logo,
      role: ur.role,
      status: ur.status,
      jobTemplate: ur.jobTemplate,
      permissions: resolveUserRestaurantPermissions(ur),
    }));

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole || null,
        },
        restaurants,
      },
    });
  } catch (err: any) {
    console.error('Error in /api/auth/me:', err);
    res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to retrieve user profile.',
    });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
});
