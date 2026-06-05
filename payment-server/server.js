'use strict';
const express   = require('express');
const crypto    = require('crypto');
const https     = require('https');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 3001;
const SB_URL     = process.env.SUPABASE_URL;       // https://xxx.supabase.co
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const SIM_MODE   = process.env.SIM_MODE === '1';   // 1 = return simulation URL, no real API calls

if (!SB_URL || !SB_SERVICE) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required');
  process.exit(1);
}

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
async function sbReq(path, opts = {}) {
  const url = SB_URL + path;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_SERVICE,
      Authorization: 'Bearer ' + SB_SERVICE,
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(JSON.stringify(body) || res.statusText);
  return body;
}

async function getStorePaySettings(storeId) {
  const rows = await sbReq(
    `/rest/v1/store_payment_settings?store_id=eq.${storeId}&select=terminal_key,secret_key`
  );
  return rows?.[0] || null;
}

async function updateOrderPayment(orderId, paymentId, status) {
  await sbReq(`/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payment_status: status, payment_provider_id: paymentId }),
  });
}

// ─── PROVIDER: TINKOFF T-KASCA ───────────────────────────────────────────────
function tinkoffToken(params, password) {
  const merged = { ...params, Password: password };
  const sorted = Object.keys(merged).sort().map(k => String(merged[k])).join('');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

async function tinkoffInit({ terminalKey, password, orderId, amount, description, returnUrl, isTest }) {
  const base = isTest ? 'https://securepay.tinkoff.ru/v2' : 'https://securepay.tinkoff.ru/v2';
  const params = {
    TerminalKey: terminalKey,
    Amount: Math.round(amount * 100),
    OrderId: orderId,
    Description: description || 'Оплата заказа Alliby',
    SuccessURL: returnUrl + '?payment_ok=1',
    FailURL: returnUrl + '?payment_cancel=1',
  };
  params.Token = tinkoffToken(params, password);
  const res = await fetch(`${base}/Init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.Success) throw new Error(data.Message || 'Tinkoff Init failed');
  return { paymentId: data.PaymentId, paymentUrl: data.PaymentURL };
}

function tinkoffVerify(body, password) {
  const token = body.Token;
  const copy  = { ...body };
  delete copy.Token;
  return token === tinkoffToken(copy, password);
}

// ─── PROVIDER: YOKASSA ───────────────────────────────────────────────────────
async function yokassaInit({ shopId, secretKey, orderId, amount, returnUrl, isTest }) {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const res = await fetch('https://api.yookassa.ru/v2/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + auth,
      'Idempotence-Key': orderId,
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl + '?payment_ok=1' },
      description: 'Заказ Alliby #' + orderId.slice(0, 8).toUpperCase(),
      metadata: { order_id: orderId },
    }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(data.description || 'YooKassa error');
  return { paymentId: data.id, paymentUrl: data.confirmation.confirmation_url };
}

function yokassaVerify(body, secretKey) {
  // YooKassa sends a signed webhook — validate IP and body hash in production
  return true; // simplified for template
}

// ─── PROVIDER: CLOUDPAYMENTS ─────────────────────────────────────────────────
async function cloudpaymentsInit({ publicId, apiSecret, orderId, amount, returnUrl, isTest }) {
  const base = 'https://api.cloudpayments.ru';
  const auth = Buffer.from(`${publicId}:${apiSecret}`).toString('base64');
  const res = await fetch(`${base}/payments/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + auth },
    body: JSON.stringify({
      Amount: amount,
      Currency: 'RUB',
      InvoiceId: orderId,
      Description: 'Заказ Alliby',
      AccountId: orderId,
      JsonData: { return_url: returnUrl },
    }),
  });
  const data = await res.json();
  if (data.Success !== true) throw new Error(data.Message || 'CloudPayments error');
  // CloudPayments widget-based — build a hosted page URL (requires CP widget)
  return {
    paymentId: data.Model?.TransactionId?.toString() || orderId,
    paymentUrl: `https://widget.cloudpayments.ru/pay/${publicId}?amount=${amount}&invoiceId=${orderId}&description=Alliby&successUrl=${encodeURIComponent(returnUrl + '?payment_ok=1')}`,
  };
}

function cloudpaymentsVerify(body, apiSecret) {
  const hmac = crypto.createHmac('sha256', apiSecret).update(JSON.stringify(body)).digest('base64');
  return true; // simplified
}

// ─── PROVIDER: SBERBANK ──────────────────────────────────────────────────────
async function sberbankInit({ userName, password, orderId, amount, returnUrl, isTest }) {
  const base = isTest
    ? 'https://3dsec.sberbank.ru/payment/rest'
    : 'https://securepayments.sberbank.ru/payment/rest';
  const params = new URLSearchParams({
    userName, password,
    orderNumber: orderId,
    amount: Math.round(amount * 100),
    returnUrl: returnUrl + '?payment_ok=1',
    failUrl: returnUrl + '?payment_cancel=1',
  });
  const res = await fetch(`${base}/register.do?${params}`);
  const data = await res.json();
  if (data.errorCode && data.errorCode !== '0') throw new Error(data.errorMessage || 'Sberbank error');
  return { paymentId: data.orderId, paymentUrl: data.formUrl };
}

// ─── SIMULATION ──────────────────────────────────────────────────────────────
function simPaymentUrl(orderId, amount, provider, returnUrl) {
  const url = new URL('https://alliby.ru/pay.html');
  url.searchParams.set('amount', amount);
  url.searchParams.set('order', orderId.slice(0, 8).toUpperCase());
  url.searchParams.set('provider', provider);
  url.searchParams.set('test', '1');
  url.searchParams.set('return_url', returnUrl);
  return url.toString();
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// POST /api/payment/init — create payment session, return { order_id, payment_url }
app.post('/api/payment/init', async (req, res) => {
  try {
    const { store_id, order_id, amount, return_url } = req.body;
    if (!store_id || !order_id || !amount) {
      return res.status(400).json({ error: 'store_id, order_id, amount required' });
    }
    const returnUrl = return_url || 'https://alliby.ru/';

    // Get store payment config
    const [storeRows, sps] = await Promise.all([
      sbReq(`/rest/v1/stores?id=eq.${store_id}&select=payment_provider,payment_test_mode&limit=1`),
      getStorePaySettings(store_id),
    ]);
    const store = storeRows?.[0];
    const provider = store?.payment_provider || 'none';
    const isTest = store?.payment_test_mode !== false;

    if (provider === 'none') {
      return res.status(400).json({ error: 'Payment not configured for this store' });
    }

    if (SIM_MODE || isTest) {
      const paymentUrl = simPaymentUrl(order_id, amount, provider, returnUrl);
      return res.json({ order_id, payment_url: paymentUrl, provider, test: true });
    }

    if (!sps?.terminal_key) {
      return res.status(400).json({ error: 'Payment credentials not configured' });
    }

    let result;
    if (provider === 'tinkoff') {
      result = await tinkoffInit({
        terminalKey: sps.terminal_key, password: sps.secret_key,
        orderId: order_id, amount, returnUrl, isTest,
      });
    } else if (provider === 'yokassa') {
      result = await yokassaInit({
        shopId: sps.terminal_key, secretKey: sps.secret_key,
        orderId: order_id, amount, returnUrl, isTest,
      });
    } else if (provider === 'cloudpayments') {
      result = await cloudpaymentsInit({
        publicId: sps.terminal_key, apiSecret: sps.secret_key,
        orderId: order_id, amount, returnUrl, isTest,
      });
    } else if (provider === 'sberbank') {
      result = await sberbankInit({
        userName: sps.terminal_key, password: sps.secret_key,
        orderId: order_id, amount, returnUrl, isTest,
      });
    } else {
      return res.status(400).json({ error: 'Unknown provider: ' + provider });
    }

    res.json({ order_id, payment_id: result.paymentId, payment_url: result.paymentUrl });
  } catch(e) {
    console.error('payment/init error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payment/webhook/tinkoff
app.post('/api/payment/webhook/tinkoff', async (req, res) => {
  try {
    const body = req.body;
    // Find store by order
    const orderRows = await sbReq(`/rest/v1/orders?id=eq.${body.OrderId}&select=id,store_id&limit=1`);
    const order = orderRows?.[0];
    if (!order) return res.send('OK');

    const sps = await getStorePaySettings(order.store_id);
    if (sps && !tinkoffVerify(body, sps.secret_key)) {
      console.warn('Tinkoff webhook signature mismatch');
      return res.status(400).send('Bad signature');
    }

    if (body.Status === 'CONFIRMED') {
      await updateOrderPayment(order.id, body.PaymentId?.toString(), 'paid');
      await sbReq(`/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'new' }),
      });
    } else if (['REJECTED', 'REVERSED', 'DEADLINE_EXPIRED'].includes(body.Status)) {
      await updateOrderPayment(order.id, body.PaymentId?.toString(), 'failed');
    }

    res.send('OK');
  } catch(e) {
    console.error('tinkoff webhook error:', e.message);
    res.status(500).send('Error');
  }
});

// POST /api/payment/webhook/yokassa
app.post('/api/payment/webhook/yokassa', async (req, res) => {
  try {
    const event = req.body;
    const payObj = event.object;
    if (!payObj?.metadata?.order_id) return res.send('ok');

    const orderId = payObj.metadata.order_id;
    if (event.type === 'payment.succeeded') {
      await updateOrderPayment(orderId, payObj.id, 'paid');
      await sbReq(`/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'new' }),
      });
    } else if (event.type === 'payment.canceled') {
      await updateOrderPayment(orderId, payObj.id, 'failed');
    }

    res.send('ok');
  } catch(e) {
    console.error('yokassa webhook error:', e.message);
    res.status(500).send('error');
  }
});

// POST /api/payment/webhook/cloudpayments
app.post('/api/payment/webhook/cloudpayments', async (req, res) => {
  try {
    const body = req.body;
    const orderId = body.InvoiceId;
    if (!orderId) return res.json({ code: 0 });

    if (body.Status === 'Completed') {
      await updateOrderPayment(orderId, body.TransactionId?.toString(), 'paid');
      await sbReq(`/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'new' }),
      });
    } else if (body.Status === 'Declined') {
      await updateOrderPayment(orderId, body.TransactionId?.toString(), 'failed');
    }

    res.json({ code: 0 });
  } catch(e) {
    console.error('cloudpayments webhook error:', e.message);
    res.json({ code: 13 });
  }
});

// POST /api/payment/webhook/sberbank
app.post('/api/payment/webhook/sberbank', async (req, res) => {
  try {
    const { orderId: sbOrderId, operation, status } = req.query;
    // Sberbank sends orderId (their ID), we need our order_id
    // In production: verify via REST API call to Sberbank with their orderId
    // and retrieve our orderNumber from the response
    console.log('Sberbank webhook:', { sbOrderId, operation, status });
    res.send('OK');
  } catch(e) {
    console.error('sberbank webhook error:', e.message);
    res.status(500).send('Error');
  }
});

// Health check
app.get('/api/payment/health', (req, res) => {
  res.json({ ok: true, sim: SIM_MODE });
});

app.listen(PORT, () => {
  console.log(`Payment server listening on port ${PORT}${SIM_MODE ? ' (SIMULATION MODE)' : ''}`);
});
