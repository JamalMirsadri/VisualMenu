import { prisma } from '../server/src/prisma';
import { OrderStatus } from '@prisma/client';

async function main() {
  const rest = await prisma.restaurant.findUnique({
    where: { slug: 'demo-restaurant' },
    include: { foods: true, tables: true },
  });

  if (!rest || !rest.foods.length) {
    console.error('Demo restaurant or foods not found');
    process.exit(1);
  }

  const table = rest.tables[0];
  const food = rest.foods[0];

  const orderNumber = `D-${1000 + Math.floor(Math.random() * 9000)}`;

  const order = await prisma.order.create({
    data: {
      restaurantId: rest.id,
      tableId: table?.id || null,
      orderNumber,
      status: OrderStatus.PENDING,
      subtotal: food.price,
      total: food.price,
      currency: rest.currency,
      customerNote: 'Window table, real-time live demo test',
      items: {
        create: [
          {
            foodItemId: food.id,
            foodNameSnapshot: food.name,
            unitPrice: food.price,
            quantity: 1,
            lineTotal: food.price,
            customerNote: 'Extra truffle shavings',
            status: 'PENDING',
          },
        ],
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            metadata: { source: 'live_test' },
          },
        ],
      },
    },
    include: { items: true, table: true },
  });

  console.log(JSON.stringify({
    orderId: order.id,
    restaurantId: rest.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    tableNumber: table?.number,
    foodName: food.name,
    itemId: order.items[0].id,
  }));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
