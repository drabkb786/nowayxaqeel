// ChatGPT Stripe UPI Pay Link — background service worker
// Updated for ChatGPT's current /backend-api/payments/checkout contract:
//   * request body now REQUIRES `entry_point`
//   * response may come back as `checkout_url`, `stripe_hosted_url`, or `url`
//   * when `checkout_ui_mode: "custom"`, only `checkout_session_id` is returned
//     and must be composed into https://chatgpt.com/checkout/openai_llc/{id}
//   * cancel_url should point at #pricing

const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const CHECKOUT_URL = 'https://chatgpt.com/backend-api/payments/checkout';

const DEFAULTS = {
  planName: 'chatgptplusplan',
  entryPoint: 'all_plans_pricing_modal',
  promoId: 'plus-1-month-free',
  promoCode: '',
  country: 'IN',
  currency: 'INR',
  cancelUrl: 'https://chatgpt.com/#pricing',
  uiMode: 'hosted',
};



chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CREATE_CHECKOUT') return false;
  createCheckout(message.options)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function createCheckout(options = {}) {
  const settings = normalizeOptions(options);

  // 1. Pull the access token from the signed-in ChatGPT session.
  const session = await requestJson(SESSION_URL, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!session?.accessToken) {
    throw new Error('No ChatGPT login session found. Please log in to chatgpt.com in this browser and try again.');
  }

  // 2. Build the checkout payload with the NEW contract.
  const isTeam = settings.planName.toLowerCase().includes('team');
  const checkoutBody = {
    entry_point: settings.entryPoint || (isTeam ? 'team_workspace_purchase_modal' : 'all_plans_pricing_modal'),
    plan_name: settings.planName,
    billing_details: {
      country: settings.country,
      currency: settings.currency,
    },
    checkout_ui_mode: settings.uiMode,
    cancel_url: settings.cancelUrl,
  };

  // promo_campaign (id-based) OR promo_code (coupon string) — pick whichever is set.
  if (settings.promoCode) {
    checkoutBody.promo_code = settings.promoCode;
  } else if (settings.promoId) {
    checkoutBody.promo_campaign = {
      promo_campaign_id: settings.promoId,
      is_coupon_from_query_param: false,
    };
  }

  if (isTeam) {
    checkoutBody.team_plan_data = {
      workspace_name: 'MyWorkspace',
      price_interval: 'month',
      seat_quantity: 2,
    };
  }

  // 3. POST to checkout endpoint.
  const checkout = await requestJson(CHECKOUT_URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(checkoutBody),
  });

  // 4. Resolve the final URL from any of the field names the API now uses.
  const hostedUrl =
    checkout?.checkout_url ||
    checkout?.stripe_hosted_url ||
    checkout?.url ||
    (checkout?.checkout_session_id
      ? `https://chatgpt.com/checkout/openai_llc/${checkout.checkout_session_id}`
      : null);

  if (!hostedUrl) {
    throw new Error('ChatGPT did not return a checkout URL. Response: ' + limitMessage(JSON.stringify(checkout)));
  }

  return {
    url: hostedUrl,
    sessionId: checkout?.checkout_session_id || null,
    amountDue: checkout?.amount_due ?? null,
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    const message = data?.error || data?.detail || data?.message || text || `HTTP ${response.status}`;
    throw new Error(limitMessage(message));
  }
  return data;
}

function normalizeOptions(options) {
  return {
    planName: clean(options.planName) || DEFAULTS.planName,
    entryPoint: clean(options.entryPoint) || DEFAULTS.entryPoint,
    promoId: clean(options.promoId),
    promoCode: clean(options.promoCode),
    country: (clean(options.country) || DEFAULTS.country).toUpperCase(),
    currency: (clean(options.currency) || DEFAULTS.currency).toUpperCase(),
    cancelUrl: clean(options.cancelUrl) || DEFAULTS.cancelUrl,
    uiMode: clean(options.uiMode) || DEFAULTS.uiMode,
  };
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseJson(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function limitMessage(message) {
  return String(message).replace(/\s+/g, ' ').slice(0, 400);
}
