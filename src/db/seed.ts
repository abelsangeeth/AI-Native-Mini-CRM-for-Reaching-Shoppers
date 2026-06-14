import { initDatabase, query } from './sqlite';

const seed = async () => {
  console.log('Starting database seeding...');
  await initDatabase();

  // Clear existing records
  await query.run('DELETE FROM communication_logs');
  await query.run('DELETE FROM campaigns');
  await query.run('DELETE FROM segments');
  await query.run('DELETE FROM orders');
  await query.run('DELETE FROM customers');

  // Insert mock customers
  const customers = [
    { id: 'c1', name: 'Sophia Martinez', email: 'sophia.m@example.com', phone: '+15550101', created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c2', name: 'Liam Johnson', email: 'liam.j@example.com', phone: '+15550102', created_at: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c3', name: 'Olivia Brown', email: 'olivia.b@example.com', phone: '+15550103', created_at: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c4', name: 'Noah Davis', email: 'noah.d@example.com', phone: '+15550104', created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c5', name: 'Ava Wilson', email: 'ava.w@example.com', phone: '+15550105', created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c6', name: 'Isabella Taylor', email: 'isabella.t@example.com', phone: '+15550106', created_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c7', name: 'Mason Anderson', email: 'mason.a@example.com', phone: '+15550107', created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c8', name: 'Charlotte White', email: 'charlotte.w@example.com', phone: '+15550108', created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c9', name: 'James Harris', email: 'james.h@example.com', phone: '+15550109', created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c10', name: 'Emily Martin', email: 'emily.m@example.com', phone: '+15550110', created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'c11', name: 'Benjamin Garcia', email: 'benjamin.g@example.com', phone: '+15550111', created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }
  ];

  for (const c of customers) {
    await query.run(
      'INSERT INTO customers (id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)',
      [c.id, c.name, c.email, c.phone, c.created_at]
    );
  }

  // Insert mock orders
  const orders = [
    // Sophia Martinez - high spender on bags
    { id: 'o1', customer_id: 'c1', amount: 250.00, status: 'completed', items: JSON.stringify([{ name: 'Leather Tote Bag', category: 'Bags', qty: 1 }]), created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'o2', customer_id: 'c1', amount: 15.00, status: 'completed', items: JSON.stringify([{ name: 'Bag Charm Keychain', category: 'Accessories', qty: 1 }]), created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Liam Johnson - coffee lover
    { id: 'o3', customer_id: 'c2', amount: 45.00, status: 'completed', items: JSON.stringify([{ name: 'Espresso Dark Roast Beans', category: 'Coffee', qty: 2 }, { name: 'Ceramic Mug', category: 'Accessories', qty: 1 }]), created_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Olivia Brown - sneakers and shoes
    { id: 'o4', customer_id: 'c3', amount: 120.00, status: 'completed', items: JSON.stringify([{ name: 'Retro White Sneakers', category: 'Shoes', qty: 1 }]), created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Noah Davis - low spender coffee
    { id: 'o5', customer_id: 'c4', amount: 15.00, status: 'completed', items: JSON.stringify([{ name: 'Caramel Macchiato Beans', category: 'Coffee', qty: 1 }]), created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Ava Wilson - high spender jewelry
    { id: 'o6', customer_id: 'c5', amount: 350.00, status: 'completed', items: JSON.stringify([{ name: 'Gold Link Bracelet', category: 'Jewelry', qty: 1 }]), created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Isabella Taylor - athletic shoes
    { id: 'o7', customer_id: 'c6', amount: 85.00, status: 'completed', items: JSON.stringify([{ name: 'Neon Running Shoes', category: 'Shoes', qty: 1 }]), created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Mason Anderson - light coffee
    { id: 'o8', customer_id: 'c7', amount: 18.00, status: 'completed', items: JSON.stringify([{ name: 'French Roast Beans', category: 'Coffee', qty: 1 }]), created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Charlotte White - cosmetics
    { id: 'o9', customer_id: 'c8', amount: 65.00, status: 'completed', items: JSON.stringify([{ name: 'Matte Liquid Lipstick', category: 'Cosmetics', qty: 2 }, { name: 'Eyeliner Pencil', category: 'Cosmetics', qty: 1 }]), created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    
    // James Harris - high spender fashion
    { id: 'o10', customer_id: 'c9', amount: 450.00, status: 'completed', items: JSON.stringify([{ name: 'Premium Leather Jacket', category: 'Fashion', qty: 1 }]), created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
    
    // Emily Martin - coffee medium
    { id: 'o11', customer_id: 'c10', amount: 48.00, status: 'completed', items: JSON.stringify([{ name: 'Espresso Blend', category: 'Coffee', qty: 2 }]), created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() }
  ];

  for (const o of orders) {
    await query.run(
      'INSERT INTO orders (id, customer_id, amount, status, items, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [o.id, o.customer_id, o.amount, o.status, o.items, o.created_at]
    );
  }

  // Seed standard default segments
  const segments = [
    {
      id: 'seg1',
      name: 'High Spenders ($150+)',
      description: 'Customers whose individual orders are greater than or equal to $150.',
      rules: JSON.stringify({
        field: 'order_amount',
        operator: '>=',
        value: 150
      }),
      created_at: new Date().toISOString()
    },
    {
      id: 'seg2',
      name: 'Coffee Lovers',
      description: 'Customers who have purchased coffee items.',
      rules: JSON.stringify({
        field: 'item_category',
        operator: 'equals',
        value: 'Coffee'
      }),
      created_at: new Date().toISOString()
    },
    {
      id: 'seg3',
      name: 'Recent Shoppers (Last 14 days)',
      description: 'Shoppers who made purchases in the last two weeks.',
      rules: JSON.stringify({
        field: 'recency_days',
        operator: '<=',
        value: 14
      }),
      created_at: new Date().toISOString()
    }
  ];

  for (const s of segments) {
    await query.run(
      'INSERT INTO segments (id, name, description, rules, created_at) VALUES (?, ?, ?, ?, ?)',
      [s.id, s.name, s.description, s.rules, s.created_at]
    );
  }

  console.log('Seeding completed successfully!');
};

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
