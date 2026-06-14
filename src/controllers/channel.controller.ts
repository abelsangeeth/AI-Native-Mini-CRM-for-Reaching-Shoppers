import { Request, Response } from 'express';
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

// Simulated delivery outcomes async runner
const simulateLifecycle = async (logId: string, channel: string) => {
  const crmCallbackUrl = process.env.CRM_CALLBACK_URL || 'http://localhost:3000/api/callbacks/receipt';

  // Wait 1.5 seconds -> Deliver or Fail
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const isFailed = Math.random() < 0.08; // 8% failure rate
  if (isFailed) {
    try {
      await postJSON(crmCallbackUrl, { logId, status: 'failed' });
    } catch (err: any) {
      console.error('Callback fail failed:', err.message);
    }
    return;
  }

  // Mark as delivered
  try {
    await postJSON(crmCallbackUrl, { logId, status: 'delivered' });
  } catch (err: any) {
    console.error('Callback deliver failed:', err.message);
  }

  // Wait 2 seconds -> Open (90% for WhatsApp/SMS/RCS, 40% for Email)
  await new Promise(resolve => setTimeout(resolve, 2000));
  const openRate = ['whatsapp', 'sms', 'rcs'].includes(channel) ? 0.90 : 0.40;
  const isOpened = Math.random() < openRate;
  if (!isOpened) return;

  try {
    await postJSON(crmCallbackUrl, { logId, status: 'opened' });
  } catch (err: any) {
    console.error('Callback open failed:', err.message);
  }

  // Wait 1.5 seconds -> Read (85% for opened messages)
  await new Promise(resolve => setTimeout(resolve, 1500));
  const isRead = Math.random() < 0.85;
  if (!isRead) return;

  try {
    await postJSON(crmCallbackUrl, { logId, status: 'read' });
  } catch (err: any) {
    console.error('Callback read failed:', err.message);
  }

  // Wait 2.5 seconds -> Click Link (40% click rate for read messages)
  await new Promise(resolve => setTimeout(resolve, 2500));
  const isClicked = Math.random() < 0.40;
  if (!isClicked) return;

  try {
    await postJSON(crmCallbackUrl, { logId, status: 'clicked' });
  } catch (err: any) {
    console.error('Callback click failed:', err.message);
  }

  // Wait 2 seconds -> Purchase conversion (25% conversion rate for clicked links)
  await new Promise(resolve => setTimeout(resolve, 2000));
  const isConverted = Math.random() < 0.25;
  if (!isConverted) return;

  // Random purchase amount between $19.99 and $249.99
  const randomAmount = Number((19.99 + Math.random() * 230).toFixed(2));
  try {
    await postJSON(crmCallbackUrl, { 
      logId, 
      status: 'converted', 
      conversionAmount: randomAmount 
    });
  } catch (err: any) {
    console.error('Callback convert failed:', err.message);
  }
};

// Dispatch endpoint called by CRM
export const sendNotification = async (req: Request, res: Response) => {
  const { logId, recipient, message, channel } = req.body;
  if (!logId || !recipient || !message || !channel) {
    return res.status(400).json({ error: 'Missing logId, recipient, message, or channel' });
  }

  // Log dispatch request
  console.log(`[CHANNEL STUB] Dispatching message over ${channel.toUpperCase()} to ${recipient}`);

  // Fire-and-forget the simulation of delivery lifecycle asynchronously
  simulateLifecycle(logId, channel.toLowerCase());

  // Immediately respond to CRM that dispatch has started
  return res.json({ success: true, status: 'sent', logId });
};
