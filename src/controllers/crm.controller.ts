import { Request, Response } from 'express';
import { query } from '../db/sqlite';
import http from 'http';

// Helper: Make async HTTP Post requests
const postJSON = (urlStr: string, body: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: true });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
};

// CRM Ingestion APIs
export const ingestCustomer = async (req: Request, res: Response) => {
  const { name, email, phone } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Missing name, email, or phone' });
  }

  try {
    const id = 'c_' + Math.random().toString(36).substring(2, 9);
    const createdAt = new Date().toISOString();
    await query.run(
      'INSERT INTO customers (id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, email, phone, createdAt]
    );
    await updateChurnScores();
    return res.status(201).json({ message: 'Customer ingested successfully', customer: { id, name, email, phone, created_at: createdAt } });
  } catch (error: any) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Customer with this email already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
};

export const ingestOrder = async (req: Request, res: Response) => {
  const { customerEmail, amount, status, items } = req.body;
  if (!customerEmail || amount === undefined || !status || !items) {
    return res.status(400).json({ error: 'Missing customerEmail, amount, status, or items' });
  }

  try {
    const customer = await query.get<{ id: string }>('SELECT id FROM customers WHERE email = ?', [customerEmail]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found. Ingest the customer first.' });
    }

    const id = 'o_' + Math.random().toString(36).substring(2, 9);
    const createdAt = new Date().toISOString();
    const itemsStr = typeof items === 'string' ? items : JSON.stringify(items);

    // 72-Hour Revenue Attribution Check
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const recentComm = await query.get<{ campaign_id: string }>(
      'SELECT campaign_id FROM communication_logs WHERE customer_id = ? AND status != ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1',
      [customer.id, 'failed', cutoffTime]
    );

    let attributedCampaignId: string | null = null;
    if (recentComm) {
      attributedCampaignId = recentComm.campaign_id;
    }

    await query.run(
      'INSERT INTO orders (id, customer_id, amount, status, items, created_at, campaign_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, customer.id, Number(amount), status, itemsStr, createdAt, attributedCampaignId]
    );
    await updateChurnScores();
    return res.status(201).json({ message: 'Order ingested successfully', order: { id, customerId: customer.id, amount, status, items: itemsStr, created_at: createdAt, campaign_id: attributedCampaignId } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Get Lists
export const getCustomers = async (_req: Request, res: Response) => {
  try {
    const rows = await query.all('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrders = async (_req: Request, res: Response) => {
  try {
    const rows = await query.all(`
      SELECT o.*, c.name as customer_name, c.email as customer_email 
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Segment logic
export const getSegments = async (_req: Request, res: Response) => {
  try {
    const rows = await query.all('SELECT * FROM segments ORDER BY created_at DESC');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createSegment = async (req: Request, res: Response) => {
  const { name, description, rules } = req.body;
  if (!name || !rules) {
    return res.status(400).json({ error: 'Missing name or rules' });
  }

  try {
    const id = 'seg_' + Math.random().toString(36).substring(2, 9);
    const rulesStr = typeof rules === 'string' ? rules : JSON.stringify(rules);
    const createdAt = new Date().toISOString();

    await query.run(
      'INSERT INTO segments (id, name, description, rules, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, description || '', rulesStr, createdAt]
    );

    return res.status(201).json({ id, name, description, rules: rulesStr, created_at: createdAt });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Evaluate rules in memory for customer matching
const evaluateSegmentCustomers = async (rules: any) => {
  const customers = await query.all<any>('SELECT * FROM customers');
  const orders = await query.all<any>('SELECT * FROM orders');

  return customers.filter(customer => {
    const customerOrders = orders.filter(o => o.customer_id === customer.id);

    if (rules.field === 'order_amount') {
      const amount = Number(rules.value);
      if (rules.operator === '>=') {
        return customerOrders.some(o => o.amount >= amount);
      } else if (rules.operator === '<=') {
        return customerOrders.some(o => o.amount <= amount);
      } else {
        return customerOrders.some(o => o.amount === amount);
      }
    }

    if (rules.field === 'item_category') {
      const category = String(rules.value).toLowerCase();
      return customerOrders.some(o => {
        try {
          const items = JSON.parse(o.items);
          return items.some((item: any) => String(item.category || item.name).toLowerCase().includes(category));
        } catch {
          return false;
        }
      });
    }

    if (rules.field === 'recency_days') {
      const days = Number(rules.value);
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
      return customerOrders.some(o => new Date(o.created_at).getTime() >= cutoffTime);
    }

    if (rules.field === 'churn_risk_score') {
      const score = Number(rules.value);
      if (rules.operator === '>=') {
        return customer.churn_risk_score >= score;
      } else if (rules.operator === '<=') {
        return customer.churn_risk_score <= score;
      } else {
        return customer.churn_risk_score === score;
      }
    }

    return true; // Default match all if rule field not recognized
  });
};

// Recalculates churn risk score for all customers based on RFM principles
export const updateChurnScores = async () => {
  try {
    const customers = await query.all<any>('SELECT * FROM customers');
    const orders = await query.all<any>('SELECT * FROM orders');

    for (const c of customers) {
      const customerOrders = orders.filter(o => o.customer_id === c.id);
      let score = 0;

      if (customerOrders.length === 0) {
        // No purchases - risk increases with registration time
        const daysSinceJoined = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000));
        score = Math.min(95, Math.max(30, daysSinceJoined * 2));
      } else {
        // Sort orders descending by date
        customerOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const lastOrderDate = new Date(customerOrders[0].created_at).getTime();
        const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate) / (24 * 60 * 60 * 1000));

        if (daysSinceLastOrder < 10) {
          score = 15;
        } else if (daysSinceLastOrder < 25) {
          score = 45;
        } else if (daysSinceLastOrder < 50) {
          score = 75;
        } else {
          score = 95;
        }

        // Reduce churn risk for loyal shoppers with multiple purchases
        if (customerOrders.length > 2) {
          score = Math.max(10, score - 20);
        }
      }

      await query.run('UPDATE customers SET churn_risk_score = ? WHERE id = ?', [score, c.id]);
    }
    
    // Auto-create High Churn Risk Segment if not present
    const existing = await query.get('SELECT * FROM segments WHERE id = ?', ['seg_churn']);
    if (!existing) {
      await query.run(
        'INSERT INTO segments (id, name, description, rules, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          'seg_churn',
          'High Churn Risk (Score >= 70)',
          'AI-predicted shoppers likely to drop off. Trigger proactive re-engagement campaigns.',
          JSON.stringify({ field: 'churn_risk_score', operator: '>=', value: 70 }),
          new Date().toISOString()
        ]
      );
    }
    
    console.log('🔄 Churn risk scores updated successfully.');
  } catch (error) {
    console.error('Error updating churn risk scores:', error);
  }
};

export const getSegmentCustomers = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const segment = await query.get<any>('SELECT * FROM segments WHERE id = ?', [id]);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    const rules = JSON.parse(segment.rules);
    const matchedCustomers = await evaluateSegmentCustomers(rules);
    return res.json(matchedCustomers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Campaign Logic
export const getCampaigns = async (_req: Request, res: Response) => {
  try {
    const rows = await query.all(`
      SELECT c.*, s.name as segment_name 
      FROM campaigns c
      JOIN segments s ON c.segment_id = s.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCampaignDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const campaign = await query.get<any>(`
      SELECT c.*, s.name as segment_name 
      FROM campaigns c
      JOIN segments s ON c.segment_id = s.id
      WHERE c.id = ?
    `, [id]);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // 1. Fetch attributed orders & calculate revenue
    const campaignOrders = await query.all<any>('SELECT amount, customer_id FROM orders WHERE campaign_id = ?', [id]);
    const attributedRevenue = campaignOrders.reduce((sum, o) => sum + o.amount, 0);

    // 2. Fetch campaign dispatch logs
    const logs = await query.all<any>('SELECT customer_id, status, conversion_amount, variant_id FROM communication_logs WHERE campaign_id = ?', [id]);
    
    // 3. Parse message variants and calculate metrics per variant
    let variants: string[] = [];
    try {
      if (campaign.message_variants) {
        variants = JSON.parse(campaign.message_variants);
      }
    } catch (e) {
      console.error('Error parsing variants:', e);
    }
    
    const variantList = variants.length > 0 ? variants : [campaign.message_template];
    const variantStats: any[] = [];

    variantList.forEach((vText, index) => {
      const vId = String.fromCharCode(65 + index); // 'A', 'B', 'C'
      const vLogs = logs.filter(l => l.variant_id === vId || (!l.variant_id && index === 0));
      const vCustomerIds = vLogs.map(l => l.customer_id);
      
      const vOrders = campaignOrders.filter(o => vCustomerIds.includes(o.customer_id));
      const vTotal = vLogs.length;
      const vDelivered = vLogs.filter(l => ['delivered', 'opened', 'read', 'clicked', 'converted'].includes(l.status)).length;
      const vClicked = vLogs.filter(l => ['clicked', 'converted'].includes(l.status)).length;
      const vConverted = vLogs.filter(l => l.status === 'converted').length;
      const vRevenue = vOrders.reduce((sum, o) => sum + o.amount, 0);

      variantStats.push({
        id: vId,
        template: vText,
        total: vTotal,
        delivered: vDelivered,
        clicked: vClicked,
        converted: vConverted,
        revenue: vRevenue,
        clickRate: vDelivered > 0 ? Math.round((vClicked / vDelivered) * 100) : 0,
        conversionRate: vClicked > 0 ? Math.round((vConverted / vClicked) * 100) : 0
      });
    });

    // 4. Determine A/B test winner
    let winnerId: string | null = null;
    if (variantStats.length > 1) {
      let maxRate = -1;
      variantStats.forEach(vs => {
        if (vs.conversionRate > maxRate) {
          maxRate = vs.conversionRate;
          winnerId = vs.id;
        }
      });
      // Fallback to click rate if conversion rates are both 0%
      if (maxRate === 0) {
        let maxClick = -1;
        variantStats.forEach(vs => {
          if (vs.clickRate > maxClick) {
            maxClick = vs.clickRate;
            winnerId = vs.id;
          }
        });
      }
    }

    const stats = {
      total: logs.length,
      sent: logs.filter(l => l.status !== 'pending').length,
      delivered: logs.filter(l => ['delivered', 'opened', 'read', 'clicked', 'converted'].includes(l.status)).length,
      failed: logs.filter(l => l.status === 'failed').length,
      opened: logs.filter(l => ['opened', 'read', 'clicked', 'converted'].includes(l.status)).length,
      read: logs.filter(l => ['read', 'clicked', 'converted'].includes(l.status)).length,
      clicked: logs.filter(l => ['clicked', 'converted'].includes(l.status)).length,
      converted: logs.filter(l => l.status === 'converted').length,
      revenue: attributedRevenue,
      variantStats,
      winnerId
    };

    return res.json({ campaign, stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getCampaignLogs = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await query.all(`
      SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM communication_logs l
      JOIN customers c ON l.customer_id = c.id
      WHERE l.campaign_id = ?
      ORDER BY l.updated_at DESC
    `, [id]);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  const { name, segmentId, channel, messageTemplate, messageVariants } = req.body;
  if (!name || !segmentId || !channel || !messageTemplate) {
    return res.status(400).json({ error: 'Missing name, segmentId, channel, or messageTemplate' });
  }

  try {
    const segment = await query.get<any>('SELECT * FROM segments WHERE id = ?', [segmentId]);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    const campaignId = 'camp_' + Math.random().toString(36).substring(2, 9);
    const createdAt = new Date().toISOString();
    
    // Parse variants if provided
    let variants: string[] = [messageTemplate];
    if (messageVariants) {
      variants = typeof messageVariants === 'string' ? JSON.parse(messageVariants) : messageVariants;
    }
    const variantsStr = JSON.stringify(variants);

    // Evaluate targeted customers
    const rules = JSON.parse(segment.rules);
    const targetedCustomers = await evaluateSegmentCustomers(rules);

    // 1. Fatigue Guard Filter (Limit to 2 communications in the last 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentSends = await query.all<any>(
      'SELECT customer_id FROM communication_logs WHERE status != ? AND updated_at >= ?',
      ['failed', oneWeekAgo]
    );
    const sendCountMap: any = {};
    recentSends.forEach(s => {
      sendCountMap[s.customer_id] = (sendCountMap[s.customer_id] || 0) + 1;
    });

    const activeCustomers = [];
    let excludedCount = 0;
    for (const customer of targetedCustomers) {
      const count = sendCountMap[customer.id] || 0;
      if (count >= 2) {
        excludedCount++;
      } else {
        activeCustomers.push(customer);
      }
    }

    // Create campaign record with message variants and fatigue exclusions
    await query.run(
      'INSERT INTO campaigns (id, name, segment_id, channel, message_template, status, created_at, message_variants, excluded_fatigue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [campaignId, name, segmentId, channel.toLowerCase(), messageTemplate, 'sending', createdAt, variantsStr, excludedCount]
    );

    // Get channel service URL (defaults to localhost:3001)
    const channelServiceUrl = process.env.CHANNEL_SERVICE_URL || 'http://localhost:3001/api/channel/send';

    // Dispatch messages asynchronously
    const dispatchPromises = activeCustomers.map(async (customer, index) => {
      const logId = 'log_' + Math.random().toString(36).substring(2, 12);
      
      // Determine variant (round-robin)
      const variantIndex = index % variants.length;
      const variantId = String.fromCharCode(65 + variantIndex); // 'A', 'B', 'C'
      const variantText = variants[variantIndex];
      const customizedMessage = variantText.replace(/{name}/g, customer.name);

      // Save initial communication log with variant details
      await query.run(
        'INSERT INTO communication_logs (id, campaign_id, customer_id, channel, message, status, updated_at, variant_id, variant_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [logId, campaignId, customer.id, channel.toLowerCase(), customizedMessage, 'pending', new Date().toISOString(), variantId, variantText]
      );

      // Call channel service (stubbed delivery API)
      try {
        await postJSON(channelServiceUrl, {
          logId,
          recipient: channel.toLowerCase() === 'email' ? customer.email : customer.phone,
          message: customizedMessage,
          channel: channel.toLowerCase()
        });
      } catch (err: any) {
        console.error(`Failed to dispatch message for log ${logId}:`, err.message);
        // Update to failed
        await query.run(
          'UPDATE communication_logs SET status = ?, updated_at = ? WHERE id = ?',
          ['failed', new Date().toISOString(), logId]
        );
      }
    });

    Promise.all(dispatchPromises).then(async () => {
      // Mark campaign as completed dispatch
      await query.run(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['completed', campaignId]
      );
    });

    return res.status(201).json({ 
      message: 'Campaign created and dispatch started', 
      campaignId, 
      targetedCount: targetedCustomers.length,
      sentCount: activeCustomers.length,
      excludedCount
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Webhook Callback Receipt
export const handleReceiptCallback = async (req: Request, res: Response) => {
  const { logId, status, conversionAmount } = req.body;
  if (!logId || !status) {
    return res.status(400).json({ error: 'Missing logId or status' });
  }

  try {
    const log = await query.get<any>('SELECT * FROM communication_logs WHERE id = ?', [logId]);
    if (!log) {
      return res.status(404).json({ error: 'Communication log not found' });
    }

    const updatedAt = new Date().toISOString();
    
    // Update status and conversion amount if status is converted
    if (status === 'converted' && conversionAmount) {
      await query.run(
        'UPDATE communication_logs SET status = ?, updated_at = ?, conversion_amount = ? WHERE id = ?',
        [status, updatedAt, Number(conversionAmount), logId]
      );

      // Write a simulated purchase order to show integration in CRM database!
      const orderId = 'o_conv_' + Math.random().toString(36).substring(2, 9);
      const items = JSON.stringify([{ name: 'Campaign Special Promotion Product', category: 'Campaign Conversion', qty: 1 }]);
      await query.run(
        'INSERT INTO orders (id, customer_id, amount, status, items, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, log.customer_id, Number(conversionAmount), 'completed', items, updatedAt]
      );
    } else {
      await query.run(
        'UPDATE communication_logs SET status = ?, updated_at = ? WHERE id = ?',
        [status, updatedAt, logId]
      );
    }

    return res.json({ success: true, message: `Status updated to ${status} for log ${logId}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// AI Agent Assistant Chat endpoint
export const handleAIChat = async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  const cleanMsg = message.toLowerCase();

  try {
    // 1. Conversational Analytics (Ask Your Data)
    if (cleanMsg.includes('revenue') || cleanMsg.includes('sales') || cleanMsg.includes('performance') || cleanMsg.includes('metrics') || cleanMsg.includes('roi') || cleanMsg.includes('conversion') || cleanMsg.includes('open rate') || cleanMsg.includes('click rate')) {
      const customersRes = await query.get<{ total: number }>('SELECT COUNT(*) AS total FROM customers');
      const ordersRes = await query.get<{ total: number }>('SELECT SUM(amount) AS total FROM orders');
      const campaignsRes = await query.get<{ total: number }>('SELECT COUNT(*) AS total FROM campaigns');
      const campaignRevRes = await query.get<{ total: number }>('SELECT SUM(amount) AS total FROM orders WHERE campaign_id IS NOT NULL');

      const logSentRes = await query.get<{ total: number }>("SELECT COUNT(*) AS total FROM communication_logs WHERE status != 'pending'");
      const logOpenedRes = await query.get<{ total: number }>("SELECT COUNT(*) AS total FROM communication_logs WHERE status IN ('opened', 'read', 'clicked', 'converted')");
      const logClickedRes = await query.get<{ total: number }>("SELECT COUNT(*) AS total FROM communication_logs WHERE status IN ('clicked', 'converted')");
      const logConvRes = await query.get<{ total: number }>("SELECT COUNT(*) AS total FROM communication_logs WHERE status = 'converted'");

      const totalCustomers = customersRes?.total || 0;
      const totalRevenue = ordersRes?.total || 0;
      const totalCampaigns = campaignsRes?.total || 0;
      const campaignRevenue = campaignRevRes?.total || 0;

      const sent = logSentRes?.total || 0;
      const opened = logOpenedRes?.total || 0;
      const clicked = logClickedRes?.total || 0;
      const converted = logConvRes?.total || 0;

      const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(0) : '0';
      const clickRate = opened > 0 ? ((clicked / opened) * 100).toFixed(0) : '0';
      const convRate = clicked > 0 ? ((converted / clicked) * 100).toFixed(0) : '0';

      return res.json({
        reply: `I have compiled a real-time **Conversational Analytics Report** directly from your active database:

📊 **CRM Business Summary:**
* **Total Shoppers:** **${totalCustomers}**
* **Total Store Sales:** **$${totalRevenue.toFixed(2)}**
* **Total Campaigns Launched:** **${totalCampaigns}**
* **Campaign Influenced Revenue:** **$${campaignRevenue.toFixed(2)}**

📈 **Simulated Messaging Funnel Rates:**
* **Total Dispatched:** **${sent}** messages
* **Average Open Rate:** **${openRate}%**
* **Average Click-Through Rate:** **${clickRate}%**
* **Average Purchase Conversion Rate:** **${convRate}%**`
      });
    }

    // 2. Shopper Persona Cards (AI-Generated on-the-fly)
    if (cleanMsg.includes('persona') || cleanMsg.includes('profile') || cleanMsg.includes('shopper') || cleanMsg.includes('customer') || cleanMsg.match(/c_\w+/) || cleanMsg.match(/c\d+/)) {
      const idMatch = message.match(/(c_\w+|c\d+)/i);
      const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
      
      let customer: any = null;
      if (idMatch) {
        customer = await query.get<any>('SELECT * FROM customers WHERE id = ? OR id = ?', [idMatch[0].toLowerCase(), idMatch[0]]);
      } else if (emailMatch) {
        customer = await query.get<any>('SELECT * FROM customers WHERE email = ?', [emailMatch[0]]);
      } else {
        const customers = await query.all<any>('SELECT * FROM customers');
        for (const c of customers) {
          if (cleanMsg.includes(c.name.toLowerCase())) {
            customer = c;
            break;
          }
        }
        if (!customer && customers.length > 0) {
          customer = customers[0];
        }
      }

      if (customer) {
        const orders = await query.all<any>('SELECT * FROM orders WHERE customer_id = ?', [customer.id]);
        const totalSpent = orders.reduce((sum, o) => sum + o.amount, 0);
        const orderCount = orders.length;
        const avgSpent = orderCount > 0 ? totalSpent / orderCount : 0;
        
        let categoriesList: string[] = [];
        orders.forEach(o => {
          try {
            const items = JSON.parse(o.items);
            items.forEach((it: any) => {
              if (it.category && !categoriesList.includes(it.category)) {
                categoriesList.push(it.category);
              }
            });
          } catch {}
        });
        const categories = categoriesList.length > 0 ? categoriesList.join(', ') : 'General Retail';
        
        let behavior = '';
        if (orderCount === 0) {
          behavior = `is a newly registered shopper who hasn't placed any orders yet. Churn risk is currently predicted at ${customer.churn_risk_score}%.`;
        } else if (orderCount >= 3) {
          behavior = `is an active, high-frequency loyal shopper who has placed ${orderCount} orders averaging $${avgSpent.toFixed(2)} per ticket. They purchase items in the **${categories}** categories.`;
        } else {
          behavior = `is an occasional buyer with ${orderCount} order(s) totaling $${totalSpent.toFixed(2)}. Their average purchase amount is $${avgSpent.toFixed(2)}.`;
        }
        
        const recencyMsg = customer.churn_risk_score >= 70 
          ? `We predict a **High Churn Risk (${customer.churn_risk_score}%)** due to prolonged purchase inactivity. We recommend a proactive winback coupon code MISSYOU.`
          : `They show low churn probability (predicted score of ${customer.churn_risk_score}%). Best engaged with upcoming VIP collections.`;

        return res.json({
          reply: `I have synthesized the **AI Shopper Persona Card** for **${customer.name}** (${customer.email}):

👤 **Shopper Profile:**
* **Customer ID:** \`${customer.id}\`
* **Contact Phone:** \`${customer.phone}\`
* **Engagement Segment:** **${customer.churn_risk_score >= 70 ? 'High Churn Risk' : 'Active VIP'}**

🏷️ **AI Behavioral Synthesis:**
${customer.name} ${behavior} ${recencyMsg}`
        });
      } else {
        return res.json({
          reply: "I couldn't find a specific shopper in the database matching that query. You can request a persona for any active shopper (e.g. *'show profile of Alex'* or *'what is c1's persona?'*)."
        });
      }
    }

    // 3. System FAQs Guides
    if (cleanMsg.includes('fatigue') || cleanMsg.includes('over-messaging')) {
      return res.json({
        reply: `🛡️ **XENO Fatigue Guard (Over-Messaging Protection):**
* **How it works:** Before any campaign dispatch, the system checks recipient logs over the last **7 days**.
* **Limit:** If a customer has received **2 or more messages** in this window, the system automatically filters them out of the campaign.
* **Result:** This safeguards your sender reputation, keeps delivery rates high, and prevents subscriber fatigue/churn.`
      });
    }

    if (cleanMsg.includes('attribution') || cleanMsg.includes('influenced') || cleanMsg.includes('connect')) {
      return res.json({
        reply: `💰 **XENO 72-Hour Revenue Attribution:**
* **How it works:** When a new purchase order is ingested, XENO checks if that customer received a campaign communication in the preceding **72 hours**.
* **Attribution:** If yes, the order is tagged with that campaign's ID.
* **Benefit:** Allows marketers to trace exactly how much actual store revenue was influenced by each WhatsApp, SMS, or RCS campaign instead of just looking at open rates.`
      });
    }

    if (cleanMsg.includes('ab test') || cleanMsg.includes('variants') || cleanMsg.includes('split')) {
      return res.json({
        reply: `🧪 **XENO A/B Testing & Copy Optimization:**
* **How it works:** You can specify multiple copy templates (Variant A, B, and C) when creating a campaign.
* **Split:** Dispatches are split round-robin among target segment shoppers.
* **Auto-Winner:** As webhook callbacks stream click and conversion events back to the CRM, XENO computes engagement ratios and highlights the winner with a trophy badge in the analysis modal.`
      });
    }

    // 4. AI Campaign Autopilot Intent Parser
    if (cleanMsg.includes('run') || cleanMsg.includes('send') || cleanMsg.includes('campaign') || cleanMsg.includes('autopilot') || cleanMsg.includes('engage')) {
      let goalName = 'Proactively re-engage high churn risk customers';
      let targetSegment = 'High Churn Risk (Score >= 70)';
      let mockGoalCode = 'churn';
      let channel = 'whatsapp';

      if (cleanMsg.includes('coffee')) {
        goalName = 'Promote fresh beans to Coffee Lovers segment';
        targetSegment = 'Coffee Lovers';
        mockGoalCode = 'coffee';
      } else if (cleanMsg.includes('vip') || cleanMsg.includes('spend') || cleanMsg.includes('150')) {
        goalName = 'Dispatch premium loyalty promotions to VIP high spenders';
        targetSegment = 'High Spenders ($150+)';
        mockGoalCode = 'vip';
      }

      if (cleanMsg.includes('sms')) channel = 'sms';
      else if (cleanMsg.includes('email')) channel = 'email';
      else if (cleanMsg.includes('rcs')) channel = 'rcs';

      return res.json({
        reply: `I have generated an **AI Autopilot Flow** targeting your objective:\n\n* **Campaign Goal**: "${goalName}"\n* **Audience Segment**: **${targetSegment}**\n* **Dispatch Channel**: **${channel.toUpperCase()}**\n\nI have drafted 2 message copy variants for A/B testing and enabled Fatigue Guard. Click below to approve and run.`,
        action: 'suggest_autopilot',
        data: {
          goal: mockGoalCode,
          channel: channel,
          goalName: goalName
        }
      });
    }

    // 5. AI Segment criteria generation parser
    if (cleanMsg.includes('spend') || cleanMsg.includes('spent') || cleanMsg.includes('buy') || cleanMsg.includes('bought') || cleanMsg.includes('coffee')) {
      let segmentName = 'AI Generated Segment';
      let rules: { field: string; operator: string; value: string | number } = { field: 'order_amount', operator: '>=', value: 100 };
      let reason = 'I have identified a segment based on customer purchase history.';

      if (cleanMsg.includes('coffee')) {
        segmentName = 'Coffee Shoppers';
        rules = { field: 'item_category', operator: 'equals', value: 'Coffee' };
        reason = 'I scanned purchase records and isolated shoppers who bought Coffee beans or mugs.';
      } else if (cleanMsg.includes('150') || cleanMsg.includes('150 dollars') || cleanMsg.includes('$150')) {
        segmentName = 'Vip Premium Shoppers';
        rules = { field: 'order_amount', operator: '>=', value: 150 };
        reason = 'This segment maps to elite spenders with orders exceeding $150.';
      } else if (cleanMsg.includes('100') || cleanMsg.includes('100 dollars') || cleanMsg.includes('$100')) {
        segmentName = 'Premium Spend Seg';
        rules = { field: 'order_amount', operator: '>=', value: 100 };
        reason = 'Identified shoppers with transactional order amounts of $100 or above.';
      } else if (cleanMsg.includes('recent') || cleanMsg.includes('days') || cleanMsg.includes('last')) {
        segmentName = 'Active Shoppers';
        rules = { field: 'recency_days', operator: '<=', value: 14 };
        reason = 'Isolated active shoppers who purchased products within the last 14 days.';
      }

      const matchingCount = (await evaluateSegmentCustomers(rules)).length;

      return res.json({
        reply: `Here is what I recommend:\n\n**Segment Name**: ${segmentName}\n**Criteria**: Orders matching rule \`${rules.field} ${rules.operator} ${rules.value}\`.\n**Matching Customers**: ${matchingCount} shoppers.\n\nI can also compose a WhatsApp template like: *"Hi {name}, thank you for your order! Use code OFF15 for 15% off your next purchase."*`,
        action: 'suggest_segment',
        data: {
          name: segmentName,
          description: `AI Drafted: ${reason}`,
          rules,
          matchingCount
        }
      });
    }

    // Default response
    return res.json({
      reply: "Hello! I am XENO's AI-Native Assistant. Try asking me:\n\n* **Ask Your Data:** *\"what is our revenue?\"* or *\"show campaign performance metrics\"*\n* **Customer Profile:** *\"generate persona for c1\"* or *\"show profile of Alex\"*\n* **Campaign Autopilot:** *\"run a SMS winback campaign\"*\n* **System FAQ:** *\"how does fatigue guard work?\"*"
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Campaign Autopilot dispatcher (programmatic setup)
export const createCampaignAutopilot = async (req: Request, res: Response) => {
  const { goal, channel } = req.body;
  if (!goal) {
    return res.status(400).json({ error: 'Missing goal in request body' });
  }

  const cleanGoal = goal.toLowerCase();
  const cChannel = channel || 'whatsapp';

  try {
    let segmentId = 'seg1'; // default VIP
    let campaignName = 'Autopilot Campaign';
    let messageTemplate = 'Hi {name}! Check out our new arrivals. Code: AP10';
    let messageVariants = [
      'Hi {name}! Check out our new arrivals. Code: AP10',
      'Hey {name}! We miss you. Get 10% off your next purchase using code AP10.'
    ];

    if (cleanGoal.includes('coffee')) {
      segmentId = 'seg2'; // Coffee lovers segment
      campaignName = 'Autopilot Coffee Lovers Campaign';
      messageTemplate = 'Hi {name}! Fresh roasted coffee beans are in stock. Use code COFFEE10.';
      messageVariants = [
        'Hi {name}! Fresh roasted coffee beans are in stock. Use code COFFEE10.',
        'Hey coffee enthusiast {name}! Get 10% off your favourite roast today with code COFFEE10.'
      ];
    } else if (cleanGoal.includes('churn') || cleanGoal.includes('inactive') || cleanGoal.includes('60 days') || cleanGoal.includes('risk')) {
      segmentId = 'seg_churn'; // Churn risk segment
      campaignName = 'Autopilot Winback Campaign';
      messageTemplate = 'Hi {name}, we noticed you haven\'t shopped in a while! Here is $15 off code MISSYOU.';
      messageVariants = [
        'Hi {name}, we noticed you haven\'t shopped in a while! Here is $15 off code MISSYOU.',
        'Dear {name}, we miss you! Here is a special 15% off voucher code MISSYOU15.'
      ];
    } else if (cleanGoal.includes('vip') || cleanGoal.includes('spend') || cleanGoal.includes('150')) {
      segmentId = 'seg1'; // High spenders
      campaignName = 'Autopilot VIP Spenders Special';
      messageTemplate = 'Hi {name}, as a valued VIP customer, here is exclusive early access to our new drop.';
      messageVariants = [
        'Hi {name}, as a valued VIP customer, here is exclusive early access to our new drop.',
        'Hey {name}, enjoy free shipping and VIP early access on our latest premium collections.'
      ];
    }

    // Reuse the createCampaign logic by mocking a request
    const mockReq = {
      body: {
        name: campaignName,
        segmentId,
        channel: cChannel,
        messageTemplate,
        messageVariants
      }
    } as any;

    return await createCampaign(mockReq, res);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
