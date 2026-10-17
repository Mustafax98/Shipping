// ==========================================================
// zoning.js — تاب التقسيم الذكي
// 1) المناطق تتجلب لحظياً من الإعدادات (collection: zones)
// 2) البحث عن الأوردر من جدول الطلبات (collection: orders)
// 3) التعيين بيتسجل على Firebase في حقل المنطقة داخل الأوردر
// ==========================================================

// ---------- إعدادات (غيّر الأسماء هنا لو مختلفة عندك) ----------
const ZONING_CFG = {
    ordersCollection: 'orders',   // اسم كوليكشن الطلبات في Firestore
    zonesCollection: 'zones',     // اسم كوليكشن المناطق (من الإعدادات)
    areaField: 'area',            // الحقل اللي بيخزن المنطقة داخل الأوردر
    // أسماء الحقول المحتملة لكل بيان (أول حقل موجود هو اللي بيتاخد)
    fields: {
        code: ['code', 'orderCode', 'orderId', 'id'],
        client: ['client', 'customer', 'customerName', 'name'],
        phone: ['phone', 'phone1', 'mobile'],
        phone2: ['phone2', 'otherPhone'],
        price: ['total', 'price', 'amount'],
        office: ['office', 'officeName']
    }
};

// ---------- حالة التاب ----------
let zoningZones = [];          // [{id, name}]
let zoningOrders = [];         // كل الأوردرات (كاش لحظي)
let zoningFocusedArea = '';    // المنطقة المختارة
let zoningHintIndex = -1;
let zoningHintResults = [];
let zoningCouriers = [];

// ---------- أدوات مساعدة ----------
function zPick(obj, keys) {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return '';
}
function zGet(order, key) {
    // الكود لو مش موجود كحقل بنستخدم doc id
    const v = zPick(order, ZONING_CFG.fields[key]);
    return (key === 'code' && v === '') ? order._docId : v;
}
function zEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function zNorm(s) {
    return String(s ?? '').toLowerCase().trim();
}
function zOrderArea(o) {
    return o[ZONING_CFG.areaField] || '';
}

// ==========================================================
// 1. المناطق من الإعدادات
// ==========================================================
function zoningListenZones() {
    window.db.collection(ZONING_CFG.zonesCollection).onSnapshot(snap => {
        zoningZones = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(z => (z.name || '').trim() && z.status !== 'موقوف')
            .map(z => ({ id: z.id, name: z.name.trim(), courier: (z.courier || '').trim() }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        zoningRenderSelector();
        zoningRenderActiveRegions();
        zoningRenderCourierSelector();
    }, err => console.error('خطأ في جلب المناطق:', err));
}


function zoningRenderSelector() {
    const sel = document.getElementById('partition-area-selector');
    if (!sel) return;

    const keep = zoningFocusedArea;
    sel.removeAttribute('onchange'); // الـ inline القديم كان بينادي دالة مش موجودة
    sel.innerHTML = `<option value="">اختر المنطقة...</option>` +
        zoningZones.map(z =>
            `<option value="${zEsc(z.name)}" ${z.name === keep ? 'selected' : ''}>${zEsc(z.name)}</option>`
        ).join('');
    sel.onchange = e => zoningSelectArea(e.target.value);
}

function zoningRenderActiveRegions() {
    const box = document.getElementById('active-partition-regions');
    if (!box) return;

    if (!zoningZones.length) {
        box.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد مناطق، أضفها من الإعدادات</p>`;
        return;
    }

    const counts = {};
    zoningOrders.forEach(o => {
        const a = zOrderArea(o);
        if (a) counts[a] = (counts[a] || 0) + 1;
    });

    const withOrders = zoningZones.filter(z => counts[z.name] > 0);
    if (!withOrders.length) {
        box.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد مناطق بها أوردرات</p>`;
        return;
    }

    box.innerHTML = withOrders.map(z => {
        const active = z.name === zoningFocusedArea;
        return `
        <button type="button" onclick="zoningSelectArea('${zEsc(z.name).replace(/'/g, "\\'")}')"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border transition
            ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'}">
            <span>${zEsc(z.name)}</span>
            <span class="font-mono text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100'}">${counts[z.name] || 0}</span>
        </button>`;
    }).join('');
}

function zoningListenCouriers() {
    window.db.collection('couriers').onSnapshot(snap => {
        zoningCouriers = snap.docs.map(d => d.data())
            .filter(c => (c.name || '').trim() && c.active !== false && c.status !== 'موقوف')
            .map(c => c.name.trim())
            .sort((a, b) => a.localeCompare(b, 'ar'));
        zoningRenderCourierSelector();
    }, err => console.error('خطأ في جلب المناديب:', err));
}

function zoningCurrentZone() {
    return zoningZones.find(z => z.name === zoningFocusedArea);
}

function zoningRenderCourierSelector() {
    const sel = document.getElementById('zoning-courier-selector');
    if (!sel) return;
    const z = zoningCurrentZone();
    const cur = z ? z.courier : '';
    const names = [...zoningCouriers];
    if (cur && !names.includes(cur)) names.push(cur);
    sel.disabled = !z;
    sel.innerHTML = `<option value="">بدون مندوب</option>` +
        names.map(n => `<option value="${zEsc(n)}">${zEsc(n)}</option>`).join('');
    sel.value = cur;
}

async function zoningSetCourier(name) {
    const z = zoningCurrentZone();
    if (!z) return;
    try {
        await window.db.collection(ZONING_CFG.zonesCollection).doc(z.id).update({ courier: name });
        const snap = await window.db.collection(ZONING_CFG.ordersCollection)
            .where(ZONING_CFG.areaField, '==', z.name).get();
        const docs = snap.docs.filter(d => d.data().closed !== true);
        for (let i = 0; i < docs.length; i += 400) {
            const batch = window.db.batch();
            docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { rider: name }));
            await batch.commit();
        }
    } catch (err) {
        console.error('خطأ تعيين المندوب:', err);
        alert('حدث خطأ أثناء تعيين المندوب.');
    }
}

// ==========================================================
// 2. اختيار المنطقة
// ==========================================================
function zoningSelectArea(name) {
    zoningFocusedArea = name || '';

    const sel = document.getElementById('partition-area-selector');
    if (sel && sel.value !== zoningFocusedArea) sel.value = zoningFocusedArea;

    const display = document.getElementById('current-focused-area-display');
    const input = document.getElementById('quick-add-order-code');
    const btn = document.getElementById('btn-submit-code');

    if (display) display.textContent = zoningFocusedArea ? ` ${zoningFocusedArea}` : 'لم يتم اختيار منطقة';
    if (input) {
        input.disabled = !zoningFocusedArea;
        input.value = '';
        if (zoningFocusedArea) input.focus();
    }
    if (btn) btn.disabled = !zoningFocusedArea;

    zoningHideHint();
    zoningRenderCourierSelector();
    zoningRenderActiveRegions();
    zoningRenderAreaTable();
}

// ==========================================================
// 3. الأوردرات (كاش لحظي من جدول الطلبات)
// ==========================================================
function zoningListenOrders() {
    window.db.collection(ZONING_CFG.ordersCollection).onSnapshot(snap => {
        zoningOrders = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
        zoningRenderActiveRegions();
        zoningRenderAreaTable();
        // لو الهنت مفتوح نحدّثه
        const input = document.getElementById('quick-add-order-code');
        if (input && document.activeElement === input && input.value.trim()) zoningShowHint(input.value);
    }, err => console.error('خطأ في جلب الطلبات:', err));
}

// ==========================================================
// 4. البحث (تلميح ذكي)
// ==========================================================
function zoningSearch(query) {
    const q = zNorm(query);
    if (!q) return [];
    return zoningOrders.filter(o => {
        return zNorm(zGet(o, 'code')).includes(q) ||
            zNorm(zGet(o, 'client')).includes(q) ||
            zNorm(zGet(o, 'phone')).includes(q) ||
            zNorm(zGet(o, 'phone2')).includes(q);
    }).slice(0, 8);
}

function zoningShowHint(query) {
    const hint = document.getElementById('quick-search-hint');
    if (!hint) return;

    zoningHintResults = zoningSearch(query);
    zoningHintIndex = zoningHintResults.length ? 0 : -1;

    if (!query.trim()) return zoningHideHint();

    if (!zoningHintResults.length) {
        hint.innerHTML = `<div class="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs text-slate-400 text-center">لا يوجد أوردر مطابق</div>`;
        hint.classList.remove('hidden');
        return;
    }

    hint.innerHTML = `<div class="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">` +
        zoningHintResults.map((o, i) => {
            const area = zOrderArea(o);
            return `
            <div data-i="${i}" onclick="zoningAssign('${o._docId}')"
                class="zoning-hint-item px-3 py-2 text-xs cursor-pointer border-b border-slate-50 flex items-center justify-between gap-2 ${i === zoningHintIndex ? 'bg-emerald-50' : 'hover:bg-slate-50'}">
                <div class="min-w-0">
                    <div class="font-mono font-bold text-slate-800">${zEsc(zGet(o, 'code'))}</div>
                    <div class="text-slate-500 truncate">${zEsc(zGet(o, 'client'))} · ${zEsc(zGet(o, 'phone'))}</div>
                </div>
                ${area ? `<span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">${zEsc(area)}</span>` : ''}
            </div>`;
        }).join('') + `</div>`;
    hint.classList.remove('hidden');
}

function zoningHideHint() {
    const hint = document.getElementById('quick-search-hint');
    if (hint) { hint.classList.add('hidden'); hint.innerHTML = ''; }
    zoningHintResults = [];
    zoningHintIndex = -1;
}

function zoningMoveHint(dir) {
    if (!zoningHintResults.length) return;
    zoningHintIndex = (zoningHintIndex + dir + zoningHintResults.length) % zoningHintResults.length;
    document.querySelectorAll('.zoning-hint-item').forEach((el, i) => {
        el.classList.toggle('bg-emerald-50', i === zoningHintIndex);
    });
}

// ==========================================================
// 5. التعيين على Firebase
// ==========================================================
async function zoningAssign(docId) {
    if (!zoningFocusedArea) return alert('اختر المنطقة أولاً');
    const order = zoningOrders.find(o => o._docId === docId);
    if (!order) return;

    const current = zOrderArea(order);
    if (current === zoningFocusedArea) {
        alert('الأوردر ده متعين بالفعل على نفس المنطقة');
        return;
    }
    if (current && !confirm(`الأوردر متعين على منطقة "${current}"، تنقله إلى "${zoningFocusedArea}"؟`)) return;

    try {
        await window.db.collection(ZONING_CFG.ordersCollection).doc(docId).update({
            [ZONING_CFG.areaField]: zoningFocusedArea,
            rider: (zoningCurrentZone() || {}).courier || '',
            settled: false,
            settledAt: null,
            zonedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const input = document.getElementById('quick-add-order-code');
        if (input) { input.value = ''; input.focus(); }
        zoningHideHint();
    } catch (err) {
        console.error('خطأ أثناء التعيين:', err);
        alert('حدث خطأ أثناء حفظ التعيين على Firebase.');
    }
}

// الزر "تعيين": ياخد أول نتيجة، أو مطابقة تامة للكود
function assignOrderToFocusedArea() {
    const input = document.getElementById('quick-add-order-code');
    if (!input) return;
    const q = zNorm(input.value);
    if (!q) return;

    const exact = zoningOrders.find(o => zNorm(zGet(o, 'code')) === q);
    if (exact) return zoningAssign(exact._docId);

    const results = zoningSearch(input.value);
    if (results.length === 1) return zoningAssign(results[0]._docId);
    if (results.length > 1) {
        const picked = zoningHintResults[zoningHintIndex] || results[0];
        return zoningAssign(picked._docId);
    }
    alert('لا يوجد أوردر بهذا الكود/الاسم/الرقم');
}

async function zoningUnassign(docId) {
    if (!confirm('إزالة الأوردر من هذه المنطقة؟')) return;
    try {
        await window.db.collection(ZONING_CFG.ordersCollection).doc(docId).update({
            [ZONING_CFG.areaField]: '',
            rider: '',
            zonedAt: firebase.firestore.FieldValue.delete()
        });
    } catch (err) {
        console.error('خطأ أثناء الإزالة:', err);
        alert('حدث خطأ أثناء الإزالة.');
    }
}

// ==========================================================
// 6. جدول أوردرات المنطقة المحددة
// ==========================================================
function zoningRenderAreaTable() {
    const tbody = document.getElementById('focused-area-table-body');
    const counter = document.getElementById('focused-area-orders-count');
    if (!tbody) return;

    if (!zoningFocusedArea) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">برجاء تحديد منطقة.</td></tr>`;
        if (counter) counter.textContent = '0';
        return;
    }

    const list = zoningOrders.filter(o => zOrderArea(o) === zoningFocusedArea);
    if (counter) counter.textContent = list.length.toLocaleString();

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">لا توجد طلبات معينة لهذه المنطقة بعد.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => `
        <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono font-bold">${zEsc(zGet(o, 'code'))}</td>
            <td class="p-2">${zEsc(zGet(o, 'client'))}</td>
            <td class="p-2 text-left">${zEsc(zGet(o, 'price'))}</td>
            <td class="p-2">${zEsc(zGet(o, 'office'))}</td>
            <td class="p-2 text-center">
                <button onclick="zoningUnassign('${o._docId}')" title="إزالة من المنطقة"
                    class="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        </tr>`).join('');
}

// ==========================================================
// 7. التهيئة
// ==========================================================
function zoningBindInput() {
    const input = document.getElementById('quick-add-order-code');
    if (!input) return;

    input.addEventListener('input', e => zoningShowHint(e.target.value));
    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); zoningMoveHint(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); zoningMoveHint(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const picked = zoningHintResults[zoningHintIndex];
            if (picked) zoningAssign(picked._docId); else assignOrderToFocusedArea();
        }
        else if (e.key === 'Escape') zoningHideHint();
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('#quick-add-order-code') && !e.target.closest('#quick-search-hint')) zoningHideHint();
    });
}

function zoningInit() {
    zoningBindInput();
    zoningSelectArea('');
    zoningListenZones();
    zoningListenOrders();
    zoningListenCouriers();
}

document.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
        if (window.db && document.getElementById('partition-area-selector')) {
            clearInterval(wait);
            zoningInit();
        }
    }, 100);
});