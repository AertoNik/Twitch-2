// --- 1. ЛОКАЛЬНАЯ БД ---
const DB_NAME = 'StreamSimDB';
function initDB() { return new Promise((resolve, reject) => { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = (e) => e.target.result.createObjectStore('media'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function saveMediaFile(id, dataUrl) { const db = await initDB(); return new Promise(resolve => { const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').put(dataUrl, id); tx.oncomplete = () => resolve(); }); }
async function getMediaFile(id) { const db = await initDB(); return new Promise(resolve => { const req = db.transaction('media', 'readonly').objectStore('media').get(id); req.onsuccess = () => resolve(req.result); }); }
async function clearDB() { const db = await initDB(); db.transaction('media', 'readwrite').objectStore('media').clear(); }

// --- 2. УПРАВЛЕНИЕ СОСТОЯНИЕМ ---
const defaultState = {
   theme: 'dark',
   username: 'artnik_film',
   followers: 1420,
   avatarId: null,
   bannerId: null,
   balance: 0,
   donationsHistory: [],
   verified: false,
   bioText: "Официальный канал. Добро пожаловать в систему ARCHETYPE. Здесь проводятся кинематографичные трансляции."
};

let state = JSON.parse(localStorage.getItem('stream_sim_state')) || defaultState;
if (!state.donationsHistory) state.donationsHistory = [];
if (state.verified === undefined) state.verified = false;
if (!state.bioText) state.bioText = defaultState.bioText;

function saveStateLocally() { localStorage.setItem('stream_sim_state', JSON.stringify(state)); }

let isLive = false;
let currentViewers = 0;
let raidBoostTimer = 0; // Таймер ускорения после рейда
let targetViewers = 0;
let streamStartTime = 0;
let liveInterval = null;
let currentTitle = "Трансляция";
let currentCategory = "Общение";

// OBS Таймер
let waitTimerInterval = null;
let waitSeconds = 300;

// --- 3. БАЗА ЧАТА И КАНАЛОВ ---
const FAKE_CHANNELS_POOL = [
    {n: "BIGRUSSIANMUM", c: "Heroes of Might", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=1"},
    {n: "keliencs", c: "Counter-Strike", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=2"},
    {n: "Terablade", c: "The Evil Within 2", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=3"},
    {n: "Vovapain", c: "Dota 2", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=4"},
    {n: "Loru77", c: "Общение", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=5"},
    {n: "yuki_nuki", c: "Just Chatting", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=6"},
    {n: "Drainys", c: "World of Warcraft", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=7"},
    {n: "GohaMedia", c: "Diablo IV", img: "https://api.dicebear.com/7.x/avataaars/svg?seed=8"}
];
let activeFakeChannels = [];

const CHAT_USERS = ["xX_slayer_Xx", "pog_champ99", "ttv_yasuo", "bot_007", "anime_fan", "kappalord", "stream_sniper", "random_guy", "shadow_ninja", "pepe_frog", "lurker228", "gigachad", "simp_master", "chill_dude", "toxic_player", "neon_dreamer", "cyber_punk"];
const CHAT_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#f43f5e"];

const MOD_USERS = ["detective_sys", "warden_fan"];
const MOD_MSGS = ["Чат, без спама", "Держим себя в руках", "Таймаут 300 сек.", "Сообщение удалено модератором."];

const VIP_USER = "katherine_h";
const VIP_MSGS = ["снова глубокие тени... мне нравится 🖤", "ты сегодня выглядишь уставшим, отдохни немного...", "очень атмосферно", "опять работаешь допоздна?", "не забывай отдыхать..."];
// СЛОВАРЬ ЭМОДЗИ (Текст -> Картинка)
const EMOTES = {
    "Pog": "https://static-cdn.jtvnw.net/emoticons/v2/308165042/default/dark/1.0",
    "PogU": "https://cdn.7tv.app/emote/60af350036ee7b92bb8dc043/1x.webp",
    "LULW": "https://cdn.7tv.app/emote/603ca22036139c001460305f/1x.webp",
    "KEKW": "https://cdn.7tv.app/emote/603cbdb1c20d020014421b18/1x.webp",
    "Sadge": "https://cdn.7tv.app/emote/603ca22336139c0014603099/1x.webp",
    "PepeHands": "https://cdn.7tv.app/emote/603cbcdfc20d020014421b04/1x.webp",
    "GIGACHAD": "https://cdn.7tv.app/emote/614c2b95c0245a1631525a77/1x.webp",
    "kappa": "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
    "monkaS": "https://cdn.7tv.app/emote/603cba2fc20d020014421ade/1x.webp",
    "monkaW": "https://cdn.7tv.app/emote/603cbaa536139c0014603158/1x.webp"
};
const GENERAL_MSGS = ["Pog", "PogU", "LULW", "KEKW", "F", "1", "???", "W", "L", "monkaS", "monkaW", "gg", "база", "жиза", "Омегалул", "kappa", "drop fps", "привет стрим", "Sadge", "PepeHands", "GIGACHAD", "+rep"];
const CATEGORY_MSGS = {
   "Общение": [
       "как дела?", "что обсуждаем?", "расскажи историю", "ахаха", "осуждаю", "стример гений", 
       "скучно", "когда игры?", "чат летит", "читай чат", "какие планы на сегодня?", "привет чатик", 
       "как погода?", "а что за трек играет?", "кто откуда смотрит?", "что кушал сегодня?", 
       "согласен", "база", "хахаха", "кто тут с самого начала?", "наконец-то подруб!", "ура стрим", 
       "можешь повторить?", "ахах жиза", "понял принял", "ну такое", "как спалось?", "какой часовой пояс?", 
       "какие новости?", "стример, ты топ", "лайк не глядя", "чаёк налил, сижу кайфую", "уютно тут у вас", 
       "погнали", "норм сетап", "какой микрофон?", "свет топ", "привет из Норвегии!", "давно не виделись", 
       "что по планам?", "какая мотивация!", "ARCHETYPE SYSTEM 🔥", "а как это работает?", "круто делаешь", 
       "вдохновляет", "можно модерку?", "почему игноришь?", "стример спит?", "запись будет?"
   ],
   "Реакции": [
       "включай следующее", "посмотри мармока", "зацени мой видос", "ахахаха реакция топ", 
       "скинул ссылку в донат", "осуждаю", "это бан", "Твич забанит за это?", "ставь на паузу, давай обсудим", 
       "кек", "я тоже так реагировал", "перемотай на 5:20", "он не понял шутки", "смотри до конца", 
       "когда игры?", "лучший формат", "сделай тише видео", "посмотри куплинова", "это классика", "LULW"
   ],
   "Фильмы и Сериалы": [
       "без спойлеров!", "кто убийца?", "хахаха", "что за фильм?", "а какая это серия?", 
       "я смотрел, концовка топ", "не подсказывайте", "он умрет в конце (шутка)", "лучший момент", 
       "попкорн взял", "озвучка топ", "как тебе актер?", "режиссер гений", "напряженный момент", 
       "monkaW", "я испугался", "звук тише сделай", "качество 1080p?", "где смотришь?", "шедевр"
   ],
   "Работа и Кодинг": [
       "что пишем?", "какой язык?", "почему не темная тема?", "ошибка на 42 строке", "сколько платят?", 
       "кодим вместе", "работягам привет", "сосредоточенный стример", "почему не питон?", "какой фреймворк?", 
       "что за клавиатура? так клацает", "помоги с багом", "github есть?", "ARCHETYPE SYSTEM в деле", 
       "как не выгорать?", "чай или кофе?", "лофи хип хоп на фон", "идеально для фона", "+ вайб"
   ],
   "ASMR": [
       "тссс", "я сплю", "звук клавиатуры каеф", "сделай ушко", "очень расслабляет", "уснул", 
       "постучи по микрофону", "мурашки", "какой микрофон?", "Zzzzz", "спасибо за стрим, доброй ночи", 
       "шепот топ", "визуальные триггеры", "tingles", "закрываю глаза", "то что нужно после работы"
   ],
   "IRL": [
       "где ты?", "какая погода?", "покажи вокруг", "что по связи?", "F connection", "IRL pog", 
       "купи шаурму", "сколько градусов?", "люди смотрят ахах", "какая камера?", "интернет лагает", 
       "красивый вид", "куда идем?", "осторожно машины", "какой город?", "атмосферно на улице"
   ],
   "Counter-Strike": [
       "aim assist", "какой ранг?", "ракуешь", "ez gg", "найс трай", "пушь его!", "читы оффни", 
       "скилл ишью", "gg wp", "катка слита", "FPS drop", "nice spray", "раш б", "эко раунд", 
       "nt", "дай кфг", "какой прицел?", "сенса какая?", "аим бот", "VAC", "репорт", "слив"
   ],
   "Dota 2": [
       "репорт мидера", "где варды", "пуш мид", "ez", "GG", "ливни плз", "хорош", "какой ммр?", 
       "тима раков", "дай сборку", "пуш тавер", "рошан", "зачем туда пошел?", "хилься", "тп на топ"
   ],
   "Кино": [
       "это кино?", "визуал топ", "какая камера?", "цветокор секс", "ARCHETYPE 🔥", "режиссер хорош", 
       "свет топ", "какой объектив?", "композиция 10/10", "атмосфера просто космос", "Neo-noir vibe", 
       "очень глубоко", "меланхолия...", "вайб Damon Salvatore", "отсылка к THE WARDEN?", "это шедевр"
   ],
   "Музыка": [
       "Drop the bass", "что за трек?", "shazam plx", "вайб", "качает", "VOLUME UP", "feelsgoodman", 
       "🔥", "БИТ!", "дай плейлист", "Spotify есть?", "Soundcloud?", "сделай погромче", "уши кайфуют"
   ]
};
const CATEGORY_DONATE_MSGS = {
    "Общение": ["На чай!", "Хорошая история", "Расскажи еще что-нибудь", "Привет из Норвегии!", "Зачитываюсь твоим чатом"],
    "Реакции": ["Посмотри мое видео!", "На наушники", "Реакция бесценна", "Задонатил ради твоей реакции", "Топ контент"],
    "Фильмы и Сериалы": ["На попкорн!", "Купи подписку на Netflix", "Заказываю следующий фильм", "Спасибо за совместный просмотр"],
    "Работа и Кодинг": ["На кофе для кодера", "Купи новую механику", "За фикс бага!", "Поддержка работяге", "На энергетик"],
    "ASMR": ["На новый микрофон", "Очень расслабляет, спасибо", "Сладких снов", "На пену для микрофона"],
    "IRL": ["На билет", "Купи покушать на улице", "На мобильный интернет", "Крутой стрим, гуляй дальше!"],
    "Counter-Strike": ["Купи авп", "На новые скины", "Хороший раскид", "За тот клатч!", "Тащи катку"],
    "Dota 2": ["Купи варды", "На танго", "Хороший ганг", "Репорт пуджа, а тебе респект", "Затащил!"],
    "Кино": ["За крутой визуал!", "На новую линзу", "Атмосфера просто космос 🎬", "Цветокор огонь", "На билет в кино", "Это искусство"],
    "Музыка": ["Сделай погромче!", "На новые наушники", "Трек пушка", "Заказываю песню!", "Бит качает"]
};

const GENERAL_DONATE_MSGS = [
    "На развитие канала!", "+rep", "Купи покушать", "Держи копеечку", 
    "Продолжай в том же духе!", "Для лучшего стримера", "W stream", 
    "Легенда", "Просто поддержка", "На кофе ☕", "Привет чату!", 
    "Как настроение?", "Лучший контент", "Спасибо за стрим", 
    "Атмосфера топ", "Не болей!", "Закидываю на удачу", "kekw"
];

function formatNum(num) {
   if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
   if (num >= 10000) return (num / 1000).toFixed(1) + 'k';
   return num.toLocaleString('ru-RU');
}

function syncFollowersUI() {
   const formatted = formatNum(state.followers);
   const els = [
       { id: 'stat-followers', text: formatted },
       { id: 'public-followers', text: `${formatted} фолловеров` },
       { id: 'inp-followers', val: state.followers }
   ];
   els.forEach(el => {
       const node = document.getElementById(el.id);
       if (node) {
           if (el.text !== undefined) node.innerText = el.text;
           if (el.val !== undefined) node.value = el.val;
       }
   });
}

function toggleLiveBadges(show) {
    const badges = ['live-badge-info', 'profile-live-badge'];
    badges.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (show) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
    const avatar = document.querySelector('.avatar-lg');
    if(avatar) {
        if(show) avatar.classList.add('live');
        else avatar.classList.remove('live');
    }
}

// --- 4. ИНИЦИАЛИЗАЦИЯ И РЕНДЕР ---
function initFakeChannels() {
    let shuffled = [...FAKE_CHANNELS_POOL].sort(() => 0.5 - Math.random());
    activeFakeChannels = shuffled.slice(0, 5).map(ch => ({ ...ch, v: Math.floor(Math.random() * 5000) + 100 }));
    renderSidebarChannels();
    renderProfileVODs(); 
}

function renderSidebarChannels() {
    const list = document.getElementById('active-channels-list');
    if(!list) return;
    list.innerHTML = '';
    activeFakeChannels.forEach(ch => {
        list.innerHTML += `
            <div class="channel-item">
                <div class="ci-avatar"><img src="${ch.img}"></div>
                <div class="ci-info">
                    <div class="ci-name">${ch.n}</div>
                    <div class="ci-cat">${ch.c}</div>
                </div>
                <div class="ci-viewers"><div class="ci-dot"></div> ${formatNum(ch.v)}</div>
            </div>`;
    });
}

function renderProfileVODs() {
    const grid = document.getElementById('profile-vods');
    if(!grid) return;
    grid.innerHTML = '';
    for(let i=1; i<=3; i++) {
        const views = Math.floor(Math.random() * 50) + 10;
        grid.innerHTML += `
        <div class="stream-card">
            <div class="stream-thumb">
                <span class="thumb-viewers">${views}k просмотров</span>
                <img src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80">
            </div>
            <div class="stream-card-info">
                <div class="stream-card-text">
                    <h4>ARCHETYPE VOD ${i}</h4>
                    <p>${i * 2} дней назад</p>
                </div>
            </div>
        </div>`;
    }
}

function updateUI() {
   document.body.className = state.theme === 'light' ? 'light-mode' : '';
   
   if(document.getElementById('channel-name')) document.getElementById('channel-name').innerText = state.username;
   if(document.getElementById('public-name')) document.getElementById('public-name').innerText = `@${state.username}`;
   if(document.getElementById('inp-username')) document.getElementById('inp-username').value = state.username;
   if(document.getElementById('public-bio')) document.getElementById('public-bio').innerText = state.bioText;

   document.querySelectorAll('.verified-badge').forEach(badge => {
       if (state.verified) badge.classList.remove('hidden');
       else badge.classList.add('hidden');
   });
   
   const btnVerify = document.getElementById('btn-verify');
   if (btnVerify) btnVerify.innerText = state.verified ? "Убрать галочку верификации" : "Включить галочку верификации";

   syncFollowersUI();
   updateWalletUI();
   toggleLiveBadges(isLive);

   if (state.avatarId) {
       getMediaFile(state.avatarId).then(src => {
           if(src) {
               ['profile-avatar', 'nav-avatar', 'public-avatar'].forEach(id => {
                   const el = document.getElementById(id);
                   if (el) el.src = src;
               });
           }
       });
   }

   if (state.bannerId) {
       getMediaFile(state.bannerId).then(src => {
           if(src) {
               const banner = document.querySelector('.profile-banner');
               if (banner) banner.style.backgroundImage = `url(${src})`;
           }
       });
   }
}

function updateWalletUI() {
   let totalEarned = 0;
   let topDonate = 0;
   let donateCount = 0;
   
   state.donationsHistory.forEach(d => {
       const amt = parseInt(d.amount);
       if (amt > 0) {
           totalEarned += amt;
           donateCount++;
           if (amt > topDonate) topDonate = amt;
       }
   });

   if(document.getElementById('wallet-total-earned')) {
       document.getElementById('wallet-balance').innerText = state.balance.toLocaleString('ru-RU');
       document.getElementById('wallet-total-earned').innerText = totalEarned.toLocaleString('ru-RU') + ' ₽';
       document.getElementById('wallet-top-donate').innerText = topDonate.toLocaleString('ru-RU') + ' ₽';
       document.getElementById('wallet-total-count').innerText = donateCount;
   }

   const list = document.getElementById('donations-list');
   if(!list) return;
   list.innerHTML = '';
   if (state.donationsHistory.length === 0) {
       list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Транзакций пока нет.</div>';
       return;
   }
  
   state.donationsHistory.slice().reverse().forEach(d => {
       const isWithdrawal = String(d.amount).startsWith('-');
       const amountColor = isWithdrawal ? '#ef4444' : '#4ade80';
       const sign = isWithdrawal ? '' : '+';
       const borderColor = isWithdrawal ? '#ef4444' : (parseInt(d.amount) >= 5000 ? '#fbbf24' : 'var(--accent)');
       
       const div = document.createElement('div');
       div.className = 'donate-item';
       div.style.borderLeftColor = borderColor;
       div.innerHTML = `
           <div style="overflow: hidden;">
               <div class="di-user">${d.user}</div>
               <div class="di-msg" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.msg}</div>
           </div>
           <div class="di-amount" style="color: ${amountColor};">${sign}${d.amount} ₽</div>
       `;
       list.appendChild(div);
   });
}

function switchTab(tabId) {
   document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
   document.getElementById(`view-${tabId}`).classList.add('active');
  
   document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
   if(event && event.currentTarget && event.currentTarget.classList.contains('nav-link')) {
       event.currentTarget.classList.add('active');
   }
   closeModals();
}

function saveSettings() {
   state.username = document.getElementById('inp-username').value;
   const newFollowers = parseInt(document.getElementById('inp-followers').value);
   if (!isNaN(newFollowers)) state.followers = newFollowers;
   saveStateLocally(); updateUI(); switchTab('stream');
}

function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveStateLocally(); updateUI(); }
function toggleVerification() { state.verified = !state.verified; saveStateLocally(); updateUI(); }

document.getElementById('public-bio').addEventListener('input', (e) => {
    state.bioText = e.target.innerText; saveStateLocally();
});

async function resetProgress() {
   if(confirm('Точно сбросить весь прогресс?')) { localStorage.removeItem('stream_sim_state'); await clearDB(); location.reload(); }
}

function setPaymentMethod(element) {
    document.querySelectorAll('.pay-method').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function withdrawFunds() {
    const inputEl = document.getElementById('withdraw-amount');
    let amountToWithdraw = parseInt(inputEl.value);
    
    if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) return alert("Введите корректную сумму.");
    if (amountToWithdraw > state.balance) return alert("Недостаточно средств на балансе!");
    
    state.balance -= amountToWithdraw;
    state.donationsHistory.push({ user: "Вывод средств", msg: "Успешный перевод на реквизиты.", amount: `-${amountToWithdraw}` });
    
    saveStateLocally(); inputEl.value = ''; updateWalletUI(); alert(`✅ Успешно выведено: ${amountToWithdraw} ₽`);
}

document.getElementById('avatar-upload').onchange = async (e) => {
   const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
   reader.onload = async (ev) => { await saveMediaFile('avatar', ev.target.result); state.avatarId = 'avatar'; saveStateLocally(); updateUI(); };
   reader.readAsDataURL(file);
};

const bannerUploadBtn = document.getElementById('banner-upload');
if (bannerUploadBtn) {
    bannerUploadBtn.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
        reader.onload = async (ev) => { await saveMediaFile('banner', ev.target.result); state.bannerId = 'banner'; saveStateLocally(); updateUI(); };
        reader.readAsDataURL(file);
    });
}

// --- 5. ДВИЖОК ТРАНСЛЯЦИИ И OBS ---
function openGoLiveModal() {
   if(document.getElementById('modal-stream-title')) document.getElementById('modal-stream-title').value = currentTitle;
   document.getElementById('modal-golive').classList.remove('hidden');
}
function closeModals() { document.getElementById('modal-golive').classList.add('hidden'); }

// Логика переключения сцен OBS
function setScene(scene) {
    document.querySelectorAll('.obs-btn').forEach(b => b.classList.remove('active'));
    const player = document.getElementById('stream-player');
    
    player.classList.remove('scene-cinema', 'scene-wait');
    clearInterval(waitTimerInterval);
    document.getElementById('wait-overlay').classList.add('hidden');

    if (scene === 'chat') {
        document.getElementById('btn-scene-chat').classList.add('active');
    } else if (scene === 'cinema') {
        document.getElementById('btn-scene-cinema').classList.add('active');
        player.classList.add('scene-cinema');
    } else if (scene === 'wait') {
        document.getElementById('btn-scene-wait').classList.add('active');
        player.classList.add('scene-wait');
        document.getElementById('wait-overlay').classList.remove('hidden');
        
        waitSeconds = 300; // 5 минут
        updateWaitTimer();
        waitTimerInterval = setInterval(() => {
            if(waitSeconds > 0) waitSeconds--;
            updateWaitTimer();
        }, 1000);
    }
}

function updateWaitTimer() {
    const m = String(Math.floor(waitSeconds / 60)).padStart(2, '0');
    const s = String(waitSeconds % 60).padStart(2, '0');
    document.getElementById('wait-timer').innerText = `${m}:${s}`;
}

document.getElementById('upload-stream-media').onchange = (e) => {
   const file = e.target.files[0];
   if(!file) return;
  
   currentTitle = document.getElementById('modal-stream-title').value || "Трансляция";
   currentCategory = document.getElementById('modal-stream-category').value;

   const reader = new FileReader();
   reader.onload = (event) => {
       startStream(event.target.result, file.type.startsWith('video/'));
       closeModals();
   };
   reader.readAsDataURL(file);
};

function startStream(mediaSrc, isVideo) {
   if (isLive) return;
   isLive = true;
   streamStartTime = Date.now();
   currentViewers = 0;
  
   let baseMultiplier = 0.01 + (Math.random() * 0.02);
   targetViewers = Math.floor(state.followers * baseMultiplier);
   if(targetViewers < 1 && state.followers > 0) targetViewers = 1;
  
   document.getElementById('display-title').innerText = currentTitle;
   document.getElementById('display-category').innerText = currentCategory;
   
   toggleLiveBadges(true);
   
   document.getElementById('obs-panel').classList.remove('hidden'); // Показываем пульт
   setScene('chat'); // Сцена по умолчанию

   document.getElementById('stream-offline').classList.add('hidden');
   document.getElementById('stream-player').classList.remove('hidden');
   document.getElementById('end-stream-btn').classList.remove('hidden');
  
   const wrapper = document.getElementById('media-wrapper');
   wrapper.innerHTML = isVideo ? `<video src="${mediaSrc}" autoplay loop muted playsinline></video>` : `<img src="${mediaSrc}">`;

   document.getElementById('chat-messages').innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 20px;">Добро пожаловать в чат!</div>';

   liveInterval = setInterval(streamTick, 1000);
}

function endStream() {
   isLive = false;
   clearInterval(liveInterval);
   clearInterval(waitTimerInterval);
   
   toggleLiveBadges(false);
   document.getElementById('obs-panel').classList.add('hidden'); // Прячем пульт
   
   document.getElementById('stream-offline').classList.remove('hidden');
   document.getElementById('stream-player').classList.add('hidden');
   document.getElementById('end-stream-btn').classList.add('hidden');
   document.getElementById('media-wrapper').innerHTML = '';
   generateChatMessage("System", "Трансляция завершена.", "#a1a1aa");
}

function streamTick() {
   if (!isLive) return;

   const diff = Math.floor((Date.now() - streamStartTime) / 1000);
   const h = Math.floor(diff / 3600);
   const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
   const s = String(diff % 60).padStart(2, '0');
   const uptimeStr = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
   document.getElementById('live-uptime').innerText = uptimeStr;

   if (raidBoostTimer > 0) raidBoostTimer--; // Таймер рейда тикает вниз

   // Имитация плавания онлайна
   if (Math.random() > 0.2) {
       if (Math.random() < 0.05) {
           let baseMultiplier = 0.01 + (Math.random() * 0.02);
           targetViewers = Math.floor(state.followers * baseMultiplier);
       }
      
       const step = Math.ceil(Math.abs(targetViewers - currentViewers) * 0.05) || 1;
       if (currentViewers < targetViewers) currentViewers += step;
       else if (currentViewers > targetViewers) currentViewers -= step;
      
       currentViewers += Math.floor(Math.random() * 7) - 3;
       if (currentViewers < 0) currentViewers = 0;

       document.getElementById('live-viewers').innerText = formatNum(currentViewers);
   }

   // Модификаторы шансов (если идет рейд, всё ускоряется)
   let chatMult = raidBoostTimer > 0 ? 3 : 1; // Чат в 3 раза быстрее
   let donateMult = raidBoostTimer > 0 ? 5 : 1; // Шанс доната в 5 раз выше

   const chatChance = Math.min(0.1 + (currentViewers / 5000), 1.0) * chatMult;
   if (Math.random() < chatChance) {
       const msgs = currentViewers > 1000 ? Math.floor(Math.random() * 4) + 1 : 1;
       for(let i=0; i<msgs; i++) generateChatMessage();
   }

   const donateChance = Math.min(0.002 + (currentViewers / 50000), 0.05) * donateMult;
   if (Math.random() < donateChance) triggerDonation();
// Шанс на платную подписку
   const subChance = Math.min(0.005 + (currentViewers / 40000), 0.08) * donateMult;
   if (Math.random() < subChance) triggerSubscription();
   // ОЧЕНЬ РЕДКИЙ шанс рейда (0.05% каждую секунду)
   if (Math.random() < 0.0005) triggerRaid();

   if (Math.random() < 0.05) {
       state.followers += Math.floor(Math.random() * 3) + 1;
       syncFollowersUI(); 
       saveStateLocally(); 
   }
}

// --- 6. ЧАТ И ДОНАТЫ ---
function generateChatMessage(userOverride, textOverride, colorOverride) {
   let user = userOverride;
   let text = textOverride;
   let color = colorOverride;
   let isMod = false;
   let isVip = false;

   if (!user) {
       const roll = Math.random();
       if (roll < 0.05) {
           user = MOD_USERS[Math.floor(Math.random() * MOD_USERS.length)];
           text = MOD_MSGS[Math.floor(Math.random() * MOD_MSGS.length)];
           color = "#22c55e"; 
           isMod = true;
       } else if (roll < 0.08) {
           user = VIP_USER;
           text = VIP_MSGS[Math.floor(Math.random() * VIP_MSGS.length)];
           color = "#e83e8c"; 
           isVip = true;
       } else {
           user = CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
           const msgPool = Math.random() > 0.5 ? GENERAL_MSGS : (CATEGORY_MSGS[currentCategory] || GENERAL_MSGS);
           text = msgPool[Math.floor(Math.random() * msgPool.length)];
           color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
       }
   }

   // ПРЕВРАЩАЕМ ТЕКСТ В ЭМОДЗИ
   let parsedText = text.split(' ').map(word => {
       if (EMOTES[word]) return `<img src="${EMOTES[word]}" class="chat-emote" alt="${word}">`;
       return word;
   }).join(' ');

   const chatBox = document.getElementById('chat-messages');
   const msgDiv = document.createElement('div');
   msgDiv.className = 'chat-msg';
  
   let badgesHtml = '<span class="chat-badges">';
   if (isMod) {
       badgesHtml += `<svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e" style="margin-right: 2px;"><path d="M12 2L2 7l10 5 10-5-10-5zm0 22l10-5V9l-10 5-10-5v10l10 5z"/></svg>`;
   } else if (isVip) {
       badgesHtml += `<svg viewBox="0 0 24 24" width="14" height="14" fill="#e83e8c" style="margin-right: 2px;"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>`;
   } else if (!userOverride && Math.random() > 0.8) {
       badgesHtml += `<img src="https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1" style="width:14px; height:14px; vertical-align:middle; margin-right:2px;">`;
   }
   badgesHtml += '</span>';

   msgDiv.innerHTML = `${badgesHtml}<span class="chat-user" style="color: ${color};">${user}:</span><span class="chat-text">${parsedText}</span>`;
  
   chatBox.appendChild(msgDiv);
   
   const isScrolledToBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 50;
   if (isScrolledToBottom) chatBox.scrollTop = chatBox.scrollHeight;
   
   if (chatBox.children.length > 150) chatBox.removeChild(chatBox.firstChild);
}

function sendMyMessage() {
   const input = document.getElementById('my-chat-input');
   if (input.value.trim() !== '') {
       generateChatMessage(state.username, input.value.trim(), 'var(--accent)');
       input.value = '';
   }
}

document.getElementById('my-chat-input').addEventListener('keypress', function (e) {
   if (e.key === 'Enter') sendMyMessage();
});

function triggerDonation() {
   const alertBox = document.getElementById('alert-box');
   if (!alertBox.classList.contains('hidden')) return;

   const user = CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
   let amount = 0, isEpic = false;
   
   // 1. ДИНАМИЧЕСКИЕ СУММЫ
   const roll = Math.random();
   if (roll < 0.70) { 
       // Обычный донат: от 50 до 490 руб
       amount = Math.floor(Math.random() * 45) * 10 + 50; 
   } else if (roll < 0.95) { 
       // Средний донат: от 500 до 4950 руб
       amount = Math.floor(Math.random() * 90) * 50 + 500; 
   } else { 
       // ЭПИЧЕСКИЙ донат: от 5000 до 95000 руб
       amount = Math.floor(Math.random() * 90) * 1000 + 5000; 
       isEpic = true; 
   }

   // 2. УМНЫЕ СООБЩЕНИЯ (Исправлено: теперь берет из новых баз)
   // 50% шанс на общее сообщение, 50% шанс на тематическое под текущую категорию
   const donatePool = Math.random() > 0.5 ? GENERAL_DONATE_MSGS : (CATEGORY_DONATE_MSGS[currentCategory] || GENERAL_DONATE_MSGS);
   let msg = donatePool[Math.floor(Math.random() * donatePool.length)];
   
   if (isEpic) msg = "СУМАСШЕДШИЙ ДОНАТ! " + msg;

   // 3. ЗВУК И ГИФКИ ПО УРОВНЯМ СУММЫ
   const audio = document.getElementById('donate-sound');
   const alertGif = document.getElementById('alert-gif');
   let playDurationMs = 2000;
   let selectedGif = "";

   // Базы гифок (Тир 1, Тир 2, Тир 3)
   const gifsSmall = [
       "https://media.giphy.com/media/JpG2A9P3dPHHoVJCce/giphy.gif",
       "https://media.giphy.com/media/1n8y4oR0uE5wLh8k5W/giphy.gif",
       "https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif"
   ];
   const gifsMedium = [
       "https://media.giphy.com/media/y0NFayaBeiWEU/giphy.gif",
       "https://media.giphy.com/media/bkcbX8SqTCXHG/giphy.gif",
       "https://media.giphy.com/media/l41Yh18f5TbiWHE0o/giphy.gif"
   ];
   const gifsEpic = [
       "https://media.giphy.com/media/3o85xwxr06YNoFdSbm/giphy.gif",
       "https://media.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif",
       "https://media.giphy.com/media/LdOyjZ7io5Msw/giphy.gif"
   ];

   if(audio) { 
       if (window.audioStopTimer) clearTimeout(window.audioStopTimer);

       if (amount <= 400) {
           // ТИР 1: Быстрый бульк
           audio.src = "https://www.myinstants.com/media/sounds/buy_1.mp3"; 
           playDurationMs = 1500; 
           selectedGif = gifsSmall[Math.floor(Math.random() * gifsSmall.length)];
       } else if (amount <= 4000) {
           // ТИР 2: Звук кассы
           audio.src = "https://www.myinstants.com/media/sounds/undertakers-bell_2UwFCIe.mp3"; 
           playDurationMs = 3000; 
           selectedGif = gifsMedium[Math.floor(Math.random() * gifsMedium.length)];
       } else {
           // ТИР 3: Мощный кинематографичный бас
           audio.src = "https://www.myinstants.com/media/sounds/king-nassir.mp3"; 
           playDurationMs = 8500; 
           selectedGif = gifsEpic[Math.floor(Math.random() * gifsEpic.length)];
       }
       
       audio.currentTime = 0; 
       audio.play().catch(e => {}); 

       window.audioStopTimer = setTimeout(() => {
           audio.pause();
           audio.currentTime = 0;
       }, playDurationMs);
   }

   // 4. СОХРАНЕНИЕ И ОБНОВЛЕНИЕ БАЛАНСА
   state.balance += amount;
   state.donationsHistory.push({ user: user, msg: msg, amount: amount });
   saveStateLocally();
   updateWalletUI();

   // 5. ПОКАЗ АЛЕРТА
   if (isEpic) alertBox.classList.add('alert-epic');
   else alertBox.classList.remove('alert-epic');
   
   alertGif.src = selectedGif;
   document.getElementById('alert-title').innerHTML = `${user} <span>${amount} RUB</span>`;
   document.getElementById('alert-message').innerText = msg;
  
   alertBox.classList.remove('hidden');
   alertBox.classList.add('show-da'); 
  
   // Взрыв чата при эпике
   if (isEpic) {
       for(let i=0; i<10; i++) setTimeout(() => generateChatMessage(null, "WTFFFFF", null), i*200);
       for(let i=0; i<5; i++) setTimeout(() => generateChatMessage(null, "PogU СКОЛЬКО?!", null), i*300);
   }

   const chatBox = document.getElementById('chat-messages');
   const donateMsg = document.createElement('div');
   donateMsg.className = 'chat-msg';
   donateMsg.style.background = isEpic ? 'rgba(251, 191, 36, 0.2)' : 'rgba(74, 222, 128, 0.15)';
   donateMsg.style.padding = '6px';
   donateMsg.style.borderRadius = '4px';
   donateMsg.style.borderLeft = isEpic ? '3px solid #fbbf24' : '3px solid #4ade80';
   donateMsg.innerHTML = `<span style="color: ${isEpic ? '#fbbf24' : '#4ade80'}; font-weight: bold;">[ДОНАТ] ${user} - ${amount}₽:</span> ${msg}`;
   chatBox.appendChild(donateMsg);
   
   const isScrolledToBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 50;
   if (isScrolledToBottom) chatBox.scrollTop = chatBox.scrollHeight;
   if (chatBox.children.length > 150) chatBox.removeChild(chatBox.firstChild);

   setTimeout(() => { 
       alertBox.classList.add('hidden'); 
       alertBox.classList.remove('alert-epic', 'show-da'); 
       alertGif.src = ""; 
   }, 10000);
}

// Функция запуска Редкого Рейда (Атмосферного)
function triggerRaid() {
    if (raidBoostTimer > 0) return; // Если эффект рейда еще идет, ждем

    // Выбираем стримера
    const raider = FAKE_CHANNELS_POOL[Math.floor(Math.random() * FAKE_CHANNELS_POOL.length)].n;
    
    // Элегантный размер рейда (от 1000 до 4000 человек)
    const raidSize = Math.floor(Math.random() * 3000) + 1000; 

    // Накручиваем онлайн
    currentViewers += raidSize;
    targetViewers += raidSize;
    document.getElementById('live-viewers').innerText = formatNum(currentViewers);

    // 1. Мягкий, кинематографичный звук уведомления (играет 3 секунды)
    const audio = document.getElementById('donate-sound');
    if(audio) {
        if (window.audioStopTimer) clearTimeout(window.audioStopTimer);
        // Звук глубокого мистического появления
        audio.src = "https://actions.google.com/sounds/v1/science_fiction/magic_sweep.ogg"; 
        audio.currentTime = 0;
        audio.play().catch(e => {});
        window.audioStopTimer = setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 3000);
    }

    // 2. Системное уведомление прямо в чат (без огромных плашек)
    const chatBox = document.getElementById('chat-messages');
    const sysMsg = document.createElement('div');
    sysMsg.className = 'chat-msg';
    sysMsg.style.background = 'rgba(145, 70, 255, 0.1)';
    sysMsg.style.borderLeft = '3px solid var(--accent)';
    sysMsg.style.padding = '10px';
    sysMsg.style.borderRadius = '4px';
    sysMsg.style.margin = '10px 0';
    sysMsg.style.textAlign = 'center';
    sysMsg.innerHTML = `<span style="color: var(--accent); font-weight: 700; letter-spacing: 1px;">[ARCHETYPE SYSTEM]</span><br><span style="color: var(--text); font-size: 13px;">Входящее подключение. <b>${raider}</b> перенаправляет ${raidSize} зрителей.</span>`;
    chatBox.appendChild(sysMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    // 3. Активируем буст чата и донатов на 60 секунд!
    raidBoostTimer = 60;

    // 4. Элегантные сообщения от новоприбывших зрителей
    const RAID_MSGS = [
        `мы от ${raider}`, "какой приятный визуал", "очень атмосферно тут", 
        "привет!", "уютный стрим", "остаюсь тут", "шикарная картинка", 
        "зашли на огонек", "добрый вечер", "ARCHETYPE? звучит круто",
        "вау, какой свет", "тут спокойнее"
    ];

    let spamCount = 0;
    const spamInterval = setInterval(() => {
        const msg = RAID_MSGS[Math.floor(Math.random() * RAID_MSGS.length)];
        // Новые зрители пишут приглушенным, серым цветом (стильно и не бьет по глазам)
        generateChatMessage(null, msg, "var(--text-muted)"); 
        spamCount++;
        
        if (spamCount > 15) clearInterval(spamInterval); 
    }, 400); // Сообщения появляются плавно
}

// Функция оформления платной подписки (Саб)
function triggerSubscription() {
    const user = CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
    const isPrime = Math.random() > 0.7; // 30% шанс на Twitch Prime
    const months = Math.random() > 0.5 ? Math.floor(Math.random() * 24) + 2 : 1; 

    // --- НОВОЕ: НАЧИСЛЯЕМ ДЕНЬГИ ЗА САБКУ ---
    // Допустим, с одной рублевой подписки стример получает чистыми около 130-150 рублей
    const subIncome = isPrime ? 130 : 150; 
    state.balance += subIncome;
    saveStateLocally();
    updateWalletUI();
    // ----------------------------------------

    // 1. Приятный звук уведомления
    const audio = document.getElementById('donate-sound');
    if(audio) {
        if (window.audioStopTimer) clearTimeout(window.audioStopTimer);
        audio.src = "https://actions.google.com/sounds/v1/ui/bell_ring.ogg"; 
        audio.currentTime = 0;
        audio.play().catch(e => {});
        window.audioStopTimer = setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 2000);
    }

    // 2. Системное сообщение в чат
    const chatBox = document.getElementById('chat-messages');
    const subMsg = document.createElement('div');
    subMsg.className = 'chat-sub-msg';
    
    const typeText = isPrime ? "оформляет подписку <b>Twitch Prime</b>!" : `оформляет подписку уровня 1!`;
    const monthText = months > 1 ? `<div class="chat-sub-months">В подписке уже ${months} мес. подряд!</div>` : `<div class="chat-sub-months">Добро пожаловать!</div>`;

    subMsg.innerHTML = `<div class="chat-sub-header"><span>★ ${user}</span> ${typeText}</div>${monthText}`;
    
    chatBox.appendChild(subMsg);
    
    const isScrolledToBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 50;
    if (isScrolledToBottom) chatBox.scrollTop = chatBox.scrollHeight;
    if (chatBox.children.length > 150) chatBox.removeChild(chatBox.firstChild);

    // 3. Зрители реагируют смайликами
    setTimeout(() => generateChatMessage(null, "Pog", null), 600);
    setTimeout(() => generateChatMessage(null, "PogU", null), 1200);
    setTimeout(() => generateChatMessage(null, "W", null), 1800);
}

// СТАРТ
initFakeChannels();
updateUI();