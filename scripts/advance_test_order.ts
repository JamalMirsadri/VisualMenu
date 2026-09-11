import { OrderStatus, OrderItemStatus } from '@prisma/client';

const orderId = 'b8647918-4e1c-4ffa-9ff2-e0b868ae01e7';
const restaurantId = '8e0cf98b-8708-4875-b9d5-f80ad070dc6b';
const itemId = '418ba9bc-ceea-4317-aca4-bfb0359922be';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loginOwner(): Promise<string> {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@auradining.com',
      password: 'Password123!',
    }),
  });
  const data = await res.json();
  return data.data.token;
}

async function updateStatus(token: string, status: OrderStatus) {
  console.log(`Advancing order status to ${status}...`);
  const res = await fetch(
    `http://localhost:3001/api/restaurants/${restaurantId}/orders/${orderId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    }
  );
  const data = await res.json();
  console.log(`Result:`, data.success ? 'SUCCESS' : data);
}

async function updateItemStatus(token: string, status: OrderItemStatus) {
  console.log(`Advancing item status to ${status}...`);
  const res = await fetch(
    `http://localhost:3001/api/restaurants/${restaurantId}/orders/${orderId}/items/${itemId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    }
  );
  const data = await res.json();
  console.log(`Result:`, data.success ? 'SUCCESS' : data);
}

async function run() {
  const token = await loginOwner();

  console.log('Step 1: PENDING -> CONFIRMED in 2s');
  await sleep(2000);
  await updateStatus(token, OrderStatus.CONFIRMED);

  console.log('Step 2: Item -> PREPARING in 2s');
  await sleep(2000);
  await updateItemStatus(token, OrderItemStatus.PREPARING);

  console.log('Step 3: CONFIRMED -> PREPARING in 2s');
  await sleep(2000);
  await updateStatus(token, OrderStatus.PREPARING);

  console.log('Step 4: Item -> READY in 2s');
  await sleep(2000);
  await updateItemStatus(token, OrderItemStatus.READY);

  console.log('Step 5: PREPARING -> READY in 2s');
  await sleep(2000);
  await updateStatus(token, OrderStatus.READY);

  console.log('Step 6: READY -> SERVED in 3s');
  await sleep(3000);
  await updateStatus(token, OrderStatus.SERVED);

  console.log('All transitions complete!');
}

run().catch(console.error);
