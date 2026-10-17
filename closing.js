// ==========================================================
// closing.js — تاب التقفيل واستلام المرتجعات (main-panel-4)
// الأوردرات المفتوحة (closed !== true) حسب المندوب / المنطقة،
// مع استلام المرتجع واستلام الفلوس لكل أوردر، وكروت الإحصائيات.
// بيحفظ على الأوردر: returnReceived / returnReceivedAt
//                    cashReceived  / cashReceivedAt
// ==========================================================

// الحالات (بتتعرف بالاسم اللي في كوليكشن statuses — عدّل الكلمات لو أسماءك مختلفة)
// الترتيب مهم: "رفض رفض" و"رفض دفع" قبل "مرتجع"
const CL_CATS = [
    { key: 'returned', label: 'مرتجع', match: ['مرتجع'], card: 'border-t-rose-400', text: 'text-rose-600', head: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
    { key: 'refuseRefuse', label: 'رفض رفض', match: ['رفض رفض'], card: 'border-t-rose-400', text: 'text-rose-600', head: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
    { key: 'refusePay', label: 'رفض دفع', match: ['رفض دفع'], card: 'border-t-rose-400', text: 'text-rose-600', head: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
    { key: 'partial', label: 'جزئي', match: ['جزئي'], card: 'border-t-amber-400', text: 'text-amber-600', head: 'text-amber-700', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    { key: 'exchange', label: 'استبدال', match: ['استبدال'], card: 'border-t-purple-400', text: 'text-purple-600', head: 'text-purple-700', badge: 'bg-purple-50 text-purple-700 border-purple-200' }
];
const CL_COURIERS_COLLECTION = 'couriers';

const CL = { orders: [], couriers: [], statuses: [], cat: '', showSettled: false };
// ---------- أدوات ----------
function clEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// توحيد النص: حروف صغيرة + أرقام عربية -> إنجليزية + شيل المسافات الزايدة
function clNorm(s) {
    return String(s ?? '')
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/\s+/g, ' ').trim().toLowerCase();
}
function clNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clFmt(n) { return clNum(n).toLocaleString('en-US'); }

function clCategory(status) {
    const s = clNorm(status);
    for (const c of CL_CATS) if (c.match.some(m => s.includes(clNorm(m)))) return c.key;
    return '';
}
const clCatInfo = key => CL_CATS.find(c => c.key === key);

// ---------- الاستماع للبيانات ----------
window.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
        if (!window.db) return;
        clearInterval(wait);
        clInjectBar();

        window.db.collection('orders').onSnapshot(snap => {
            CL.orders = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(o => o.closed !== true)
                .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
            clRefreshDatalist();
            clRender();
        }, err => console.error('خطأ تحميل أوردرات التقفيل:', err));

        window.db.collection('statuses').onSnapshot(snap => {
            CL.statuses = snap.docs.map(d => String(d.data().name || '').trim()).filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'ar'));
            clRender();
        }, err => console.error('خطأ تحميل الحالات:', err));

        window.db.collection(CL_COURIERS_COLLECTION).onSnapshot(snap => {
            CL.couriers = snap.docs.map(d => {
                const x = d.data();
                return { name: String(x.name || '').trim(), phone: String(x.phone || x.mobile || '').trim() };
            }).filter(c => c.name);
            clRefreshDatalist();
            clRender();
        }, err => console.error('خطأ تحميل المناديب:', err));

        ['cl-search', 'cl-order-search'].forEach(id =>
            document.getElementById(id)?.addEventListener('input', clRender));
        document.getElementById('cl-hide-done')?.addEventListener('change', clRender);
        // Enter في خانة الأوردر: لو في أوردر واحد بس، ركّز عليه
        document.getElementById('cl-order-search')?.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const first = document.querySelector('#cl-body tr[data-cl-row]');
            if (first && document.querySelectorAll('#cl-body tr[data-cl-row]').length === 1) {
                first.scrollIntoView({ block: 'center' });
            }
        });
    }, 100);
});

function clRefreshDatalist() {
    const dl = document.getElementById('cl-datalist');
    if (!dl) return;
    const vals = new Set();
    CL.couriers.forEach(c => { vals.add(c.name); if (c.phone) vals.add(c.phone); });
    CL.orders.forEach(o => { if (o.rider) vals.add(String(o.rider).trim()); if (o.area) vals.add(String(o.area).trim()); });
    dl.innerHTML = [...vals].filter(Boolean).map(v => `<option value="${clEsc(v)}"></option>`).join('');
}

// ---------- الفلترة ----------
// الأوردرات بعد بحث المندوب/المنطقة وبحث الأوردر (قبل فلتر الكارت وإخفاء المستلم)
function clScoped(ignoreOrder = false, includeSettled = false) {
    const q = clNorm(document.getElementById('cl-search')?.value);
    const oq = clNorm(document.getElementById('cl-order-search')?.value);

    // أسماء المناديب اللي رقمهم/اسمهم بيطابق البحث
    const riderNames = new Set();
    if (q) CL.couriers.forEach(c => {
        if (clNorm(c.name).includes(q) || (c.phone && clNorm(c.phone).includes(q))) riderNames.add(clNorm(c.name));
    });

    const showSettled = CL.showSettled; return CL.orders.filter(o => {
        if (o.settled && !showSettled && !includeSettled) return false;
        if (q) {
            const rider = clNorm(o.rider);
            const ok = riderNames.has(rider) || rider.includes(q) || clNorm(o.area).includes(q);
            if (!ok) return false;
        }
        if (oq && !ignoreOrder) {
            const hay = [o.orderId, o.customerName, o.phone, o.altPhone].map(clNorm).join(' ');
            if (!hay.includes(oq)) return false;
        }
        return true;
    });
}

function clVisible(scoped) {
    const hideDone = document.getElementById('cl-hide-done')?.checked;
    return scoped.filter(o => {
        const cat = clCategory(o.status);
        if (CL.cat === 'cash') { if (!(clNum(o.collected) > 0)) return false; }
        else if (CL.cat && cat !== CL.cat) return false;
        if (hideDone) {
            const needReturn = cat && !o.returnReceived && !o.closeAction;
            const needCash = clNum(o.collected) > 0 && !o.cashReceived;
            if (!needReturn && !needCash) return false;
        }
        return true;
    });
}

// ---------- الرسم ----------
function clRender() {
    const cardsEl = document.getElementById('cl-cards');
    const body = document.getElementById('cl-body');
    if (!cardsEl || !body) return;

    clRenderOutside();
    const scoped = clScoped();

    // ===== الكروت =====
    let cash = 0, cashPending = 0, cashCount = 0;
    const cnt = {}; CL_CATS.forEach(c => cnt[c.key] = { total: 0, done: 0 });
    scoped.forEach(o => {
        const col = clNum(o.collected);
        if (col > 0) { cash += col; cashCount++; if (!o.cashReceived) cashPending += col; }
        const k = clCategory(o.status);
        if (k) { cnt[k].total++; if (o.returnReceived || o.closeAction) cnt[k].done++; }
    });

    const cardBase = 'p-3 rounded-xl border border-slate-100 border-t-4 shadow-sm text-center flex flex-col justify-center min-h-[92px] cursor-pointer transition hover:shadow-md ';
    const sel = k => CL.cat === k ? ' ring-2 ring-emerald-500' : '';
    let html = `
        <div onclick="clSetCat('cash')" class="bg-white ${cardBase} border-t-emerald-500${sel('cash')}">
            <div class="text-[12px] font-semibold text-emerald-700">التحصيل</div>
            <div class="text-[20px] font-bold text-emerald-600">${clFmt(cash)}</div>
            <div class="text-[11px] text-slate-500">متبقي: <span class="font-semibold text-slate-700">${clFmt(cashPending)}</span> · ${cashCount} أوردر</div>
        </div>`;
    CL_CATS.forEach(c => {
        const x = cnt[c.key];
        html += `
        <div onclick="clSetCat('${c.key}')" class="bg-white ${cardBase} ${c.card}${sel(c.key)}">
            <div class="text-[12px] font-semibold ${c.head}">${c.label}</div>
            <div class="text-[20px] font-bold ${c.text}">${x.total}</div>
            <div class="text-[11px] text-slate-500">تم استلام: <span class="font-semibold text-slate-700">${x.done}</span></div>
        </div>`;
    });
    html += `
        <div onclick="clSetCat('')" class="bg-white ${cardBase} border-t-slate-400${sel('')}">
            <div class="text-[12px] font-semibold text-slate-600">كل الأوردرات</div>
            <div class="text-[20px] font-bold text-slate-700">${scoped.length}</div>
            <div class="text-[11px] text-slate-500">اضغط لإلغاء الفلتر</div>
        </div>`;
    cardsEl.innerHTML = html;

    // ===== الجدول =====
    const rows = clVisible(scoped);
    const oq = clNorm(document.getElementById('cl-order-search')?.value);

    const chip = document.getElementById('cl-filter-chip');
    if (chip) {
        if (CL.cat) {
            chip.textContent = CL.cat === 'cash' ? 'فلتر: التحصيل' : 'فلتر: ' + clCatInfo(CL.cat).label;
            chip.classList.remove('hidden');
        } else chip.classList.add('hidden');
    }

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">لا توجد أوردرات مطابقة</td></tr>`;
    } else {
        body.innerHTML = rows.map(o => {
            const k = clCategory(o.status);
            const info = clCatInfo(k);
            const col = clNum(o.collected);
            const actCell = clActionCell(o, k);

            const exact = oq && clNorm(o.orderId) === oq ? ' bg-emerald-50' : '';
            return `
            <tr data-cl-row class="border-b border-slate-100 hover:bg-slate-50${exact}${o.settled ? ' bg-slate-50' : ''}">
                <td class="p-3 font-mono font-semibold">${clEsc(o.orderId)}
                    ${o.settled ? `<button onclick="clUnsettleOne('${o.id}')" title="إرجاع للتقفيل"
                    class="mr-1 text-[10px] font-semibold text-amber-600 hover:underline">↩ إرجاع</button>` : ''}
                </td>
                <td class="p-3">${clEsc(o.customerName)}</td>
                <td class="p-3">${clEsc(o.phone)}</td>
                <td class="p-3 text-center">${clStatusCell(o, k, info)}</td>
                <td class="p-3 text-center">${clFmt(o.total)}</td>
                <td class="p-3 text-center font-semibold">${clFmt(o.collected)}</td>
                <td class="p-3">${clEsc(o.rider)}</td>
                <td class="p-3">${clEsc(o.area)}</td>
                <td class="p-3 text-center">${actCell}</td>
            </tr>`;
        }).join('');
    }

    const vis = rows.reduce((s, o) => s + clNum(o.collected), 0);
    const sum = document.getElementById('cl-summary');
    if (sum) sum.textContent = `${rows.length} أوردر · تحصيل الظاهر: ${clFmt(vis)}`;
}

function clSetCat(key) {
    CL.cat = (CL.cat === key) ? '' : key;
    clRender();
}

function clResetFilters() {
    ['cl-search', 'cl-order-search'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const h = document.getElementById('cl-hide-done'); if (h) h.checked = false;
    CL.cat = '';
    clRender();
}

// ---------- الاستلام ----------
function clFields(type, on) {
    const FV = firebase.firestore.FieldValue;
    return type === 'return'
        ? { returnReceived: on, returnReceivedAt: on ? FV.serverTimestamp() : null }
        : { cashReceived: on, cashReceivedAt: on ? FV.serverTimestamp() : null };
}

async function clReceive(id, type) {
    try { await window.db.collection('orders').doc(id).update(clFields(type, true)); }
    catch (e) { console.error(e); alert('تعذر حفظ الاستلام.'); }
}

// الحالات اللي "استلام" فيها = فلوس + مرتجع
const CL_BOTH = ['partial', 'exchange'];
const CL_ACTIONS = {
    cash: { label: 'استلام', cls: 'bg-emerald-600 hover:bg-emerald-500' },
    return: { label: 'مرتجع', cls: 'bg-rose-600 hover:bg-rose-500' },
    recycle: { label: 'تدوير', cls: 'bg-blue-600 hover:bg-blue-500' },
    custody: { label: 'عهدة', cls: 'bg-slate-700 hover:bg-slate-600' }
};

function clActionCell(o, k) {
    const done = o.closeAction || o.cashReceived || o.returnReceived;
    if (done) {
        let label = CL_ACTIONS[o.closeAction]?.label;
        if (!label) label = (o.cashReceived && o.returnReceived) ? 'استلام + مرتجع' : o.cashReceived ? 'استلام' : 'مرتجع';
        return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">${label} ✓
            <button onclick="clUndoAction('${o.id}')" title="إلغاء" class="text-slate-400 hover:text-rose-600">✕</button></span>`;
    }
    const col = clNum(o.collected);
    return `<div class="flex items-center justify-center gap-1">` +
        Object.entries(CL_ACTIONS).map(([key, a]) => {
            let text = a.label;
            if (key === 'cash' && col > 0) text += ' ' + clFmt(col);
            if (key === 'cash' && CL_BOTH.includes(k)) text = 'فلوس + مرتجع';
            return `<button onclick="clAct('${o.id}','${key}')" class="px-2 py-1 rounded-lg text-white text-[11px] font-semibold ${a.cls}">${text}</button>`;
        }).join('') + `</div>`;
}

async function clAct(id, action) {
    const o = CL.orders.find(x => x.id === id);
    if (!o) return;
    const FV = firebase.firestore.FieldValue;
    const upd = { closeAction: action, closeActionAt: FV.serverTimestamp() };
    if (action === 'cash') {
        upd.cashReceived = true; upd.cashReceivedAt = FV.serverTimestamp();
        // جزئي: فلوس + مرتجع باقي القطع
        if (CL_BOTH.includes(clCategory(o.status))) {
            upd.returnReceived = true; upd.returnReceivedAt = FV.serverTimestamp();
        }
    } else if (action === 'return') {
        upd.returnReceived = true; upd.returnReceivedAt = FV.serverTimestamp();
    }
    try { await window.db.collection('orders').doc(id).update(upd); }
    catch (e) { console.error(e); alert('تعذر حفظ الإجراء.'); }
}

async function clUndoAction(id) {
    try {
        await window.db.collection('orders').doc(id).update({
            closeAction: '', closeActionAt: null,
            cashReceived: false, cashReceivedAt: null,
            returnReceived: false, returnReceivedAt: null,
            settled: false, settledAt: null
        });
    } catch (e) { console.error(e); alert('تعذر إلغاء الإجراء.'); }
}

async function clUnsettleOne(id) {
    if (!confirm('إرجاع الأوردر ده للتقفيل؟ (هيتلغي استلامه)')) return;
    try {
        await window.db.collection('orders').doc(id).update({
            settled: false, settledAt: null,
            returnReceived: false, returnReceivedAt: null,
            cashReceived: false, cashReceivedAt: null
        });
    } catch (e) { console.error(e); alert('تعذر إرجاع الأوردر.'); }
}



// استلام كل اللي ظاهر في الجدول (مرتجعات أو فلوس) بتأكيد واحد
async function clReceiveAllVisible(type) {
    const rows = clVisible(clScoped()).filter(o => type === 'return'
        ? (clCategory(o.status) && !o.returnReceived)
        : (clNum(o.collected) > 0 && !o.cashReceived));
    if (!rows.length) return alert(type === 'return' ? 'لا توجد مرتجعات لاستلامها.' : 'لا توجد فلوس لاستلامها.');

    const total = rows.reduce((s, o) => s + clNum(o.collected), 0);
    const msg = type === 'return'
        ? `استلام ${rows.length} أوردر مرتجع؟`
        : `استلام فلوس ${rows.length} أوردر بإجمالي ${clFmt(total)} جم؟`;
    if (!confirm(msg)) return;

    try {
        for (let i = 0; i < rows.length; i += 400) {
            const batch = window.db.batch();
            rows.slice(i, i + 400).forEach(o =>
                batch.update(window.db.collection('orders').doc(o.id), clFields(type, true)));
            await batch.commit();
        }
    } catch (e) {
        console.error(e);
        alert('حدث خطأ، ممكن يكون جزء من الأوردرات اتسجل.');
    }
}


// ---------- تصحيح الحالة (لو المتابعة غلطت) ----------
function clStatusCell(o, k, info) {
    const names = CL.statuses.slice();
    if (o.status && !names.includes(o.status)) names.unshift(o.status);
    const opts = `<option value=""></option>` + names.map(n =>
        `<option value="${clEsc(n)}" ${n === o.status ? 'selected' : ''}>${clEsc(n)}</option>`).join('');
    const color = info ? info.badge : 'bg-slate-50 text-slate-600 border-slate-200';
    const quick = (!k && !o.cashReceived)
        ? `<button onclick="clMarkReturn('${o.id}')" title="الحالة غلط؟ حوّله لمرتجع"
             class="mt-1 block mx-auto text-[10px] font-semibold text-rose-600 hover:underline">هو مرتجع؟</button>`
        : '';
    return `<select onchange="clChangeStatus('${o.id}', this.value)"
                class="px-1.5 py-1 rounded-lg border text-[11px] font-semibold focus:outline-none ${color}">${opts}</select>${quick}`;
}

function clMarkReturn(id) {
    const name = CL.statuses.find(n => clCategory(n) === 'returned') || 'مرتجع';
    clChangeStatus(id, name);
}

async function clChangeStatus(id, newStatus) {
    const o = CL.orders.find(x => x.id === id);
    if (!o || o.status === newStatus) return;

    const FV = firebase.firestore.FieldValue;
    const oldCat = clCategory(o.status);
    const newCat = clCategory(newStatus);
    const col = clNum(o.collected);
    const upd = { status: newStatus, updatedAt: FV.serverTimestamp() };

    // مرتجع كامل / رفض: مفيش فلوس المفروض تتحصّل
    if (['returned', 'refuseRefuse', 'refusePay'].includes(newCat) && col > 0) {
        const warn = o.cashReceived ? '\n⚠️ الفلوس دي اتسجلت إنها اتستلمت قبل كده.' : '';
        if (confirm(`الحالة الجديدة "${newStatus}" — تصفير التحصيل (${clFmt(col)}) للأوردر ${o.orderId || ''}؟${warn}`)) {
            upd.collected = 0;
            upd.cashReceived = false;
            upd.cashReceivedAt = null;
        }
    }
    // خرج من حالات المرتجع: يتلغي استلام المرتجع
    if (oldCat && !newCat && o.returnReceived) {
        upd.returnReceived = false;
        upd.returnReceivedAt = null;
    }

    try { await window.db.collection('orders').doc(id).update(upd); }
    catch (e) { console.error(e); alert('تعذر تغيير الحالة.'); clRender(); }
}


// ==========================================================
// برا مع المناديب + زرار "تم استلام المندوب / المنطقة"
// settled:true على الأوردر = اتستلم من المندوب، فبيختفي من التقفيل
// ==========================================================
function clInjectBar() {
    const cards = document.getElementById('cl-cards');
    if (!cards || document.getElementById('cl-outside')) return;

    const box = document.createElement('div');
    box.id = 'cl-outside';
    box.className = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3';
    box.innerHTML = `
        <div class="flex flex-wrap items-center gap-3">
            <div class="text-sm font-bold text-slate-700 flex items-center gap-2">
                <i class="fa-solid fa-person-walking-arrow-right text-amber-500"></i>
                برا مع المناديب: <span id="cl-outside-total" class="text-amber-600">0</span> أوردر
            </div>
            <div class="flex-1"></div>
            <button type="button" id="cl-show-settled-btn" onclick="clToggleSettled()"
                class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition">
                عرض اللي تم استلامهم
            </button>
            <button type="button" id="cl-settle-btn" onclick="clSettleScope(!CL.showSettled)"
                class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"></button>
        </div>
        <div id="cl-outside-chips" class="flex flex-wrap gap-2"></div>`;
    cards.parentNode.insertBefore(box, cards);

    box.querySelector('#cl-outside-chips').addEventListener('click', e => {
        const b = e.target.closest('[data-name]');
        if (!b) return;
        const inp = document.getElementById('cl-search');
        if (inp) { inp.value = b.dataset.name; clRender(); }
    });
}

function clToggleSettled() {
    CL.showSettled = !CL.showSettled;
    clRender();
}


function clRenderOutside() {
    const chips = document.getElementById('cl-outside-chips');
    if (!chips) return;

    // برا = أوردرات متعيّن لها مندوب ولسه مستلمناش منه
    // برا = أوردرات متعيّن لها مندوب ولسه مستلمناش منه
    const hasRider = o => String(o.rider || '').trim();
    const out = CL.orders.filter(o => !o.settled && hasRider(o));
    document.getElementById('cl-outside-total').textContent = out.length;

    // الأزرار: المناديب اللي لسه ما اتستلموش (أو اللي اتستلموا لو فاتح عرض المستلمين)
    const list = CL.orders.filter(o => hasRider(o) && (CL.showSettled ? o.settled : !o.settled));
    const by = new Map();   // اسم المندوب -> { n: عدد الأوردرات, areas: Set }
    list.forEach(o => {
        const k = String(o.rider).trim();
        if (!by.has(k)) by.set(k, { n: 0, areas: new Set() });
        const x = by.get(k);
        x.n++;
        if (String(o.area || '').trim()) x.areas.add(String(o.area).trim());
    });

    const selected = clNorm(document.getElementById('cl-search')?.value);
    chips.innerHTML = by.size
        ? [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([name, x]) => {
            const areas = [...x.areas].join('، ');
            const on = selected && clNorm(name) === selected;
            return `<button type="button" data-name="${clEsc(name)}"
                class="px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition text-right ${on
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'}">
                <span class="font-bold">${clEsc(name)}</span> <span class="font-bold">(${x.n})</span>
                ${areas ? `<span class="block text-[10px] font-medium ${on ? 'text-emerald-100' : 'text-slate-500'}">${clEsc(areas)}</span>` : ''}
            </button>`;
        }).join('')
        : `<span class="text-[11px] text-slate-400">${CL.showSettled ? 'مفيش مناديب اتستلموا' : 'كل المناديب اتستلموا ✓'}</span>`;
    const q = (document.getElementById('cl-search')?.value || '').trim();
    const scope = clScoped(true, true);
    const toSettle = scope.filter(o => !o.settled).length;
    const toUndo = scope.filter(o => o.settled).length;

    const showBtn = document.getElementById('cl-show-settled-btn');
    if (showBtn) {
        showBtn.textContent = CL.showSettled ? 'إخفاء اللي تم استلامهم' : 'عرض اللي تم استلامهم';
        showBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition ' +
            (CL.showSettled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200');
    }

    const btn = document.getElementById('cl-settle-btn');
    if (CL.showSettled) {
        btn.disabled = !q || !toUndo;
        btn.innerHTML = q
            ? `<i class="fa-solid fa-rotate-left"></i> إلغاء استلام المندوب المختار (${toUndo})`
            : `<i class="fa-solid fa-rotate-left"></i> اختار مندوب الأول`;
    } else {
        btn.disabled = !q || !toSettle;
        btn.innerHTML = q
            ? `<i class="fa-solid fa-circle-check"></i> تم استلام المندوب المختار (${toSettle})`
            : `<i class="fa-solid fa-circle-check"></i> اختار مندوب الأول`;
    }
}

async function clSettleScope(on) {
    const q = (document.getElementById('cl-search')?.value || '').trim();
    if (!q) return;
    const FV = firebase.firestore.FieldValue;
    const scope = clScoped(true, true);
    let targets, msg;
    if (on) {
        targets = scope.filter(o => !o.settled);
        if (!targets.length) return alert('مفيش أوردرات لاستلامها.');
        const pendRet = targets.filter(o => clCategory(o.status) && !o.returnReceived).length;
        const pendCash = targets.filter(o => clNum(o.collected) > 0 && !o.cashReceived)
            .reduce((s, o) => s + clNum(o.collected), 0);
        msg = `تأكيد استلام "${q}"؟\n\n• ${targets.length} أوردر هيتشالوا من التقفيل\n` +
            `• مرتجعات لسه متسجلتش: ${pendRet} (هتتسجل كمستلمة)\n` +
            `• فلوس لسه متسجلتش: ${clFmt(pendCash)} جم (هتتسجل كمستلمة)`;
    } else {
        targets = scope.filter(o => o.settled);
        if (!targets.length) return;
        msg = `إلغاء استلام "${q}"؟ ${targets.length} أوردر هيرجعوا للتقفيل.`;
    }
    if (!confirm(msg)) return;

    try {
        for (let i = 0; i < targets.length; i += 400) {
            const batch = window.db.batch();
            targets.slice(i, i + 400).forEach(o => {
                const ref = window.db.collection('orders').doc(o.id);
                if (!on) return batch.update(ref, { settled: false, settledAt: null });
                const upd = { settled: true, settledAt: FV.serverTimestamp() };
                if (clCategory(o.status) && !o.returnReceived) { upd.returnReceived = true; upd.returnReceivedAt = FV.serverTimestamp(); }
                if (clNum(o.collected) > 0 && !o.cashReceived) { upd.cashReceived = true; upd.cashReceivedAt = FV.serverTimestamp(); }
                batch.update(ref, upd);
            });
            await batch.commit();
        }
    } catch (e) {
        console.error(e);
        alert('حدث خطأ، ممكن يكون جزء من الأوردرات اتسجل.');
    }
}