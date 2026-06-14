// ==========================================================================
// XENO CLIENT-SIDE ENGINE (SPA Router, Live Poller, AI Chat & Analytics)
// ==========================================================================

// Application State
const state = {
  activeView: 'dashboard',
  customers: [],
  orders: [],
  segments: [],
  campaigns: [],
  consoleLogs: [],
  activeCampaignId: null, // For modal details
  processedLogStates: {} // Cache to track logId -> status transitions and avoid duplicates
};

// Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  customers: document.getElementById('view-customers'),
  segments: document.getElementById('view-segments'),
  campaigns: document.getElementById('view-campaigns')
};

const navItems = {
  dashboard: document.getElementById('nav-dashboard'),
  customers: document.getElementById('nav-customers'),
  segments: document.getElementById('nav-segments'),
  campaigns: document.getElementById('nav-campaigns')
};

// Init Application
document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  initEventListeners();
  loadData();
  
  // Start polling loop every 2 seconds for real-time console updates
  setInterval(pollStatusUpdates, 2000);
});

// 1. SPA Router
function initRouter() {
  const handleRoute = () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    if (views[hash]) {
      // Toggle views
      Object.keys(views).forEach(k => {
        if (k === hash) {
          views[k].classList.remove('hidden');
          navItems[k].classList.add('active');
        } else {
          views[k].classList.add('hidden');
          navItems[k].classList.remove('active');
        }
      });
      state.activeView = hash;
      document.getElementById('page-title').innerText = hash.charAt(0).toUpperCase() + hash.slice(1);
      
      // Load view specific data
      loadData();
    }
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // Run initial route
}

// 2. Data Loaders & API Integrations
async function loadData() {
  try {
    await Promise.all([
      fetchCustomers(),
      fetchOrders(),
      fetchSegments(),
      fetchCampaigns()
    ]);
    updateDashboardMetrics();
  } catch (error) {
    console.error('Error loading CRM data:', error);
  }
}

async function fetchCustomers() {
  const res = await fetch('/api/customers');
  state.customers = await res.json();
  renderCustomersTable();
}

async function fetchOrders() {
  const res = await fetch('/api/orders');
  state.orders = await res.json();
  renderOrdersTable();
}

async function fetchSegments() {
  const res = await fetch('/api/segments');
  state.segments = await res.json();
  renderSegmentsList();
  renderSegmentsSelects();
}

async function fetchCampaigns() {
  const res = await fetch('/api/campaigns');
  state.campaigns = await res.json();
  renderCampaignsList();
}

// 3. UI Renders
function renderCustomersTable() {
  const tbody = document.getElementById('table-customers-body');
  tbody.innerHTML = '';
  if (state.customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No customers ingested yet.</td></tr>`;
    return;
  }
  state.customers.forEach(c => {
    const row = document.createElement('tr');
    
    // Determine Churn Risk badge
    const score = c.churn_risk_score || 0;
    let badgeHtml = '';
    if (score < 40) {
      badgeHtml = `<span class="badge" style="background-color: var(--accent-green-soft); color: var(--accent-green); font-weight: 600;">Low (${score})</span>`;
    } else if (score < 70) {
      badgeHtml = `<span class="badge" style="background-color: var(--accent-orange-soft); color: var(--accent-orange); font-weight: 600;">Medium (${score})</span>`;
    } else {
      badgeHtml = `<span class="badge" style="background-color: #fee2e2; color: #ef4444; font-weight: 600;">High (${score})</span>`;
    }

    row.innerHTML = `
      <td><strong>${c.id}</strong></td>
      <td>${c.name}</td>
      <td>${c.email}</td>
      <td>${c.phone}</td>
      <td>${badgeHtml}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderOrdersTable() {
  const tbody = document.getElementById('table-orders-body');
  tbody.innerHTML = '';
  if (state.orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No orders ingested yet.</td></tr>`;
    return;
  }
  state.orders.forEach(o => {
    const row = document.createElement('tr');
    let itemsFormatted = '';
    try {
      const parsedItems = JSON.parse(o.items);
      itemsFormatted = parsedItems.map(item => `${item.name} (x${item.qty || 1})`).join(', ');
    } catch {
      itemsFormatted = o.items;
    }
    row.innerHTML = `
      <td><strong>${o.id}</strong></td>
      <td>${o.customer_name || 'N/A'}</td>
      <td>${o.customer_email || 'N/A'}</td>
      <td><strong>$${o.amount.toFixed(2)}</strong></td>
      <td><span class="badge badge-converted">${o.status}</span></td>
      <td>${itemsFormatted}</td>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderSegmentsList() {
  const container = document.getElementById('segments-container');
  container.innerHTML = '';
  if (state.segments.length === 0) {
    container.innerHTML = `<div class="empty-state">No shopper segments configured.</div>`;
    return;
  }

  state.segments.forEach(seg => {
    const card = document.createElement('div');
    card.className = 'segment-card';
    
    let ruleText = '';
    try {
      const rule = JSON.parse(seg.rules);
      ruleText = `${rule.field} ${rule.operator} ${rule.value}`;
    } catch {
      ruleText = seg.rules;
    }

    // Dynamic matched shopper lookup
    fetch(`/api/segments/${seg.id}/customers`)
      .then(res => res.json())
      .then(custs => {
        card.innerHTML = `
          <div>
            <h4>${seg.name}</h4>
            <p>${seg.description || 'No description provided.'}</p>
          </div>
          <span class="segment-badge">${ruleText}</span>
          <div class="segment-footer">
            <span>Targeting: <strong>${custs.length} shoppers</strong></span>
            <span>${new Date(seg.created_at).toLocaleDateString()}</span>
          </div>
        `;
      });
      
    container.appendChild(card);
  });
}

function renderSegmentsSelects() {
  const select = document.getElementById('camp-segment');
  select.innerHTML = '<option value="" disabled selected>Select an audience segment...</option>';
  state.segments.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.innerText = s.name;
    select.appendChild(opt);
  });
}

function renderCampaignsList() {
  // 1. Render Campaigns list in Campaign Manager View
  const listContainer = document.getElementById('campaigns-history-list');
  listContainer.innerHTML = '';
  
  // 2. Render active campaigns in Dashboard View
  const activeContainer = document.getElementById('active-campaigns-container');
  activeContainer.innerHTML = '';

  if (state.campaigns.length === 0) {
    const empty = `<div class="empty-state">No campaigns run yet.</div>`;
    listContainer.innerHTML = empty;
    activeContainer.innerHTML = empty;
    return;
  }

  state.campaigns.forEach(camp => {
    // Fetch stats for each campaign
    fetch(`/api/campaigns/${camp.id}`)
      .then(res => res.json())
      .then(({ stats }) => {
        // Manager card
        const card = document.createElement('div');
        card.className = 'campaign-card';
        card.onclick = () => openCampaignDetail(camp.id);
        card.innerHTML = `
          <div class="campaign-card-header">
            <h4>${camp.name}</h4>
            <span class="channel-tag tag-${camp.channel.toLowerCase()}">${camp.channel}</span>
          </div>
          <div class="campaign-card-body">
            "${camp.message_template}"
          </div>
          <div class="campaign-card-footer">
            <div class="stat-col">
              <span>${stats.total}</span>
              <span>Audience</span>
            </div>
            <div class="stat-col">
              <span>${stats.clicked}</span>
              <span>Clicks</span>
            </div>
            <div class="stat-col revenue-col">
              <span>$${stats.revenue.toFixed(2)}</span>
              <span>Revenue</span>
            </div>
          </div>
        `;
        listContainer.appendChild(card);

        // Dashboard Row
        const row = document.createElement('div');
        row.className = 'campaign-row';
        row.innerHTML = `
          <div class="campaign-meta">
            <h4>${camp.name}</h4>
            <span>Channel: <strong>${camp.channel}</strong></span>
            <span>Target: <strong>${stats.total}</strong></span>
          </div>
          <div class="campaign-metrics">
            <div class="c-metric">
              <span class="num">${stats.delivered}</span>
              <span class="lbl">Delivered</span>
            </div>
            <div class="c-metric">
              <span class="num">${stats.opened}</span>
              <span class="lbl">Opened</span>
            </div>
            <div class="c-metric">
              <span class="num">${stats.clicked}</span>
              <span class="lbl">Clicked</span>
            </div>
            <div class="c-metric">
              <span class="num" style="color: var(--accent-green);">$${stats.revenue.toFixed(2)}</span>
              <span class="lbl">Revenue</span>
            </div>
          </div>
          <button class="campaign-action-btn" onclick="event.stopPropagation(); window.openCampaignDetail('${camp.id}')">
            <i class="fa-solid fa-chart-column"></i>
          </button>
        `;
        activeContainer.appendChild(row);
      });
  });
}

// 4. Metrics & Funnel calculations
function updateDashboardMetrics() {
  const shopperCount = state.customers.length;
  document.getElementById('metric-shoppers').innerText = shopperCount;

  const totalRev = state.orders.reduce((sum, o) => sum + o.amount, 0);
  document.getElementById('metric-revenue').innerText = `$${totalRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById('metric-campaigns').innerText = state.campaigns.length;

  // Track aggregate stats across all campaigns for ROI and Engagement rates
  let totalDispatched = 0;
  let totalDelivered = 0;
  let totalOpened = 0;
  let totalClicked = 0;
  let totalConverted = 0;
  let totalCampaignRevenue = 0;

  const statsPromises = state.campaigns.map(camp => 
    fetch(`/api/campaigns/${camp.id}`)
      .then(res => res.json())
      .then(({ stats }) => {
        totalDispatched += stats.total;
        totalDelivered += stats.delivered;
        totalOpened += stats.opened;
        totalClicked += stats.clicked;
        totalConverted += stats.converted;
        totalCampaignRevenue += stats.revenue;
      })
  );

  Promise.all(statsPromises).then(() => {
    document.getElementById('metric-roi').innerText = `$${totalCampaignRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Funnel rates
    const deliveryRate = totalDispatched > 0 ? (totalDelivered / totalDispatched) * 100 : 0;
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
    const conversionRate = totalClicked > 0 ? (totalConverted / totalClicked) * 100 : 0;

    // Animate bars
    document.getElementById('funnel-delivery').style.width = `${deliveryRate}%`;
    document.getElementById('funnel-delivery-val').innerText = `${deliveryRate.toFixed(0)}%`;

    document.getElementById('funnel-open').style.width = `${openRate}%`;
    document.getElementById('funnel-open-val').innerText = `${openRate.toFixed(0)}%`;

    document.getElementById('funnel-click').style.width = `${clickRate}%`;
    document.getElementById('funnel-click-val').innerText = `${clickRate.toFixed(0)}%`;

    document.getElementById('funnel-conversion').style.width = `${conversionRate}%`;
    document.getElementById('funnel-conversion-val').innerText = `${conversionRate.toFixed(0)}%`;
  });
}

// 5. Ingestion and Forms submission handlers
function initEventListeners() {
  // Re-seed DB Button
  document.getElementById('btn-reseed').addEventListener('click', async () => {
    logToConsole('system', 'Re-seeding database with mock data...');
    try {
      const res = await fetch('/api/ingest/customer', { method: 'GET' }); // Trigger re-seed script
      // Re-seed by hitting seed route
      const reseedRes = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'reseed_db' })
      });
      // We also ran seed command. Let's do a hard fetch or trigger reseed.
      // Actually we will trigger a hard reload of data
      location.reload();
    } catch {
      // In case route not matched, run standard seed refresh
      logToConsole('system', 'Reloading client portal assets.');
      location.reload();
    }
  });

  // Customer Ingestion
  document.getElementById('form-ingest-customer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cust-name').value;
    const email = document.getElementById('cust-email').value;
    const phone = document.getElementById('cust-phone').value;

    try {
      const res = await fetch('/api/ingest/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone })
      });
      const data = await res.json();
      if (res.ok) {
        logToConsole('system', `Successfully ingested Customer: ${name} (${email})`);
        document.getElementById('form-ingest-customer').reset();
        loadData();
      } else {
        alert(data.error || 'Ingest failed');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Order Ingestion
  document.getElementById('form-ingest-order').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customerEmail = document.getElementById('order-email').value;
    const amount = document.getElementById('order-amount').value;
    const status = document.getElementById('order-status').value;
    const itemName = document.getElementById('order-item-name').value;
    const category = document.getElementById('order-item-category').value;

    try {
      const res = await fetch('/api/ingest/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          amount,
          status,
          items: [{ name: itemName, category, qty: 1 }]
        })
      });
      const data = await res.json();
      if (res.ok) {
        logToConsole('system', `Successfully ingested Order: $${amount} for ${customerEmail}`);
        document.getElementById('form-ingest-order').reset();
        loadData();
      } else {
        alert(data.error || 'Order ingest failed');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Segment Creation
  document.getElementById('form-create-segment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('seg-name').value;
    const description = document.getElementById('seg-desc').value;
    const field = document.getElementById('seg-rule-field').value;
    const operator = document.getElementById('seg-rule-op').value;
    const value = document.getElementById('seg-rule-val').value;

    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          rules: { field, operator, value }
        })
      });
      if (res.ok) {
        logToConsole('system', `Segment created: ${name}`);
        document.getElementById('form-create-segment').reset();
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Campaign dispatch
  document.getElementById('form-create-campaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('camp-name').value;
    const segmentId = document.getElementById('camp-segment').value;
    const channel = document.getElementById('camp-channel').value;
    const messageTemplate = document.getElementById('camp-template').value;
    
    // Message copy variants
    const variant1 = document.getElementById('camp-variant-1').value.trim();
    const variant2 = document.getElementById('camp-variant-2').value.trim();
    const messageVariants = [messageTemplate];
    if (variant1) messageVariants.push(variant1);
    if (variant2) messageVariants.push(variant2);

    logToConsole('system', `Preparing to compile and dispatch Campaign: "${name}" over ${channel}...`);
    if (messageVariants.length > 1) {
      logToConsole('system', `A/B testing enabled with ${messageVariants.length} copy variants.`);
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, segmentId, channel, messageTemplate, messageVariants })
      });
      const data = await res.json();
      if (res.ok) {
        logToConsole('system', `Campaign launched. Targeted audience size: ${data.targetedCount}. Active recipients: ${data.sentCount} (${data.excludedCount} filtered by Fatigue Guard).`);
        document.getElementById('form-create-campaign').reset();
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Tab switching
  document.getElementById('tab-btn-customers').onclick = () => {
    document.getElementById('tab-btn-customers').classList.add('active');
    document.getElementById('tab-btn-orders').classList.remove('active');
    document.getElementById('container-shoppers-table').classList.remove('hidden');
    document.getElementById('container-orders-table').classList.add('hidden');
  };

  document.getElementById('tab-btn-orders').onclick = () => {
    document.getElementById('tab-btn-customers').classList.remove('active');
    document.getElementById('tab-btn-orders').classList.add('active');
    document.getElementById('container-shoppers-table').classList.add('hidden');
    document.getElementById('container-orders-table').classList.remove('hidden');
  };

  // AI Chat Toggle and submit
  const aiDrawer = document.getElementById('ai-chat-drawer');
  document.getElementById('toggle-ai-chat').onclick = () => {
    aiDrawer.classList.toggle('collapsed');
  };
  document.getElementById('close-ai-chat').onclick = () => {
    aiDrawer.classList.add('collapsed');
  };

  document.getElementById('btn-send-chat').onclick = submitAIChat;
  document.getElementById('chat-input').onkeypress = (e) => {
    if (e.key === 'Enter') submitAIChat();
  };

  // Bind suggestion links
  document.querySelectorAll('.chat-prompt-link').forEach(link => {
    link.onclick = () => {
      document.getElementById('chat-input').value = link.innerText.replace(/"/g, '');
      submitAIChat();
    };
  });

  // Modal controls
  document.getElementById('close-modal').onclick = () => {
    document.getElementById('campaign-detail-modal').classList.add('hidden');
    state.activeCampaignId = null;
  };
  window.openCampaignDetail = openCampaignDetail; // make public

  // Clear console log panel
  document.getElementById('clear-console').onclick = () => {
    document.getElementById('console-logs-container').innerHTML = '';
  };
}

// 6. Campaign Details Modal Renderer
async function openCampaignDetail(campId) {
  state.activeCampaignId = campId;
  const modal = document.getElementById('campaign-detail-modal');
  modal.classList.remove('hidden');
  
  // Refresh modal details
  await refreshCampaignModal();
}

async function refreshCampaignModal() {
  if (!state.activeCampaignId) return;

  try {
    const resDetail = await fetch(`/api/campaigns/${state.activeCampaignId}`);
    const { campaign, stats } = await resDetail.json();

    document.getElementById('modal-camp-title').innerText = `Campaign Analysis: ${campaign.name}`;
    document.getElementById('modal-sent').innerText = stats.total;
    document.getElementById('modal-delivered').innerText = stats.delivered;
    document.getElementById('modal-opened').innerText = stats.opened;
    document.getElementById('modal-clicked').innerText = stats.clicked;
    document.getElementById('modal-converted').innerText = stats.converted;
    document.getElementById('modal-revenue').innerText = `$${stats.revenue.toFixed(2)}`;

    // 1. Fatigue Guard alert toggle
    const fatigueBanner = document.getElementById('modal-fatigue-banner');
    const fatigueCountEl = document.getElementById('modal-fatigue-count');
    const excludedCount = campaign.excluded_fatigue || 0;
    if (excludedCount > 0) {
      fatigueCountEl.innerText = excludedCount;
      fatigueBanner.classList.remove('hidden');
    } else {
      fatigueBanner.classList.add('hidden');
    }

    // 2. Render A/B variants if present
    const abContainer = document.getElementById('modal-ab-variants-container');
    const abBody = document.getElementById('modal-variants-ab-body');
    if (stats.variantStats && stats.variantStats.length > 1) {
      abContainer.classList.remove('hidden');
      abBody.innerHTML = '';
      stats.variantStats.forEach(vs => {
        const isWinner = vs.id === stats.winnerId;
        const card = document.createElement('div');
        card.className = `ab-card ${isWinner ? 'winner' : ''}`;
        card.innerHTML = `
          ${isWinner ? '<span class="winner-badge"><i class="fa-solid fa-trophy"></i> Winner</span>' : ''}
          <h4>Variant ${vs.id}</h4>
          <div class="ab-copy">"${vs.template}"</div>
          <div class="ab-metrics">
            <div class="ab-submetric">
              <span>${vs.total}</span>
              <span>Sends</span>
            </div>
            <div class="ab-submetric">
              <span>${vs.clickRate}%</span>
              <span>Click Rate</span>
            </div>
            <div class="ab-submetric">
              <span>$${vs.revenue.toFixed(2)}</span>
              <span>Revenue</span>
            </div>
          </div>
        `;
        abBody.appendChild(card);
      });
    } else {
      abContainer.classList.add('hidden');
    }

    const resLogs = await fetch(`/api/campaigns/${state.activeCampaignId}/logs`);
    const logs = await resLogs.json();

    const tbody = document.getElementById('modal-logs-table-body');
    tbody.innerHTML = '';
    
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No dispatches mapped.</td></tr>`;
      return;
    }

    logs.forEach(log => {
      const row = document.createElement('tr');
      const rev = log.conversion_amount ? `$${log.conversion_amount.toFixed(2)}` : '—';
      const variantBadge = log.variant_id ? ` <span class="badge badge-sent" style="font-size: 9px; padding: 1px 4px; border-radius: 3px;">Variant ${log.variant_id}</span>` : '';
      row.innerHTML = `
        <td><strong>${log.customer_name}</strong>${variantBadge}</td>
        <td>${log.recipient}</td>
        <td>"${log.message}"</td>
        <td><span class="badge badge-${log.status.toLowerCase()}">${log.status}</span></td>
        <td style="font-weight: 600; color: var(--accent-green);">${rev}</td>
        <td>${new Date(log.updated_at).toLocaleTimeString()}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('Failed refreshing campaign modal:', error);
  }
}

// 7. AI Chat Processor
async function submitAIChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  // Add User bubble
  appendChatBubble('user', msg);
  input.value = '';

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    
    // Add AI bubble
    appendChatBubble('ai', data.reply);

    // If recommendation card is suggested
    if (data.action === 'suggest_segment') {
      appendAICard(data.data);
    } else if (data.action === 'suggest_autopilot') {
      appendAutopilotCard(data.data);
    }
  } catch (error) {
    console.error(error);
  }
}

function appendChatBubble(sender, text) {
  const logsContainer = document.getElementById('chat-logs-container');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  
  if (sender === 'ai') {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Parse double-quoted prompts into clickable spans
    html = html.replace(/"(.*?)"/g, (match, p1) => {
      if (p1.length < 100 && !p1.includes('{') && !p1.includes('}')) {
        return `<span class="chat-prompt-link inline-prompt" style="font-size: inherit; font-weight: 500; text-decoration: underline; display: inline; cursor: pointer;" onclick="clickPrompt('${p1.replace(/'/g, "\\'")}')">"${p1}"</span>`;
      }
      return match;
    });
    // Replace newlines with breaks
    html = html.replace(/\n/g, '<br>');
    bubble.innerHTML = html;
  } else {
    bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }
  
  logsContainer.appendChild(bubble);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Global click helper for dynamic inline prompts
window.clickPrompt = (promptText) => {
  document.getElementById('chat-input').value = promptText;
  submitAIChat();
};

function appendAICard(segData) {
  const logsContainer = document.getElementById('chat-logs-container');
  const card = document.createElement('div');
  card.className = 'ai-recommendation-card';
  card.innerHTML = `
    <h5><i class="fa-solid fa-magic"></i> Segment Suggestion</h5>
    <p><strong>Name</strong>: ${segData.name}</p>
    <p>${segData.description}</p>
    <pre>${JSON.stringify(segData.rules, null, 2)}</pre>
    <button class="btn btn-primary btn-block btn-sm" id="btn-ai-apply-seg">Create Recommended Segment</button>
  `;
  logsContainer.appendChild(card);
  logsContainer.scrollTop = logsContainer.scrollHeight;

  // Bind action button
  document.getElementById('btn-ai-apply-seg').onclick = async () => {
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segData.name,
          description: segData.description,
          rules: segData.rules
        })
      });
      if (res.ok) {
        logToConsole('system', `AI Suggested Segment successfully added to database.`);
        appendChatBubble('ai', `Awesome! I have created the segment **${segData.name}** for you. It's now visible under Shopper Segments.`);
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };
}

function appendAutopilotCard(apData) {
  const logsContainer = document.getElementById('chat-logs-container');
  const card = document.createElement('div');
  card.className = 'ai-recommendation-card';
  const btnId = `btn-ai-run-autopilot-${Math.random().toString(36).substring(2, 9)}`;
  
  card.innerHTML = `
    <h5><i class="fa-solid fa-robot"></i> Campaign Autopilot</h5>
    <p><strong>Goal</strong>: ${apData.goalName}</p>
    <p><strong>Channel</strong>: ${apData.channel.toUpperCase()}</p>
    <button class="btn btn-success btn-block btn-sm" id="${btnId}">Approve & Launch Campaign</button>
  `;
  logsContainer.appendChild(card);
  logsContainer.scrollTop = logsContainer.scrollHeight;

  document.getElementById(btnId).onclick = async () => {
    logToConsole('system', `AI Autopilot approved. Launching campaign for goal: "${apData.goalName}"...`);
    try {
      const res = await fetch('/api/campaigns/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: apData.goal,
          channel: apData.channel
        })
      });
      const data = await res.json();
      if (res.ok) {
        logToConsole('system', `AI Autopilot Campaign launched! Targeted: ${data.targetedCount}, Sent: ${data.sentCount}, Excluded: ${data.excludedCount}.`);
        appendChatBubble('ai', `Success! I have launched the autopilot campaign **${apData.goalName}**. Targeted **${data.sentCount}** shoppers (excluded **${data.excludedCount}** due to Fatigue Guard).`);
        loadData();
      } else {
        alert(data.error || 'Failed to trigger autopilot');
      }
    } catch (err) {
      console.error(err);
    }
  };
}

// 8. Console Log Handler & Async Loop Poller
function logToConsole(type, message) {
  const container = document.getElementById('console-logs-container');
  const row = document.createElement('div');
  row.className = `console-log-row ${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  row.innerHTML = `
    <span class="log-timestamp">[${timestamp}]</span>
    <span class="log-text">${message}</span>
  `;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

// Polling loop that watches campaigns and pulls log events
async function pollStatusUpdates() {
  if (state.campaigns.length === 0) return;

  try {
    // We scan recent logs across all campaigns to find changes
    const logPromises = state.campaigns.map(async (camp) => {
      const res = await fetch(`/api/campaigns/${camp.id}/logs`);
      const logs = await res.json();

      logs.forEach(log => {
        const cacheKey = `${log.id}_${log.status}`;
        // If we haven't logged this state transition yet, write to Console!
        if (!state.processedLogStates[cacheKey]) {
          state.processedLogStates[cacheKey] = true;

          // Format log message
          let logMsg = '';
          const statusClass = log.status.toLowerCase();

          if (log.status === 'pending') {
            logMsg = `📤 DISPATCH: Sending message to ${log.customer_name} via ${log.channel.toUpperCase()}`;
            logToConsole('dispatch', logMsg);
          } else if (log.status === 'converted') {
            logMsg = `💰 CONVERSION: Shopper ${log.customer_name} made a purchase of $${log.conversion_amount.toFixed(2)} from ${log.channel.toUpperCase()} campaign! CRM order created.`;
            logToConsole('converted', logMsg);
            // Refresh main metrics if we got a conversion
            loadData();
          } else {
            logMsg = `📥 CALLBACK: Delivery update for ${log.customer_name} (${log.channel.toUpperCase()}) -> status: ${log.status.toUpperCase()}`;
            logToConsole(statusClass, logMsg);
          }

          // If detail modal is open for this campaign, refresh it!
          if (state.activeCampaignId === camp.id) {
            refreshCampaignModal();
          }
          
          // Also update dashboard metrics on any callback updates
          updateDashboardMetrics();
        }
      });
    });

    await Promise.all(logPromises);
  } catch (error) {
    console.error('Polling error:', error);
  }
}
