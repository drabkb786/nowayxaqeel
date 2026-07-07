
const FIRST_M = ["James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles","Daniel","Matthew","Andrew","Ryan","Kevin","Brian","Alex","Chris","Marcus","Ethan","Lucas","Oliver","Liam","Noah","Aiden","Ali","Ahmed","Hassan","Omar","Yusuf","Ibrahim","Raj","Amit","Wei","Chen","Hiroshi","Kenji","Min-jun","Ji-ho","Diego","Carlos","Luis","Juan","Pedro","Mateo","Santiago","Emil","Lars","Jan","Piotr","Ivan","Dmitri","Andrei"];
const FIRST_F = ["Mary","Jennifer","Linda","Patricia","Elizabeth","Susan","Jessica","Sarah","Karen","Nancy","Emma","Olivia","Sophia","Ava","Isabella","Mia","Amelia","Fatima","Aisha","Zara","Maryam","Layla","Priya","Anjali","Mei","Yui","Sakura","Ji-woo","So-yeon","Sofia","Camila","Valentina","Lucia","Elena","Anna","Julia","Katarzyna","Natalia","Ingrid","Astrid"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Wilson","Anderson","Taylor","Thomas","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Khan","Ali","Ahmed","Hussain","Malik","Sharma","Patel","Kumar","Singh","Wang","Zhang","Li","Liu","Chen","Yang","Kim","Park","Choi","Sato","Suzuki","Takahashi","Ivanov","Petrov","Kowalski","Nowak","Müller","Schmidt","Fischer","Rossi","Bianchi","Dubois","Bernard"];
const STREETS_GENERIC = ["Main Street","Park Avenue","Oak Road","Cedar Lane","Hill Road","Church Street","School Road","River Road","Sunset Boulevard","Lake View","Central Avenue","Market Street","Garden Road","Station Road","North Street","South Street","East Avenue","West Road","Green Street","Rose Lane"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function fillPostal(pattern) {
  if (!pattern) return "";
  return pattern.split("").map((c) => {
    if (c === "#") return String(randInt(0, 9));
    if (c === "A") return String.fromCharCode(65 + randInt(0, 25));
    return c;
  }).join("");
}

// Luhn checksum: given number without check digit, return check digit
function luhnCheck(numWithoutCheck) {
  let sum = 0;
  let alt = true;
  for (let i = numWithoutCheck.length - 1; i >= 0; i--) {
    let n = parseInt(numWithoutCheck[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return (10 - (sum % 10)) % 10;
}

function generateCard() {
  const brands = [
    { type: "Visa", prefix: "4", len: 16 },
    { type: "Mastercard", prefix: String(randInt(51, 55)), len: 16 },
    { type: "Amex", prefix: pick(["34", "37"]), len: 15 },
    { type: "Discover", prefix: "6011", len: 16 },
    { type: "JCB", prefix: "3528", len: 16 },
  ];
  const b = pick(brands);
  let body = b.prefix;
  while (body.length < b.len - 1) body += String(randInt(0, 9));
  const check = luhnCheck(body);
  const number = body + check;
  const formatted = b.type === "Amex"
    ? `${number.slice(0, 4)} ${number.slice(4, 10)} ${number.slice(10)}`
    : number.match(/.{1,4}/g).join(" ");
  const cvv = b.type === "Amex" ? String(randInt(1000, 9999)) : String(randInt(100, 999));
  const mm = String(randInt(1, 12)).padStart(2, "0");
  const yy = String(randInt(26, 32));
  return { number, formatted, type: b.type, cvv, expiry: `${mm}/${yy}` };
}

function generatePhone(country) {
  // Simple: dial code + 9-10 random digits, grouped
  const len = randInt(9, 10);
  let digits = "";
  for (let i = 0; i < len; i++) digits += String(randInt(i === 0 ? 3 : 0, 9));
  const grouped = digits.replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3");
  return `${country.dial} ${grouped}`;
}

function generateDOB() {
  const year = randInt(1960, 2005);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const age = new Date().getFullYear() - year;
  return { date: iso, age };
}

function slugName(first, last) {
  return (first + last).toLowerCase().replace(/[^a-z]/g, "");
}


function generateIdentity(countryCode) {
  const country = countryCode
    ? COUNTRIES.find((c) => c.code === countryCode) ?? pick(COUNTRIES)
    : pick(COUNTRIES);

  const gender = Math.random() < 0.5 ? "Male" : "Female";
  const firstName = pick(gender === "Male" ? FIRST_M : FIRST_F);
  const lastName = pick(LAST);
  const fullName = `${firstName} ${lastName}`;

  const { date: dob, age } = generateDOB();
  const slug = slugName(firstName, lastName);
  const emailDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me", "icloud.com"];
  const email = `${slug}${randInt(1, 999)}@${pick(emailDomains)}`;
  const username = `${slug}${randInt(10, 9999)}`;

  const streets = country.streets ?? STREETS_GENERIC;
  const streetAddress = `${randInt(1, 9999)} ${pick(streets)}`;

  return {
    country,
    fullName, firstName, lastName, gender,
    dob, age,
    email, username,
    phone: generatePhone(country),
    streetAddress,
    city: pick(country.cities),
    state: pick(country.states),
    postalCode: fillPostal(country.postal),
    countryName: country.name,
    card: generateCard(),
    currency: country.currency,
  };
}

window.generateIdentity = generateIdentity;
