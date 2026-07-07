// [country code, label, currency]
const COUNTRIES = [
  ['AF', 'Afghanistan', 'AFN'],
  ['AL', 'Albania', 'ALL'],
  ['DZ', 'Algeria', 'DZD'],
  ['AD', 'Andorra', 'EUR'],
  ['AO', 'Angola', 'AOA'],
  ['AG', 'Antigua and Barbuda', 'XCD'],
  ['AR', 'Argentina', 'ARS'],
  ['AM', 'Armenia', 'AMD'],
  ['AU', 'Australia', 'AUD'],
  ['AT', 'Austria', 'EUR'],
  ['AZ', 'Azerbaijan', 'AZN'],
  ['BS', 'Bahamas', 'BSD'],
  ['BH', 'Bahrain', 'BHD'],
  ['BD', 'Bangladesh', 'BDT'],
  ['BB', 'Barbados', 'BBD'],
  ['BY', 'Belarus', 'BYN'],
  ['BE', 'Belgium', 'EUR'],
  ['BZ', 'Belize', 'BZD'],
  ['BJ', 'Benin', 'XOF'],
  ['BT', 'Bhutan', 'BTN'],
  ['BO', 'Bolivia', 'BOB'],
  ['BA', 'Bosnia and Herzegovina', 'BAM'],
  ['BW', 'Botswana', 'BWP'],
  ['BR', 'Brazil', 'BRL'],
  ['BN', 'Brunei', 'BND'],
  ['BG', 'Bulgaria', 'BGN'],
  ['BF', 'Burkina Faso', 'XOF'],
  ['BI', 'Burundi', 'BIF'],
  ['KH', 'Cambodia', 'KHR'],
  ['CM', 'Cameroon', 'XAF'],
  ['CA', 'Canada', 'CAD'],
  ['CV', 'Cape Verde', 'CVE'],
  ['CF', 'Central African Republic', 'XAF'],
  ['TD', 'Chad', 'XAF'],
  ['CL', 'Chile', 'CLP'],
  ['CN', 'China', 'CNY'],
  ['CO', 'Colombia', 'COP'],
  ['KM', 'Comoros', 'KMF'],
  ['CG', 'Congo', 'XAF'],
  ['CD', 'Congo (DRC)', 'CDF'],
  ['CR', 'Costa Rica', 'CRC'],
  ['CI', "Côte d'Ivoire", 'XOF'],
  ['HR', 'Croatia', 'EUR'],
  ['CU', 'Cuba', 'CUP'],
  ['CY', 'Cyprus', 'EUR'],
  ['CZ', 'Czechia', 'CZK'],
  ['DK', 'Denmark', 'DKK'],
  ['DJ', 'Djibouti', 'DJF'],
  ['DM', 'Dominica', 'XCD'],
  ['DO', 'Dominican Republic', 'DOP'],
  ['EC', 'Ecuador', 'USD'],
  ['EG', 'Egypt', 'EGP'],
  ['SV', 'El Salvador', 'USD'],
  ['GQ', 'Equatorial Guinea', 'XAF'],
  ['ER', 'Eritrea', 'ERN'],
  ['EE', 'Estonia', 'EUR'],
  ['SZ', 'Eswatini', 'SZL'],
  ['ET', 'Ethiopia', 'ETB'],
  ['FJ', 'Fiji', 'FJD'],
  ['FI', 'Finland', 'EUR'],
  ['FR', 'France', 'EUR'],
  ['GA', 'Gabon', 'XAF'],
  ['GM', 'Gambia', 'GMD'],
  ['GE', 'Georgia', 'GEL'],
  ['DE', 'Germany', 'EUR'],
  ['GH', 'Ghana', 'GHS'],
  ['GR', 'Greece', 'EUR'],
  ['GD', 'Grenada', 'XCD'],
  ['GT', 'Guatemala', 'GTQ'],
  ['GN', 'Guinea', 'GNF'],
  ['GW', 'Guinea-Bissau', 'XOF'],
  ['GY', 'Guyana', 'GYD'],
  ['HT', 'Haiti', 'HTG'],
  ['HN', 'Honduras', 'HNL'],
  ['HK', 'Hong Kong', 'HKD'],
  ['HU', 'Hungary', 'HUF'],
  ['IS', 'Iceland', 'ISK'],
  ['IN', 'India', 'INR'],
  ['ID', 'Indonesia', 'IDR'],
  ['IR', 'Iran', 'IRR'],
  ['IQ', 'Iraq', 'IQD'],
  ['IE', 'Ireland', 'EUR'],
  ['IL', 'Israel', 'ILS'],
  ['IT', 'Italy', 'EUR'],
  ['JM', 'Jamaica', 'JMD'],
  ['JP', 'Japan', 'JPY'],
  ['JO', 'Jordan', 'JOD'],
  ['KZ', 'Kazakhstan', 'KZT'],
  ['KE', 'Kenya', 'KES'],
  ['KI', 'Kiribati', 'AUD'],
  ['KP', 'North Korea', 'KPW'],
  ['KR', 'South Korea', 'KRW'],
  ['XK', 'Kosovo', 'EUR'],
  ['KW', 'Kuwait', 'KWD'],
  ['KG', 'Kyrgyzstan', 'KGS'],
  ['LA', 'Laos', 'LAK'],
  ['LV', 'Latvia', 'EUR'],
  ['LB', 'Lebanon', 'LBP'],
  ['LS', 'Lesotho', 'LSL'],
  ['LR', 'Liberia', 'LRD'],
  ['LY', 'Libya', 'LYD'],
  ['LI', 'Liechtenstein', 'CHF'],
  ['LT', 'Lithuania', 'EUR'],
  ['LU', 'Luxembourg', 'EUR'],
  ['MG', 'Madagascar', 'MGA'],
  ['MW', 'Malawi', 'MWK'],
  ['MY', 'Malaysia', 'MYR'],
  ['MV', 'Maldives', 'MVR'],
  ['ML', 'Mali', 'XOF'],
  ['MT', 'Malta', 'EUR'],
  ['MH', 'Marshall Islands', 'USD'],
  ['MR', 'Mauritania', 'MRU'],
  ['MU', 'Mauritius', 'MUR'],
  ['MX', 'Mexico', 'MXN'],
  ['FM', 'Micronesia', 'USD'],
  ['MD', 'Moldova', 'MDL'],
  ['MC', 'Monaco', 'EUR'],
  ['MN', 'Mongolia', 'MNT'],
  ['ME', 'Montenegro', 'EUR'],
  ['MS', 'Montserrat', 'XCD'],
  ['MA', 'Morocco', 'MAD'],
  ['MZ', 'Mozambique', 'MZN'],
  ['MM', 'Myanmar', 'MMK'],
  ['NA', 'Namibia', 'NAD'],
  ['NR', 'Nauru', 'AUD'],
  ['NP', 'Nepal', 'NPR'],
  ['NL', 'Netherlands', 'EUR'],
  ['NZ', 'New Zealand', 'NZD'],
  ['NI', 'Nicaragua', 'NIO'],
  ['NE', 'Niger', 'XOF'],
  ['NG', 'Nigeria', 'NGN'],
  ['MK', 'North Macedonia', 'MKD'],
  ['NO', 'Norway', 'NOK'],
  ['OM', 'Oman', 'OMR'],
  ['PK', 'Pakistan', 'PKR'],
  ['PW', 'Palau', 'USD'],
  ['PS', 'Palestine', 'ILS'],
  ['PA', 'Panama', 'USD'],
  ['PG', 'Papua New Guinea', 'PGK'],
  ['PY', 'Paraguay', 'PYG'],
  ['PE', 'Peru', 'PEN'],
  ['PH', 'Philippines', 'PHP'],
  ['PL', 'Poland', 'PLN'],
  ['PT', 'Portugal', 'EUR'],
  ['PR', 'Puerto Rico', 'USD'],
  ['QA', 'Qatar', 'QAR'],
  ['RO', 'Romania', 'RON'],
  ['RU', 'Russia', 'RUB'],
  ['RW', 'Rwanda', 'RWF'],
  ['KN', 'Saint Kitts and Nevis', 'XCD'],
  ['LC', 'Saint Lucia', 'XCD'],
  ['VC', 'Saint Vincent and the Grenadines', 'XCD'],
  ['WS', 'Samoa', 'WST'],
  ['SM', 'San Marino', 'EUR'],
  ['ST', 'São Tomé and Príncipe', 'STN'],
  ['SA', 'Saudi Arabia', 'SAR'],
  ['SN', 'Senegal', 'XOF'],
  ['RS', 'Serbia', 'RSD'],
  ['SC', 'Seychelles', 'SCR'],
  ['SL', 'Sierra Leone', 'SLL'],
  ['SG', 'Singapore', 'SGD'],
  ['SK', 'Slovakia', 'EUR'],
  ['SI', 'Slovenia', 'EUR'],
  ['SB', 'Solomon Islands', 'SBD'],
  ['SO', 'Somalia', 'SOS'],
  ['ZA', 'South Africa', 'ZAR'],
  ['SS', 'South Sudan', 'SSP'],
  ['ES', 'Spain', 'EUR'],
  ['LK', 'Sri Lanka', 'LKR'],
  ['SD', 'Sudan', 'SDG'],
  ['SR', 'Suriname', 'SRD'],
  ['SE', 'Sweden', 'SEK'],
  ['CH', 'Switzerland', 'CHF'],
  ['SY', 'Syria', 'SYP'],
  ['TW', 'Taiwan', 'TWD'],
  ['TJ', 'Tajikistan', 'TJS'],
  ['TZ', 'Tanzania', 'TZS'],
  ['TH', 'Thailand', 'THB'],
  ['TL', 'Timor-Leste', 'USD'],
  ['TG', 'Togo', 'XOF'],
  ['TO', 'Tonga', 'TOP'],
  ['TT', 'Trinidad and Tobago', 'TTD'],
  ['TN', 'Tunisia', 'TND'],
  ['TR', 'Turkey', 'TRY'],
  ['TM', 'Turkmenistan', 'TMT'],
  ['TV', 'Tuvalu', 'AUD'],
  ['UG', 'Uganda', 'UGX'],
  ['UA', 'Ukraine', 'UAH'],
  ['AE', 'United Arab Emirates', 'AED'],
  ['GB', 'United Kingdom', 'GBP'],
  ['US', 'United States', 'USD'],
  ['UY', 'Uruguay', 'UYU'],
  ['UZ', 'Uzbekistan', 'UZS'],
  ['VU', 'Vanuatu', 'VUV'],
  ['VA', 'Vatican City', 'EUR'],
  ['VE', 'Venezuela', 'VES'],
  ['VN', 'Vietnam', 'VND'],
  ['YE', 'Yemen', 'YER'],
  ['ZM', 'Zambia', 'ZMW'],
  ['ZW', 'Zimbabwe', 'ZWL'],
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
