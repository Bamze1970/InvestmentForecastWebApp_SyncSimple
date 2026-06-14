import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DATA = {"assets": [{"name": "Gold", "group": "Precious Metals", "quantityMode": "grams_input_toz_price", "quantityLabel": "грам", "priceLabel": "€/тр. унция", "quantity": 500.0, "currentValue": 67290.709, "low4yValue": 97786.858, "base4yValue": 139695.511, "high4yValue": 181604.165, "baseUnitPrice": 4185.9500124741}, {"name": "Silver", "group": "Precious Metals", "quantityMode": "grams_input_toz_price", "quantityLabel": "грам", "priceLabel": "€/тр. унция", "quantity": 4100.0, "currentValue": 7638.109, "low4yValue": 8618.842, "base4yValue": 13901.359, "high4yValue": 19183.875, "baseUnitPrice": 57.9443283116}, {"name": "onemarkets BlackRock Global Equity Dynamic Opportunities", "group": "Funds", "quantityMode": "direct_units", "quantityLabel": "дял", "priceLabel": "€/дял", "quantity": 12.975767769264312, "currentValue": 2083.0, "low4yValue": 26826.446, "base4yValue": 32405.121, "high4yValue": 36503.446, "baseUnitPrice": 160.53}, {"name": "onemarkets J.P. Morgan US Equities Fund", "group": "Funds", "quantityMode": "direct_units", "quantityLabel": "дял", "priceLabel": "€/дял", "quantity": 14.268702717848138, "currentValue": 2037.0, "low4yValue": 26777.962, "base4yValue": 32333.821, "high4yValue": 36409.33, "baseUnitPrice": 142.76}, {"name": "AMUNDI FUNDS ASIA EQUITY FOCUS - A EUR (C)", "group": "Funds", "quantityMode": "direct_units", "quantityLabel": "дял", "priceLabel": "€/дял", "quantity": 12.843520048055263, "currentValue": 3421.0, "low4yValue": 6293.699, "base4yValue": 8220.228, "high4yValue": 10027.746, "baseUnitPrice": 266.36}, {"name": "AMUNDI FUNDS CHINA EQUITY - A EUR (C)", "group": "Funds", "quantityMode": "direct_units", "quantityLabel": "дял", "priceLabel": "€/дял", "quantity": 170.6529713866471, "currentValue": 2326.0, "low4yValue": 4914.7, "base4yValue": 6522.947, "high4yValue": 7983.159, "baseUnitPrice": 13.63}, {"name": "AMUNDI FUNDS US PIONEER FUND - A EUR (C)", "group": "Funds", "quantityMode": "direct_units", "quantityLabel": "дял", "priceLabel": "€/дял", "quantity": 213.26566328316414, "currentValue": 6093.0, "low4yValue": 11345.838, "base4yValue": 15344.173, "high4yValue": 19134.55, "baseUnitPrice": 28.57}, {"name": "Solana", "group": "Crypto", "quantityMode": "direct_units", "quantityLabel": "SOL", "priceLabel": "€/SOL", "quantity": 155.0, "currentValue": 10447.0, "low4yValue": 25575.0, "base4yValue": 44175.0, "high4yValue": 80600.0, "special": "solana", "baseUnitPrice": 67.4}], "troyOunceGrams": 31.1034768, "note": "Gold/Silver: количество в грамове, цена в €/тр. унция. Синхронизация между устройства чрез Firebase Firestore.", "solanaInvestedCost": 14500.0};
const STORAGE_KEY = 'inv-sync-store-v2';
const SETTINGS_KEY = 'inv-sync-settings-v2';
let db = null;
let activePortfolioId = '';
let unsub = null;
let suppressRemoteWrite = false;

const dashboardView = document.getElementById('dashboardView');
const editorView = document.getElementById('editorView');
const statusBar = document.getElementById('statusBar');
const syncBtn = document.getElementById('syncBtn');
const resetBtn = document.getElementById('resetBtn');
const syncModal = document.getElementById('syncModal');
const portfolioIdInput = document.getElementById('portfolioIdInput');
const saveSyncBtn = document.getElementById('saveSyncBtn');
const closeSyncBtn = document.getElementById('closeSyncBtn');

const fmtEuro = (v) => new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
const fmtNum = (v) => new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(v);

function setStatus(text){ statusBar.textContent = text; }
function showModal(){ syncModal.classList.remove('hidden'); syncModal.style.display='flex'; syncModal.setAttribute('aria-hidden','false'); }
function hideModal(){ syncModal.classList.add('hidden'); syncModal.style.display='none'; syncModal.setAttribute('aria-hidden','true'); }

function defaultStore(){ return { qty:Object.fromEntries(DATA.assets.map(a=>[a.name,a.quantity])), unitPrice:Object.fromEntries(DATA.assets.map(a=>[a.name,a.baseUnitPrice])) }; }
function getStore(){ try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); return { ...defaultStore(), ...parsed, qty: { ...Object.fromEntries(DATA.assets.map(a=>[a.name,a.quantity])), ...(parsed.qty||{}) }, unitPrice: { ...Object.fromEntries(DATA.assets.map(a=>[a.name,a.baseUnitPrice])), ...(parsed.unitPrice||{}) } }; } catch { return defaultStore(); } }
function saveStore(store, writeRemote=true){ localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); if(writeRemote) syncToCloud(store); renderAll(); }
function getSettings(){ try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch { return {}; } }
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
function qtyInputOf(name){ return Number(getStore().qty[name]); }
function unitPriceOf(name){ return Number(getStore().unitPrice[name]); }
function qtyUnits(asset){ return asset.quantityMode==='grams_input_toz_price' ? qtyInputOf(asset.name)/DATA.troyOunceGrams : qtyInputOf(asset.name); }
function currentValue(asset){ return qtyUnits(asset) * unitPriceOf(asset.name); }
function factor(asset){ const baseQty = asset.quantityMode==='grams_input_toz_price' ? asset.quantity / DATA.troyOunceGrams : asset.quantity; const base = baseQty * asset.baseUnitPrice; return currentValue(asset) / (base || 1); }
function totalCurrent(){ return DATA.assets.reduce((a,x)=>a + currentValue(x), 0); }
function total4y(kind){ return DATA.assets.reduce((a,x)=>a + x[kind+'4yValue'] * factor(x), 0); }

function renderDashboard(){
  dashboardView.innerHTML = `<section class="card"><h2 class="section-title">Dashboard</h2><p class="note">${DATA.note}</p><div class="grid grid-4"><div class="metric"><span>Текущ портфейл</span><strong>${fmtEuro(totalCurrent())}</strong></div><div class="metric"><span>4Y Low</span><strong>${fmtEuro(total4y('low'))}</strong></div><div class="metric"><span>4Y Base</span><strong>${fmtEuro(total4y('base'))}</strong></div><div class="metric"><span>4Y High</span><strong>${fmtEuro(total4y('high'))}</strong></div></div></section>`;
}

function renderEditor(){
  editorView.innerHTML = `<section class="card"><h2 class="section-title">Количество и цена</h2><p class="note">Gold/Silver: количество в грамове, цена в €/тр. унция. 1 тройунция = ${fmtNum(DATA.troyOunceGrams)} г.</p><div class="table-wrap"><div class="unit-row head-row"><div>Инвестиция</div><div>Количество</div><div>Текущо в единици</div><div>Цена/ед.</div><div>Текуща стойност</div><div>4Y Base</div><div>Действие</div></div>${DATA.assets.map(a => `<div class="unit-row"><div><strong>${a.name}</strong><div class="group">${a.group} • количество: ${a.quantityLabel} • цена: ${a.priceLabel}</div></div><div><input type="number" min="0" step="0.000001" class="qty-input" data-name="${a.name}" value="${qtyInputOf(a.name)}"></div><div><strong>${fmtNum(qtyUnits(a))}</strong><div class="small">${a.quantityMode==='grams_input_toz_price' ? 'тр. унции' : a.quantityLabel}</div></div><div><input type="number" min="0" step="0.000001" class="price-input" data-name="${a.name}" value="${unitPriceOf(a.name)}"></div><div><strong>${fmtEuro(currentValue(a))}</strong></div><div><strong>${fmtEuro(a.base4yValue * factor(a))}</strong></div><div><button class="primary save-btn" data-name="${a.name}">Запази</button></div></div>`).join('')}</div></section>`;
  editorView.querySelectorAll('.save-btn').forEach(btn => btn.addEventListener('click', () => saveRow(btn.dataset.name)));
}

function saveRow(name){
  const store = getStore();
  const qtyInput = editorView.querySelector(`.qty-input[data-name="${CSS.escape(name)}"]`);
  const priceInput = editorView.querySelector(`.price-input[data-name="${CSS.escape(name)}"]`);
  const q = Number(qtyInput.value); const p = Number(priceInput.value);
  if(!Number.isFinite(q) || q < 0 || !Number.isFinite(p) || p < 0) return;
  store.qty[name] = q; store.unitPrice[name] = p; saveStore(store, true);
}

function renderAll(){ renderDashboard(); renderEditor(); }

async function setupSync(){
  const cfg = window.APP_SYNC_CONFIG || {};
  if(!cfg.enableSync){ setStatus('Sync е изключен.'); return; }
  const fb = cfg.firebase || {};
  if(!fb.apiKey || fb.apiKey.includes('PASTE_')) { setStatus('Попълни Firebase config в config.js'); return; }
  const app = initializeApp(fb); const auth = getAuth(app); db = getFirestore(app);
  try { await signInAnonymously(auth); } catch(e) { console.error(e); setStatus('Неуспешен Firebase login'); return; }
  const settings = getSettings();
  if(settings.portfolioId) connectPortfolio(settings.portfolioId); else setStatus('Sync готов. Натисни Sync и въведи Portfolio ID.');
}

function connectPortfolio(portfolioId){
  if(!db || !portfolioId) { setStatus('Липсва Firebase или Portfolio ID'); return; }
  activePortfolioId = portfolioId.trim();
  if(unsub) unsub();
  const ref = doc(db, 'portfolios', activePortfolioId);
  unsub = onSnapshot(ref, async (snap) => {
    if(!snap.exists()){
      await setDoc(ref, { store: getStore(), updatedAt: serverTimestamp() }, { merge: true });
      setStatus('Създаден нов cloud portfolio: ' + activePortfolioId);
      return;
    }
    const data = snap.data();
    if(data && data.store){
      suppressRemoteWrite = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.store));
      suppressRemoteWrite = false;
      renderAll();
      setStatus('Синхронизирано с cloud portfolio: ' + activePortfolioId);
    }
  }, (error) => {
    console.error(error);
    setStatus('Грешка при Firestore sync');
  });
}

async function syncToCloud(store){
  if(suppressRemoteWrite || !db || !activePortfolioId) return;
  const ref = doc(db, 'portfolios', activePortfolioId);
  try { await setDoc(ref, { store, updatedAt: serverTimestamp() }, { merge: true }); setStatus('Промените са качени: ' + activePortfolioId); } catch(e) { console.error(e); setStatus('Грешка при sync'); }
}

syncBtn.addEventListener('click', ()=>{ portfolioIdInput.value = getSettings().portfolioId || ''; showModal(); });
closeSyncBtn.addEventListener('click', ()=> hideModal());
saveSyncBtn.addEventListener('click', ()=>{
  const portfolioId = portfolioIdInput.value.trim();
  if(!portfolioId){ setStatus('Въведи Portfolio ID'); return; }
  saveSettings({ portfolioId });
  hideModal();
  connectPortfolio(portfolioId);
});
resetBtn.addEventListener('click', ()=>{ const s = defaultStore(); saveStore(s, true); });

hideModal();
renderAll();
setupSync();
if('serviceWorker' in navigator) window.addEventListener('load', ()=>navigator.serviceWorker.register('./service-worker.js?v=2'));
