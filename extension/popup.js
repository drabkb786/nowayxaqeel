// [country code, label, currency]
const COUNTRIES = [
  ['IN', 'India', 'INR'],
  ['PK', 'Pakistan', 'PKR'],
  ['BD', 'Bangladesh', 'BDT'],
  ['LK', 'Sri Lanka', 'LKR'],
  ['NP', 'Nepal', 'NPR'],
  ['JP', 'Japan', 'JPY'],
  ['CN', 'China', 'CNY'],
  ['KR', 'South Korea', 'KRW'],
  ['TH', 'Thailand', 'THB'],
  ['VN', 'Vietnam', 'VND'],
  ['ID', 'Indonesia', 'IDR'],
  ['PH', 'Philippines', 'PHP'],
  ['MY', 'Malaysia', 'MYR'],
  ['SG', 'Singapore', 'SGD'],
  ['HK', 'Hong Kong', 'HKD'],
  ['TW', 'Taiwan', 'TWD'],
  ['MX', 'Mexico', 'MXN'],
  ['BR', 'Brazil', 'BRL'],
  ['AR', 'Argentina', 'ARS'],
  ['CL', 'Chile', 'CLP'],
  ['CO', 'Colombia', 'COP'],
  ['PE', 'Peru', 'PEN'],
  ['TR', 'Turkey', 'TRY'],
  ['EG', 'Egypt', 'EGP'],
  ['NG', 'Nigeria', 'NGN'],
  ['ZA', 'South Africa', 'ZAR'],
  ['KE', 'Kenya', 'KES'],
  ['AE', 'United Arab Emirates', 'AED'],
  ['SA', 'Saudi Arabia', 'SAR'],
  ['QA', 'Qatar', 'QAR'],
  ['IL', 'Israel', 'ILS'],
  ['RU', 'Russia', 'RUB'],
  ['UA', 'Ukraine', 'UAH'],
  ['PL', 'Poland', 'PLN'],
  ['CZ', 'Czechia', 'CZK'],
  ['HU', 'Hungary', 'HUF'],
  ['RO', 'Romania', 'RON'],
  ['SE', 'Sweden', 'SEK'],
  ['NO', 'Norway', 'NOK'],
  ['DK', 'Denmark', 'DKK'],
  ['CH', 'Switzerland', 'CHF'],
  ['DE', 'Germany', 'EUR'],
  ['FR', 'France', 'EUR'],
  ['ES', 'Spain', 'EUR'],
  ['IT', 'Italy', 'EUR'],
  ['NL', 'Netherlands', 'EUR'],
  ['IE', 'Ireland', 'EUR'],
  ['PT', 'Portugal', 'EUR'],
  ['GB', 'United Kingdom', 'GBP'],
  ['US', 'United States', 'USD'],
  ['CA', 'Canada', 'CAD'],
  ['AU', 'Australia', 'AUD'],
  ['NZ', 'New Zealand', 'NZD'],
];

const STORAGE_KEY = 'novaCountry';

const BASE_DEFAULTS = {
  planName: 'chatgptplusplan',
  entryPoint: 'all_plans_pricing_modal',
  promoId: 'plus-1-month-free',
  promoCode: '',
  cancelUrl: 'https://chatgpt.com/#pricing',
  uiMode: 'hosted',
};

const form = document.getElementById('checkoutForm');
const countrySelect = document.getElementById('countrySelect');
const generateButton = document.getElementById('generateButton');
const buttonText = document.getElementById('buttonText');
const spinner = document.getElementById('spinner');
const resultPanel = document.getElementById('resultPanel');
const checkoutUrl = document.getElementById('checkoutUrl');
const copyButton = document.getElementById('copyButton');
const openLink = document.getElementById('openLink');
const message = document.getElementById('message');
const statusDot = document.getElementById('statusDot');

// Populate country dropdown
for (const [code, label, currency] of COUNTRIES) {
  const opt = document.createElement('option');
  opt.value = code;
  opt.dataset.currency = currency;
  opt.textContent = `${label} (${currency})`;
  countrySelect.appendChild(opt);
}

// Restore previously selected country
chrome.storage?.local?.get?.([STORAGE_KEY], (data) => {
  const saved = data?.[STORAGE_KEY];
  countrySelect.value = saved && COUNTRIES.some((c) => c[0] === saved) ? saved : 'IN';
});

countrySelect.addEventListener('change', () => {
  chrome.storage?.local?.set?.({ [STORAGE_KEY]: countrySelect.value });
});

form.addEventListener('submit', handleSubmit);
copyButton.addEventListener('click', copyCheckoutUrl);

async function handleSubmit(event) {
  event.preventDefault();
  setLoading(true);
  setMessage('Generating checkout link...', 'warn');
  resultPanel.hidden = true;

  const country = countrySelect.value || 'IN';
  const selected = COUNTRIES.find((c) => c[0] === country);
  const currency = selected ? selected[2] : 'INR';

  try {
    const response = await sendMessage({
      type: 'CREATE_CHECKOUT',
      options: { ...BASE_DEFAULTS, country, currency },
    });
    if (!response?.ok) throw new Error(response?.error || 'Failed to create checkout link.');

    checkoutUrl.value = response.url;
    openLink.href = response.url;
    resultPanel.hidden = false;
    setMessage(`Link created for ${selected ? selected[1] : country}. Copy or open the payment link.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function copyCheckoutUrl() {
  const url = checkoutUrl.value.trim();
  if (!url) return;
  await navigator.clipboard.writeText(url);
  setMessage('Checkout URL copied to clipboard.', 'success');
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) { reject(new Error(runtimeError.message)); return; }
      resolve(response);
    });
  });
}

function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  spinner.hidden = !isLoading;
  buttonText.textContent = isLoading ? 'Generating...' : 'Generate Link';
}

function setMessage(text, kind) {
  message.textContent = text || '';
  message.classList.remove('error', 'success', 'warn');
  if (kind === 'error') { message.classList.add('error'); statusDot.className = 'status error'; }
  else if (kind === 'success') { message.classList.add('success'); statusDot.className = 'status'; }
  else if (kind === 'warn') { message.classList.add('warn'); statusDot.className = 'status warn'; }
  else { statusDot.className = 'status'; }
}
