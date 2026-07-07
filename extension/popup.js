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



const form = document.getElementById('checkoutForm');
const generateButton = document.getElementById('generateButton');
const buttonText = document.getElementById('buttonText');
const spinner = document.getElementById('spinner');
const resultPanel = document.getElementById('resultPanel');
const checkoutUrl = document.getElementById('checkoutUrl');
const copyButton = document.getElementById('copyButton');
const openLink = document.getElementById('openLink');
const message = document.getElementById('message');
const statusDot = document.getElementById('statusDot');

form.addEventListener('submit', handleSubmit);
copyButton.addEventListener('click', copyCheckoutUrl);

async function handleSubmit(event) {
  event.preventDefault();
  setLoading(true);
  setMessage('Generating checkout link...', 'warn');
  resultPanel.hidden = true;

  try {
    const response = await sendMessage({ type: 'CREATE_CHECKOUT', options: DEFAULTS });
    if (!response?.ok) throw new Error(response?.error || 'Failed to create checkout link.');

    checkoutUrl.value = response.url;
    openLink.href = response.url;
    resultPanel.hidden = false;
    setMessage('Link created successfully. You can copy or open the payment link.', 'success');
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
