import { prisma } from '../prisma';
import { seedPermissions } from '../constants/permissions';

async function main() {
  console.log('Seeding permissions catalog...');
  await seedPermissions(prisma);
  const count = await prisma.permission.count();
  console.log(`Successfully seeded ${count} permissions.`);
}

main()
  .catch((err) => {
    console.error('Error seeding permissions:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
