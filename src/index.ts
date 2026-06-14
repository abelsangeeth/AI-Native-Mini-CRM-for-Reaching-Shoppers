import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './db/sqlite';
import {
  ingestCustomer,
  ingestOrder,
  getCustomers,
  getOrders,
  getSegments,
  createSegment,
  getSegmentCustomers,
  getCampaigns,
  getCampaignDetails,
  getCampaignLogs,
  createCampaign,
  handleReceiptCallback,
  handleAIChat,
  updateChurnScores,
  createCampaignAutopilot
} from './controllers/crm.controller';
import { sendNotification } from './controllers/channel.controller';

const CRM_PORT = Number(process.env.PORT) || 3000;
const CHANNEL_PORT = Number(process.env.CHANNEL_PORT) || 3001;

const startServices = async () => {
  // Initialize SQLite database
  await initDatabase();
  
  // Calculate and populate customer churn scores on startup
  await updateChurnScores();

  // ==========================================
  // 1. CRM Service Setup (Port 3000)
  // ==========================================
  const crmApp = express();
  crmApp.use(cors());
  crmApp.use(express.json());

  // Ingestion routes
  crmApp.post('/api/ingest/customer', ingestCustomer);
  crmApp.post('/api/ingest/order', ingestOrder);

  // Read routes
  crmApp.get('/api/customers', getCustomers);
  crmApp.get('/api/orders', getOrders);

  // Segment routes
  crmApp.get('/api/segments', getSegments);
  crmApp.post('/api/segments', createSegment);
  crmApp.get('/api/segments/:id/customers', getSegmentCustomers);

  // Campaign routes
  crmApp.get('/api/campaigns', getCampaigns);
  crmApp.post('/api/campaigns', createCampaign);
  crmApp.post('/api/campaigns/autopilot', createCampaignAutopilot);
  crmApp.get('/api/campaigns/:id', getCampaignDetails);
  crmApp.get('/api/campaigns/:id/logs', getCampaignLogs);

  // Webhook Callback route
  crmApp.post('/api/callbacks/receipt', handleReceiptCallback);

  // AI assistant chat route
  crmApp.post('/api/ai/chat', handleAIChat);

  // Serve Frontend UI static files
  crmApp.use(express.static(path.join(__dirname, '../public')));
  
  // Fallback to index.html for SPA router
  crmApp.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  crmApp.listen(CRM_PORT, () => {
    console.log(`🏛️ CRM Service running on port ${CRM_PORT}`);
  });

  // ==========================================
  // 2. Channel Service Setup (Port 3001)
  // ==========================================
  const channelApp = express();
  channelApp.use(cors());
  channelApp.use(express.json());

  // Webhook dispatch route
  channelApp.post('/api/channel/send', sendNotification);

  channelApp.listen(CHANNEL_PORT, () => {
    console.log(`✉️ Channel Service Simulator running on port ${CHANNEL_PORT}`);
  });
};

startServices().catch((err) => {
  console.error('Failed to start services:', err);
  process.exit(1);
});
