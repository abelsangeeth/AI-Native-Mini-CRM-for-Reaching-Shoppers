# Xeno Mini CRM — Out-of-the-Box Features to Add

> Hey Antigravity 👋 — here are the features we should be adding to the CRM. These aren't boring CRUD additions — each one is meant to make the product genuinely feel AI-native and impressive to the Xeno reviewers. Pick what fits best with what's already built.

---

## 1. Campaign Autopilot (AI Agent)

**What it is:** A one-line input where a marketer types a goal like _"re-engage customers who haven't bought in 60 days"_ and the AI agent handles everything — picks the segment, writes the message, selects the channel, and schedules the send.

**Why it's out-of-the-box:** Most CRMs make you click through 5 screens. This collapses it to a single intent → execution loop.

**How to build it:**
- Chat input on the campaign creation screen
- Claude (via API) interprets the intent and calls internal functions: `createSegment()`, `draftMessage()`, `scheduleCampaign()`
- Show the agent's "thinking" steps in the UI so the marketer can review before confirming
- One "Approve & Send" button at the end

---

## 2. Natural Language Segmentation

**What it is:** Replace or augment the segment builder with a plain-English query box. Marketer types: _"Women in Bangalore who spent over ₹3000 in the last 45 days but haven't bought this month"_ — and it resolves to a live filtered segment.

**Why it's out-of-the-box:** Segment builders with dropdowns are standard. NL segmentation is what makes this feel 2026, not 2016.

**How to build it:**
- Send the query + the data schema to Claude
- Claude returns a structured filter object (JSON)
- Run the filter against the customer/orders DB
- Display the matching count + a preview of shoppers
- Let the marketer tweak the NL query if they want to refine

---

## 3. Send-Time Intelligence (Per-User Optimal Timing)

**What it is:** Instead of sending a campaign blast at a fixed time, the system calculates each shopper's historically best engagement window (based on past open/click callbacks) and schedules their message individually.

**Why it's out-of-the-box:** Global "best send time" tools exist everywhere. Per-user scheduling based on your own callback data is genuinely differentiated.

**How to build it:**
- After a few campaigns have run, aggregate callback timestamps by user (when did they open/click)
- Derive a preferred hour-of-day per user
- When sending a campaign, stagger dispatch calls to the channel stub — each shopper's message goes out at their predicted optimal time
- Show "intelligent timing enabled" toggle on the campaign send screen

---

## 4. Revenue Attribution per Campaign

**What it is:** When a shopper makes a purchase within a configurable window (e.g. 72 hours) after receiving a campaign communication, that order is attributed to the campaign. The campaign analytics screen shows total influenced revenue, not just delivery stats.

**Why it's out-of-the-box:** Delivery/open rates are table stakes. Revenue attribution is what CMOs actually care about.

**How to build it:**
- On every new order ingested, check if the customer received a campaign message in the last N hours
- If yes, write an attribution record linking `order_id → campaign_id`
- Surface this as "influenced revenue: ₹X" on the campaign detail page
- Mention this explicitly in the walkthrough video — it shows product thinking

---

## 5. Message Variants + Auto A/B Testing

**What it is:** When creating a campaign message, an "AI variants" button generates 2–3 alternative copies with different tones (urgent, friendly, value-driven). The campaign splits traffic across variants. Callback engagement data (opens, clicks) declares the winner.

**Why it's out-of-the-box:** It closes the loop: AI writes → channel simulates → data picks the winner. That's the full cycle shown in one feature.

**How to build it:**
- Claude generates 2–3 message variants given the campaign goal
- Each shopper is randomly assigned a variant on send
- Callback data is tagged with `variant_id`
- Analytics screen shows per-variant open rate, click rate, revenue
- Auto-highlight the winning variant

---

## 6. Shopper Persona Cards (AI-Generated)

**What it is:** Each shopper profile page has a "persona" section where AI synthesises their purchase history into a 2–3 sentence plain English summary: _"Priya is a high-frequency weekend buyer. She gravitates toward sale items and typically goes cold after 40 days of inactivity. Best reached over WhatsApp on Saturday mornings."_

**Why it's out-of-the-box:** It turns raw data into something a non-technical marketer immediately understands and acts on.

**How to build it:**
- On demand (or pre-generated for top shoppers), send a shopper's order history to Claude
- Prompt: "You are a CRM analyst. Summarise this customer's behaviour in 2–3 sentences for a marketing team. Include buying patterns, frequency, and channel recommendation."
- Cache the response on the shopper record
- Display on the profile page with a "regenerate" option

---

## 7. Churn Prediction Score

**What it is:** A rolling score (0–100) per shopper based on recency, frequency, and average order value trend. Shoppers above a threshold score surface automatically in a "likely to churn" smart segment.

**Why it's out-of-the-box:** It's proactive intelligence, not reactive reporting. The CRM tells the marketer who to talk to before they have to ask.

**How to build it:**
- Simple RFM scoring: days since last order, order frequency, AOV trend
- Normalise to a 0–100 churn risk score
- Recompute on each new order event
- Auto-create a "High churn risk" segment that updates live
- Show the score on each shopper card with a colour indicator (green/amber/red)

---

## 8. Fatigue Guard (Over-Messaging Protection)

**What it is:** Before a campaign goes out, the system checks if any shoppers in the target segment have already received more than N communications in the last M days. It auto-excludes them and shows a warning: _"47 shoppers excluded — already reached 3x this week."_

**Why it's out-of-the-box:** It shows the product is protecting the brand's sender reputation and customer relationships — not just blasting.

**How to build it:**
- Add a `fatigue_check` step in the campaign send flow
- Query: for each recipient, count communications sent in the last N days
- Exclude those above the threshold
- Show the exclusion count prominently on the send confirmation screen
- Make the threshold configurable in settings

---

## 9. Behaviour-Triggered Journey Flows

**What it is:** Pre-built automated flows that fire based on shopper events: "send a winback message after 30 days of inactivity", "send a thank-you after a 3rd purchase", "upsell after high-value order". AI can suggest the message for each trigger node.

**Why it's out-of-the-box:** It moves the CRM from one-shot campaigns to always-on engagement — much closer to what Xeno actually does.

**How to build it:**
- A simple flow builder: trigger event → wait condition → send action
- Trigger events: `no_purchase_since`, `order_count_reached`, `order_value_above`
- A background worker evaluates all shoppers against active flows on a schedule
- When a shopper matches a trigger, fire the send API automatically
- AI fills in the message draft based on the trigger context

---

## 10. Conversational Analytics (Ask Your Data)

**What it is:** A chat interface on the analytics page where the marketer can ask questions like _"Which campaign drove the most revenue last month?"_ or _"What's the open rate for WhatsApp vs SMS?"_ — and Claude queries the data and answers in plain English with a mini chart.

**Why it's out-of-the-box:** Dashboards are static. Conversational analytics is dynamic and shows off AI-native thinking at the product level.

**How to build it:**
- Claude receives the question + a summary of available metrics/schema
- Returns either a direct answer or a structured query that the frontend runs
- Render the answer as a sentence + optional bar/line chart
- Keep the conversation history so follow-ups work ("what about the month before?")

---

## Priority Order (suggested)

If we're short on time, here's the order I'd prioritise these based on impact-to-effort ratio and how much they'll impress reviewers:

1. Natural Language Segmentation — highest wow factor, medium effort
2. Revenue Attribution — shows product maturity, low effort
3. Churn Prediction Score — smart segment = AI-native, low effort
4. Campaign Autopilot — big demo moment, higher effort
5. Message Variants A/B — closes the callback loop nicely
6. Fatigue Guard — easy to build, shows system thinking
7. Shopper Persona Cards — fun and visual
8. Send-Time Intelligence — cool but needs enough callback data
9. Behaviour-Triggered Flows — most complex, high value if we have time
10. Conversational Analytics — nice-to-have polish layer

---

> Submission deadline: **12 PM, June 15, 2026**. Let's ship what matters most first.
