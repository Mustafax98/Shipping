// ==========================================================
// review.js — تاب المراجعة: شهر كامل أو يوم محدد + حسابات + بحث + تعديل
// ==========================================================
const REVIEW_DELIVERED_STATUS = 'مكتمل';   // الحالة اللي بتتحسب عليها العمولة
// أسماء الحالات اللي بتتحسب في كل كارت (بتتطابق لو اسم الحالة بيحتوي على أي كلمة منهم).
// لو أسماء الحالات عندك مختلفة عدّلها هنا.
const REVIEW_CATS = {
    rr: ['رفض رفض'],
    rp: ['رفض دفع'],
    partial: ['جزئي'],
    exch: ['استبدال'],
    rot: ['تدوير'],
    ret: ['مرتجع'],
    recv: ['مكتمل', 'استلام']
};
const REVIEW_CAT_ORDER = ['rr', 'rp', 'partial', 'exch', 'rot', 'ret', 'recv'];   // الأدق الأول عشان "رفض استلام" ما يتحسبش استلام
const REVIEW_COLS = 11;                    // عدد أعمدة جدول الأوردرات
const REVIEW_TRANSFER_TYPES = ['فودافون كاش', 'انستاباي', 'تحويل بنكي', 'نقدي', 'أخرى'];

let reviewAll = [];
let reviewOffices = new Map();
let reviewActiveOffices = [];
let reviewSettlements = [];                // تسويات المكاتب (المبالغ المحوّلة)
let reviewOfficeStats = new Map();         // إحصائيات المكاتب في الفترة الحالية
let reviewSettleOffice = '';
let reviewSelectedOffice = '';             // المكتب المختار للمراجعة (فاضي = كل المكاتب)
let reviewOfficeInfo = new Map();          // بيانات المكاتب المسجلة: الكود والحالة والعمولة
let reviewEditMode = false;
let reviewPendingRender = false;
let reviewSelCell = null;                  // الخلية المحددة في وضع التعديل: { id, field }

// ---------- أدوات ----------
function rvEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function rvNum(v) { return Number(v) || 0; }
function rvFmt(n) { return Number(n).toLocaleString('en-US'); }
function rvSet(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function rvDayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// تاريخ الأوردر: createdAt ثم updatedAt ثم closedAt، وإلا null
function rvDate(o) {
    const t = o.createdAt || o.updatedAt || o.closedAt;
    if (t && t.toDate) return t.toDate();
    return o._pending ? new Date() : null;
}
function rvNorm(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}
function rvCategory(o) {
    const st = rvNorm(o.status);
    if (!st) return '';
    const k = REVIEW_CAT_ORDER.find(k => REVIEW_CATS[k].some(w => st.includes(rvNorm(w)))) || '';
    return (k === 'recv' && st.includes('رفض')) ? '' : k;   // أي حالة فيها "رفض" مش استلام
}
// الأوردر المحسوب = استلام أو جزئي أو استبدال (تصنيفها من REVIEW_CATS)
function rvIsDelivered(o) {
    return ['recv', 'partial', 'exch'].includes(rvCategory(o));
}
function rvCommission(o) {
    if (!rvIsDelivered(o)) return 0;
    return reviewOffices.get(String(o.officeName ?? '').trim()) || 0;
}

// ---------- الفترة المحددة (يوم واحد أو من - إلى) ----------
function rvMonthRange(offset) {
    const n = new Date();
    const a = new Date(n.getFullYear(), n.getMonth() + offset, 1);
    const b = new Date(n.getFullYear(), n.getMonth() + offset + 1, 0);
    return { from: rvDayKey(a), to: rvDayKey(b) };
}
function rvPresetRange(name) {
    const now = new Date();
    const day = off => rvDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + off));
    switch (name) {
        case 'today': return { from: day(0), to: day(0) };
        case 'yesterday': return { from: day(-1), to: day(-1) };
        case 'week': return { from: day(-6), to: day(0) };
        case 'prevmonth': return rvMonthRange(-1);
        default: return rvMonthRange(0);
    }
}
// الفترة الحالية من الخانتين (لو واحدة بس متحددة تبقى يوم واحد)
function rvRange() {
    let from = document.getElementById('review-from')?.value || '';
    let to = document.getElementById('review-to')?.value || '';
    if (!from && !to) { const r = rvPresetRange('month'); return { ...r, single: false }; }
    if (!from) from = to;
    if (!to) to = from;
    if (from > to) { const t = from; from = to; to = t; }
    return { from, to, single: from === to };
}
function rvInRange(key, r) { return !!key && key >= r.from && key <= r.to; }
function rvLongDay(key) {
    return new Date(key + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function rvShortDay(key) {
    return new Date(key + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}
function reviewSetRange(from, to) {
    const f = document.getElementById('review-from'), t = document.getElementById('review-to');
    if (f) f.value = from;
    if (t) t.value = to;
    reviewRender();
}
function reviewPreset(name) {
    const r = rvPresetRange(name);
    reviewSetRange(r.from, r.to);
}
function reviewOnRangeInput(which) {
    const f = document.getElementById('review-from'), t = document.getElementById('review-to');
    if (!f || !t) return;
    if (which === 'from' && f.value && (!t.value || t.value < f.value)) t.value = f.value;   // يوم واحد
    if (which === 'to' && t.value && (!f.value || f.value > t.value)) f.value = t.value;
    reviewRender();
}
function rvSettlementInRange(s, r) { return rvInRange(String(s.day || ''), r); }

// ---------- تحميل البيانات ----------
function reviewListenOffices() {
    if (!window.db) return;
    window.db.collection('offices').onSnapshot(snap => {
        reviewOffices = new Map();
        reviewOfficeInfo = new Map();
        reviewActiveOffices = [];
        snap.docs.forEach(d => {
            const x = d.data();
            const name = String(x.name || x.officeName || d.id).trim();
            reviewOffices.set(name, rvNum(x.commission));            // كل المكاتب للحساب
            reviewOfficeInfo.set(name, { code: x.code || '', active: x.active !== false, commission: rvNum(x.commission) });
            if (x.active !== false) reviewActiveOffices.push(name);  // النشطة بس للقائمة
        });
        reviewActiveOffices.sort((a, b) => a.localeCompare(b, 'ar'));
        reviewRender();
    }, err => console.error('فشل تحميل المكاتب للمراجعة:', err));
}


function reviewListen() {
    if (!window.db) return;
    window.db.collection('orders').onSnapshot(snap => {
        reviewAll = snap.docs.map(d => ({ id: d.id, _pending: d.metadata.hasPendingWrites, ...d.data() }));
        const body = document.getElementById('review-body');
        if (reviewEditMode && body && body.contains(document.activeElement)) reviewPendingRender = true;
        else reviewRender();
    }, err => {
        console.error('فشل تحميل المراجعة:', err);
        const body = document.getElementById('review-body');
        if (body) body.innerHTML = `<tr><td colspan="${REVIEW_COLS}" class="p-6 text-center text-rose-500">تعذر التحميل: ${rvEsc(err.message)}</td></tr>`;
    });
}

// ---------- اختيار اليوم (بالضغط على عنوان يوم في الجدول) ----------
function reviewPickDay(key) {
    reviewSetRange(key, key);
}

// ---------- وضع التعديل ----------
function reviewToggleEdit() {
    reviewEditMode = !reviewEditMode;
    reviewSelCell = null;
    const btn = document.getElementById('review-edit-btn');
    if (btn) {
        btn.className = 'px-3 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 text-white ' +
            (reviewEditMode ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-800 hover:bg-slate-700');
        btn.querySelector('span').textContent = reviewEditMode ? 'إنهاء التعديل' : 'تعديل';
    }
    reviewRender();
}

// الحالات من الإعدادات (collection: statuses) بترتيب أبجدي
let reviewStatuses = [];
let reviewStatusesListening = false;
function reviewListenStatuses() {
    if (!window.db || reviewStatusesListening) return;
    reviewStatusesListening = true;
    window.db.collection('statuses').onSnapshot(snap => {
        reviewStatuses = snap.docs
            .map(d => String(d.data().name ?? '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'ar'));
        const body = document.getElementById('review-body');
        if (reviewEditMode && body && body.contains(document.activeElement)) reviewPendingRender = true;
        else reviewRender();
    }, err => { reviewStatusesListening = false; console.error('فشل تحميل الحالات للمراجعة:', err); });
}
function reviewStatusList() {
    return reviewStatuses;
}

// خلية قابلة للتعديل (في وضع التعديل) أو نص عادي
function rvCell(o, field, opts = {}) {
    const v = o[field] ?? '';
    if (!reviewEditMode) return rvEsc(v);
    const cls = 'w-full min-w-[80px] text-center bg-white border border-slate-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-emerald-500';
    if (opts.options) {
        const cur = String(v);
        let html = `<option value=""></option>`;
        if (cur && !opts.options.includes(cur)) {
            const stopped = field === 'officeName' && reviewOffices.has(cur.trim());
            html += `<option value="${rvEsc(cur)}" selected>${rvEsc(cur)}${stopped ? ' (متوقف)' : ''}</option>`;
        }
        html += opts.options.map(x =>
            `<option value="${rvEsc(x)}" ${x === cur ? 'selected' : ''}>${rvEsc(x)}</option>`
        ).join('');
        return `<select class="${cls}" onchange="reviewSave('${o.id}','${field}',this,false)">${html}</select>`;
    }
    return `<input type="${opts.num ? 'number' : 'text'}" value="${rvEsc(v)}" class="${cls}"
        onchange="reviewSave('${o.id}','${field}',this,${!!opts.num})">`;
}


async function reviewSave(id, field, el, isNum) {
    if (!window.db) return;
    const raw = el.value;
    const val = isNum ? (raw === '' ? '' : Number(raw)) : raw.trim();
    const o = reviewAll.find(x => x.id === id);
    if (o && String(o[field] ?? '') === String(val)) return;

    el.classList.remove('bg-emerald-50', 'bg-rose-100');
    el.classList.add('bg-amber-50');
    try {
        // مش بنكتب updatedAt عشان الأوردرات القديمة ماتنقلش لتاريخ النهاردة
        await window.db.collection('orders').doc(id).update({
            [field]: val,
            reviewEditedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (o) o[field] = val;
        el.classList.remove('bg-amber-50');
        el.classList.add('bg-emerald-50');
    } catch (err) {
        console.error('خطأ أثناء التعديل:', err);
        el.classList.remove('bg-amber-50');
        el.classList.add('bg-rose-100');
        alert('تعذر حفظ التعديل، راجع الـ Console.');
    }
}

// تحديد خلية بالضغط عليها (وضع التعديل) ثم Delete لمسح قيمتها
document.addEventListener('click', e => {
    const body = document.getElementById('review-body');
    if (!body) return;
    body.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
    const td = e.target.closest && e.target.closest('#review-body td[data-field]');
    if (!reviewEditMode || !td) { reviewSelCell = null; return; }
    reviewSelCell = { id: td.dataset.id, field: td.dataset.field };
    td.classList.add('cell-selected');
});

document.addEventListener('keydown', e => {
    if (e.key !== 'Delete' || !reviewEditMode) return;
    const panel = document.getElementById('main-panel-7');
    if (!panel || panel.classList.contains('hidden')) return;
    const t = e.target;
    if (t.matches && t.matches('input, textarea')) return;          // الكتابة جوه خانة نص تفضل عادية
    const body = document.getElementById('review-body');
    let cell = body && body.contains(t) ? t.closest('td[data-field]') : null;
    if (!cell && reviewSelCell && !(t.matches && t.matches('select'))) {
        cell = [...body.querySelectorAll('td[data-field]')]
            .find(td => td.dataset.id === reviewSelCell.id && td.dataset.field === reviewSelCell.field) || null;
    }
    if (!cell) return;
    const control = cell.querySelector('select, input');
    if (!control) return;
    e.preventDefault();
    control.value = '';
    reviewSave(cell.dataset.id, cell.dataset.field, control, control.type === 'number');
});

// لو المستخدم بيكتب جوه الجدول، نأجل إعادة الرسم لحد ما يخرج منه
document.addEventListener('focusout', () => {
    setTimeout(() => {
        const body = document.getElementById('review-body');
        if (reviewPendingRender && body && !body.contains(document.activeElement)) {
            reviewPendingRender = false;
            reviewRender();
        }
    }, 0);
});

// ---------- العرض ----------
function rvTd(o, field, base) {
    const on = reviewEditMode && reviewSelCell && reviewSelCell.id === o.id && reviewSelCell.field === field;
    return `<td data-id="${rvEsc(o.id)}" data-field="${field}" class="${base}${on ? ' cell-selected' : ''}">`;
}

function reviewRow(o, withTime) {
    const d = rvDate(o);
    const officeNames = reviewActiveOffices;
    const officeName = String(o.officeName ?? '').trim();
    const known = reviewOffices.has(officeName);
    const rate = known ? reviewOffices.get(officeName) : 0;
    const delivered = rvIsDelivered(o);

    // اسم المكتب + عمولته
    const officeBadge = (officeName && !known)
        ? `<span class="mr-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">غير مسجل</span>`
        : '';
    const officeCell = reviewEditMode
        ? rvCell(o, 'officeName', { options: officeNames })
        : `<span class="font-semibold">${rvEsc(officeName)}</span>${officeBadge}`;

    // عمولة الأوردر نفسه
    // العمولة ثابتة من إعدادات المكتب (offices.commission على Firebase) وبتظهر على كل أوردرات المكتب.
    // بتتحسب في الإجماليات على المكتمل بس، فالباقي بيظهر رماديًا.
    let commissionCell;
    if (!officeName) commissionCell = delivered ? `<span class="text-[11px] text-amber-600">بدون مكتب</span>` : `<span class="text-slate-300">—</span>`;
    else if (!known) commissionCell = `<span class="text-[11px] text-amber-600">مكتب غير مسجل</span>`;
    else if (delivered) commissionCell = `<span class="font-bold text-indigo-600">${rvFmt(rate)}</span>`;
    else commissionCell = `<span class="text-slate-400" title="بتتحسب في الإجماليات عند اكتمال الأوردر">${rvFmt(rate)}</span>`;

    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-2.5 font-mono font-bold">${rvCell(o, 'orderId')}</td>
        ${rvTd(o, 'customerName', 'p-2.5')}${rvCell(o, 'customerName')}</td>
        ${rvTd(o, 'phone', 'p-2.5')}${rvCell(o, 'phone')}</td>
        ${rvTd(o, 'status', 'p-2.5 text-center')}${rvCell(o, 'status', { options: reviewStatusList() })}</td>
        ${rvTd(o, 'total', 'p-2.5 text-center')}${rvCell(o, 'total', { num: true })}</td>
        ${rvTd(o, 'collected', 'p-2.5 text-center')}${rvCell(o, 'collected', { num: true })}</td>
        ${rvTd(o, 'officeName', 'p-2.5')}${officeCell}</td>
        <td class="p-2.5 text-center">${commissionCell}</td>
        ${rvTd(o, 'area', 'p-2.5')}${rvCell(o, 'area')}</td>
        ${rvTd(o, 'rider', 'p-2.5')}${rvCell(o, 'rider')}</td>
        <td class="p-2.5 text-center text-slate-500">${d && withTime ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
    </tr>`;
}

function reviewRender() {
    const body = document.getElementById('review-body');
    if (!body) return;

    document.getElementById('review-period-summary')?.remove();
    document.getElementById('review-status-chips')?.parentElement?.remove();

    const range = rvRange();
    const fromInput = document.getElementById('review-from');
    const toInput = document.getElementById('review-to');
    if (fromInput && fromInput.value !== range.from) fromInput.value = range.from;
    if (toInput && toInput.value !== range.to) toInput.value = range.to;

    // تمييز الاختصار النشط
    document.querySelectorAll('#review-presets [data-preset]').forEach(b => {
        const pr = rvPresetRange(b.dataset.preset);
        const on = pr.from === range.from && pr.to === range.to;
        ['bg-emerald-600', 'text-white', 'border-emerald-600'].forEach(c => b.classList.toggle(c, on));
        ['bg-white', 'text-slate-600', 'border-slate-200'].forEach(c => b.classList.toggle(c, !on));
    });

    // 1) أوردرات الفترة
    const periodAll = [];
    const undated = [];
    reviewAll.forEach(o => {
        const d = rvDate(o);
        if (!d) { undated.push(o); return; }
        if (!rvInRange(rvDayKey(d), range)) return;
        periodAll.push({ o, d });
    });
    const period = reviewSelectedOffice
        ? periodAll.filter(x => String(x.o.officeName || 'بدون مكتب') === reviewSelectedOffice)
        : periodAll;

    // 2) الحسابات
    const commission = period.reduce((s, x) => s + rvCommission(x.o), 0);
    const sumTotal = items => items.reduce((sum, x) => sum + rvNum(x.o.collected), 0);
    const byCat = {};
    period.forEach(x => { const k = rvCategory(x.o); if (k) (byCat[k] = byCat[k] || []).push(x); });
    const setCat = (key, items, withValue = true) => {
        rvSet('review-n-' + key, rvFmt(items.length));
        if (withValue) rvSet('review-v-' + key, rvFmt(sumTotal(items)));
    };
    setCat('all', period);
    setCat('recv', byCat.recv || []);
    setCat('partial', byCat.partial || []);
    setCat('exch', byCat.exch || []);
    setCat('rr', byCat.rr || []);
    setCat('rp', byCat.rp || []);
    setCat('rot', byCat.rot || [], false);
    setCat('ret', period.filter(x => rvCategory(x.o) === 'ret' || String(x.o.returns ?? '').trim() !== ''), false);
    rvSet('review-stat-commission', rvFmt(commission));

    // عنوان الفترة
    const singleDay = range.single ? range.from : '';
    rvSet('review-period-label', singleDay
        ? rvLongDay(range.from)
        : `من ${rvShortDay(range.from)} إلى ${rvShortDay(range.to)}`);

    const badge = document.getElementById('review-period-badge');
    if (badge) {
        if (singleDay && period.length) {
            const closed = period.every(x => x.o.closed === true);
            badge.innerHTML = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${closed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${closed ? 'مقفول' : 'مفتوح'}</span>`;
        } else if (!singleDay) {
            const byDay = new Map();
            period.forEach(x => {
                const k = rvDayKey(x.d);
                if (!byDay.has(k)) byDay.set(k, []);
                byDay.get(k).push(x.o);
            });
            const closedDays = [...byDay.values()].filter(arr => arr.every(o => o.closed === true)).length;
            badge.innerHTML = `<span class="text-[11px] text-slate-500">${byDay.size} يوم فيه أوردرات · ${closedDays} مقفول</span>`;
        } else {
            badge.innerHTML = '';
        }
    }

    // توزيع المكاتب
    const offices = new Map();
    periodAll.forEach(x => {
        const k = String(x.o.officeName || 'بدون مكتب');
        const r = offices.get(k) || { n: 0, d: 0, t: 0, c: 0, m: 0, paid: 0 };
        r.n++; r.t += rvNum(x.o.total); r.m += rvCommission(x.o);
        if (['recv', 'partial', 'exch'].includes(rvCategory(x.o))) r.c += rvNum(x.o.collected);
        if (rvIsDelivered(x.o)) r.d++;
        offices.set(k, r);
    });
    reviewSettlements.filter(s => rvSettlementInRange(s, range)).forEach(s => {
        const k = String(s.officeName || 'بدون مكتب');
        const r = offices.get(k) || { n: 0, d: 0, t: 0, c: 0, m: 0, paid: 0 };
        r.paid += rvNum(s.amount);
        offices.set(k, r);
    });
    reviewOfficeStats = offices;

    const zero = { c: 0, m: 0, paid: 0 };
    const picked = reviewSelectedOffice ? [offices.get(reviewSelectedOffice) || zero] : [...offices.values()];
    const dueAll = picked.reduce((sum, r) => sum + (r.c - r.m), 0);
    const paidAll = picked.reduce((sum, r) => sum + r.paid, 0);
    rvSet('review-stat-due', rvFmt(dueAll));
    rvSet('review-stat-paid', rvFmt(paidAll));
    rvSet('review-stat-debt', rvFmt(dueAll - paidAll));

    const officeBody = document.getElementById('review-office-body');
    if (officeBody) {
        officeBody.innerHTML = offices.size
            ? [...offices.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, r]) => {
                const rate = reviewOffices.has(k.trim()) ? rvFmt(reviewOffices.get(k.trim())) : '—';
                const send = r.c - r.m;
                const rem = send - r.paid;
                const remCls = rem > 0 ? 'text-amber-600' : (rem < 0 ? 'text-rose-600' : 'text-emerald-600');
                const arg = encodeURIComponent(k).replace(/'/g, '%27');
                const btn = k === 'بدون مكتب'
                    ? `<span class="text-slate-300">—</span>`
                    : `<button type="button" onclick="event.stopPropagation(); openSettleModal(decodeURIComponent('${arg}'))"
                        class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition">تسوية</button>`;
                return `
            <tr class="border-b border-slate-50 cursor-pointer transition-colors ${k === reviewSelectedOffice ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : 'hover:bg-slate-50'}"
                onclick="reviewSelectOffice(decodeURIComponent('${arg}'))" title="اضغط لمراجعة هذا المكتب">
                <td class="py-1.5 px-3 font-semibold">${rvEsc(k)}</td>
                <td class="py-1.5 px-3 text-center text-indigo-600">${rate}</td>
                <td class="py-1.5 px-3 text-center">${rvFmt(r.n)}</td>
                <td class="py-1.5 px-3 text-center text-emerald-600">${rvFmt(r.d)}</td>
                <td class="py-1.5 px-3 text-center">${rvFmt(r.c)}</td>
                <td class="py-1.5 px-3 text-center text-indigo-600">${rvFmt(r.m)}</td>
                <td class="py-1.5 px-3 text-center font-bold text-blue-700">${rvFmt(send)}</td>
                <td class="py-1.5 px-3 text-center text-emerald-700">${rvFmt(r.paid)}</td>
                <td class="py-1.5 px-3 text-center font-bold ${remCls}">${rvFmt(rem)}</td>
                <td class="py-1.5 px-3 text-center">${btn}</td>
            </tr>`;
            }).join('')
            : `<tr><td colspan="10" class="py-4 text-center text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>`;
    }
    refreshSettleModal();
    reviewRenderDetail(offices, range);

    // 3) البحث داخل الجدول
    const q = (document.getElementById('review-search')?.value || '').toLowerCase().trim();
    const matches = o => (!reviewSelectedOffice || String(o.officeName || 'بدون مكتب') === reviewSelectedOffice) && (!q || [
        o.orderId, o.customerName, o.phone, o.altPhone, o.status,
        o.officeName, o.area, o.rider, o.companyName, o.employee, o.returns
    ].some(v => String(v ?? '').toLowerCase().includes(q)));

    const shown = period.filter(x => matches(x.o));
    // الأوردرات القديمة اللي بدون تاريخ بتظهر بس لما الفترة أكتر من يوم
    const shownUndated = (!range.single) ? undated.filter(matches) : [];
    rvSet('review-search-count', q ? `النتائج: ${rvFmt(shown.length + shownUndated.length)}` : '');

    const days = new Map();
    shown.forEach(x => {
        const key = rvDayKey(x.d);
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(x);
    });
    const sortedKeys = [...days.keys()].sort().reverse();

    let html = '';
    if (!shown.length && !shownUndated.length) {
        html = `<tr><td colspan="${REVIEW_COLS}" class="p-10 text-center text-slate-400">
            <i class="fa-regular fa-folder-open text-2xl block mb-2"></i>${q ? 'لا توجد نتائج للبحث' : 'لا توجد طلبات في هذه الفترة'}</td></tr>`;
    }

    html += sortedKeys.map(key => {
        const items = days.get(key).sort((a, b) => b.d - a.d);
        if (singleDay) return items.map(x => reviewRow(x.o, true)).join('');

        const closed = items.every(x => x.o.closed === true);
        const dayLabel = new Date(key + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
        const dTotal = items.reduce((s, x) => s + rvNum(x.o.total), 0);
        const dCollected = items.reduce((s, x) => s + rvNum(x.o.collected), 0);
        const dCommission = items.reduce((s, x) => s + rvCommission(x.o), 0);

        return `
    <tr class="bg-slate-100 cursor-pointer hover:bg-slate-200" onclick="reviewPickDay('${key}')" title="اضغط لعرض هذا اليوم فقط">
        <td colspan="${REVIEW_COLS}" class="p-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-slate-800">${rvEsc(dayLabel)}</span>
                <span class="text-slate-500">${items.length} أوردر · إجمالي ${rvFmt(dTotal)} · تحصيل ${rvFmt(dCollected)} · عمولة ${rvFmt(dCommission)}</span>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${closed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                    ${closed ? 'مقفول' : 'مفتوح'}
                </span>
            </div>
        </td>
    </tr>` + items.map(x => reviewRow(x.o, true)).join('');
    }).join('');

    if (shownUndated.length) {
        html += `
        <tr class="bg-amber-50">
            <td colspan="${REVIEW_COLS}" class="p-2.5 font-bold text-amber-700">بدون تاريخ إضافة (${shownUndated.length}) — أوردرات قديمة</td>
        </tr>` + shownUndated.map(o => reviewRow(o, false)).join('');
    }

    body.innerHTML = html;
}
// ==========================================================
// تسوية المكاتب: تسجيل المبالغ المحوّلة لكل مكتب
// ==========================================================
let reviewSettlementsListening = false;
function reviewListenSettlements() {
    if (!window.db || reviewSettlementsListening) return;
    reviewSettlementsListening = true;
    window.db.collection('office_settlements').onSnapshot(snap => {
        reviewSettlements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        reviewRender();
        refreshSettleModal();
    }, err => { reviewSettlementsListening = false; console.error('فشل تحميل التسويات:', err); });
}

function rvPeriodInfo() {
    return rvRange();
}

function rvSettlementsOf(name) {
    const r = rvRange();
    return reviewSettlements
        .filter(s => String(s.officeName || 'بدون مكتب') === name && rvSettlementInRange(s, r))
        .sort((a, b) => String(b.day).localeCompare(String(a.day)));
}

function ensureSettleModal() {
    if (document.getElementById('settle-modal')) return;
    const w = document.createElement('div');
    w.innerHTML = `
    <div id="settle-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[9999] p-4" dir="rtl">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                <h4 class="text-sm font-bold text-slate-800">تسوية مكتب: <span id="settle-office-name"></span></h4>
                <button type="button" onclick="closeSettleModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">✕</button>
            </div>
            <div class="p-6 space-y-4 overflow-y-auto">
                <div id="settle-summary" class="grid grid-cols-3 gap-2 text-center text-xs"></div>
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="text-xs font-bold text-slate-700">المبلغ المحوّل (جم)</label>
                        <button type="button" onclick="settleFillRemaining()" class="text-[11px] font-semibold text-emerald-700 hover:underline">المديونية كلها</button>
                    </div>
                    <input type="number" id="settle-amount" min="0" step="any"
                        class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1.5">نوع التحويل</label>
                    <select id="settle-type"
                        class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                        ${REVIEW_TRANSFER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1.5">تاريخ التحويل</label>
                        <input type="date" id="settle-date"
                            class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1.5">ملاحظة (اختياري)</label>
                        <input type="text" id="settle-note" placeholder="مثال: رقم العملية"
                            class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                    </div>
                </div>
                <p id="settle-error" class="hidden text-[11px] font-semibold text-rose-600"></p>
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="closeSettleModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold">إلغاء</button>
                    <button type="button" id="settle-save" onclick="saveSettlement()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50">حفظ التسوية</button>
                </div>
                <div>
                    <div class="text-xs font-bold text-slate-600 mb-2">تسويات هذه الفترة</div>
                    <div id="settle-history" class="space-y-1.5"></div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(w.firstElementChild);
    const modal = document.getElementById('settle-modal');
    modal.addEventListener('click', e => { if (e.target === modal) closeSettleModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeSettleModal();
    });
}

function settleRemaining() {
    const st = reviewOfficeStats.get(reviewSettleOffice) || { c: 0, m: 0, paid: 0 };
    return (st.c - st.m) - (st.paid || 0);
}

function openSettleModal(name) {
    ensureSettleModal();
    reviewSettleOffice = name;
    const pr = rvRange();
    document.getElementById('settle-office-name').textContent = name;
    document.getElementById('settle-date').value = pr.single ? pr.from :
        rvDayKey(new Date()); document.getElementById('settle-note').value = '';
    document.getElementById('settle-type').selectedIndex = 0;
    document.getElementById('settle-error').classList.add('hidden');
    const btn = document.getElementById('settle-save');
    btn.disabled = false; btn.textContent = 'حفظ التسوية';

    const rem = settleRemaining();
    document.getElementById('settle-amount').value = rem > 0 ? rem : '';
    refreshSettleModal();

    const modal = document.getElementById('settle-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => document.getElementById('settle-amount')?.focus(), 50);
}

function closeSettleModal() {
    const modal = document.getElementById('settle-modal');
    if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

function settleFillRemaining() {
    const rem = settleRemaining();
    document.getElementById('settle-amount').value = rem > 0 ? rem : '';
}

// تحديث الملخص والسجل (من غير ما نلمس خانة المبلغ اللي المستخدم بيكتب فيها)
function refreshSettleModal() {
    const modal = document.getElementById('settle-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    const st = reviewOfficeStats.get(reviewSettleOffice) || { c: 0, m: 0, paid: 0 };
    const send = st.c - st.m, paid = st.paid || 0, rem = send - paid;
    const box = (label, val, cls) => `<div class="bg-slate-50 border border-slate-100 rounded-xl p-2">
        <div class="text-[11px] text-slate-500">${label}</div><div class="text-sm font-bold ${cls}">${rvFmt(val)}</div></div>`;
    document.getElementById('settle-summary').innerHTML =
        box('المطلوب سداده', send, 'text-blue-700') +
        box('المحوّل', paid, 'text-emerald-700') +
        box('المديونية', rem, rem > 0 ? 'text-amber-600' : (rem < 0 ? 'text-rose-600' : 'text-emerald-700'));

    const list = rvSettlementsOf(reviewSettleOffice);
    document.getElementById('settle-history').innerHTML = list.length
        ? list.map(s => `
            <div class="flex items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <div class="min-w-0">
                    <span class="font-bold text-slate-800">${rvFmt(rvNum(s.amount))} جم</span>
                    <span class="text-slate-500 mr-2">${rvEsc(s.day)}</span>
                    ${s.type ? `<span class="mr-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${rvEsc(s.type)}</span>` : ''}
                    ${s.note ? `<span class="text-slate-400 mr-2 truncate">${rvEsc(s.note)}</span>` : ''}
                </div>
                <button type="button" onclick="deleteSettlement('${s.id}')" title="حذف"
                    class="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"><i class="fa-solid fa-trash"></i></button>
            </div>`).join('')
        : `<div class="text-xs text-slate-400 text-center py-2">لا توجد تسويات في هذه الفترة</div>`;
}

async function saveSettlement() {
    if (!window.db) return;
    const err = document.getElementById('settle-error');
    const amount = Number(document.getElementById('settle-amount').value);
    const day = document.getElementById('settle-date').value;
    const note = document.getElementById('settle-note').value.trim();
    const type = document.getElementById('settle-type').value;

    if (!(amount > 0)) { err.textContent = 'اكتب مبلغ أكبر من صفر'; err.classList.remove('hidden'); return; }
    if (!day) { err.textContent = 'اختار تاريخ التحويل'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');

    const btn = document.getElementById('settle-save');
    btn.disabled = true; btn.textContent = 'جاري الحفظ...';
    try {
        await window.db.collection('office_settlements').add({
            officeName: reviewSettleOffice,
            amount, day, note, type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // لو التاريخ برا الفترة المعروضة، نبلغه عشان ما يحسبش إن التسوية اختفت
        if (!rvInRange(day, rvRange())) {
            alert('اتسجلت التسوية، لكن تاريخها برا الفترة المعروضة حالياً فمش هتظهر في الأرقام دي.');
        }
        closeSettleModal();
    } catch (e) {
        console.error('خطأ أثناء حفظ التسوية:', e);
        err.textContent = 'حدث خطأ أثناء الحفظ، حاول مرة أخرى.'; err.classList.remove('hidden');
        btn.disabled = false; btn.textContent = 'حفظ التسوية';
    }
}

async function deleteSettlement(id) {
    if (!window.db || !confirm('حذف هذه التسوية؟')) return;
    try { await window.db.collection('office_settlements').doc(id).delete(); }
    catch (e) { console.error('خطأ أثناء حذف التسوية:', e); alert('تعذر الحذف.'); }
}



// ==========================================================
// لوحة التحويلات + مراجعة مكتب واحد (النص التاني من الشاشة)
// ==========================================================
function reviewSelectOffice(name) {
    reviewSelectedOffice = (name && name !== reviewSelectedOffice) ? name : '';
    reviewRender();
}

function rvTs(s) {
    const t = s.createdAt;
    return t && t.toDate ? t.toDate().getTime() : Date.now();   // لسه بيتحفظ = أحدث واحد
}

function reviewRenderDetail(offices, range) {
    if (!document.getElementById('review-extra-slot')) return;
    const sel = reviewSelectedOffice;

    rvSet('review-detail-title', sel ? `سجل التحويلات — ${sel}` : 'سجل التحويلات');
    document.getElementById('review-detail-clear')?.classList.toggle('hidden', !sel);

    const chip = document.getElementById('review-orders-filter');
    if (chip) {
        chip.classList.toggle('hidden', !sel);
        chip.classList.toggle('inline-flex', !!sel);
        chip.innerHTML = sel
            ? `<span>المكتب: ${rvEsc(sel)}</span><button type="button" onclick="reviewSelectOffice('')" class="hover:text-rose-600">✕</button>`
            : '';
    }

    // تحويلات الفترة بالترتيب الزمني، ونحسب المتبقي بعد كل تحويل لكل مكتب
    // المتبقي = (التحصيل - العمولة) في الفترة - مجموع التحويلات لحد التحويل ده
    const chrono = reviewSettlements
        .filter(s => rvSettlementInRange(s, range))
        .sort((a, b) => String(a.day).localeCompare(String(b.day)) || rvTs(a) - rvTs(b));
    const paidSoFar = new Map();
    const remAfter = new Map();
    chrono.forEach(s => {
        const k = String(s.officeName || 'بدون مكتب');
        const st = offices.get(k) || { c: 0, m: 0 };
        const sofar = (paidSoFar.get(k) || 0) + rvNum(s.amount);
        paidSoFar.set(k, sofar);
        remAfter.set(s.id, (st.c - st.m) - sofar);
    });
    const list = chrono.filter(s => !sel || String(s.officeName || 'بدون مكتب') === sel).reverse();

    document.getElementById('review-transfers-office-th')?.classList.toggle('hidden', !!sel);
    const body = document.getElementById('review-transfers-body');
    if (body) {
        body.innerHTML = list.length
            ? list.map(s => {
                const dayLabel = new Date(s.day + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
                const ts = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : null;
                const time = ts ? ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
                const rem = remAfter.get(s.id) ?? 0;
                const remCls = rem > 0 ? 'text-amber-600' : (rem < 0 ? 'text-rose-600' : 'text-emerald-600');
                return `
                <tr class="border-b border-slate-50">
                    <td class="py-1.5 px-2">${rvEsc(dayLabel)}${time ? `<span class="text-slate-400 mr-1.5">${rvEsc(time)}</span>` : ''}</td>
                    ${sel ? '' : `<td class="py-1.5 px-2 font-semibold">${rvEsc(s.officeName || 'بدون مكتب')}</td>`}
                    <td class="py-1.5 px-2 text-center">${s.type
                        ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${rvEsc(s.type)}</span>`
                        : '<span class="text-slate-300">—</span>'}</td>
                    <td class="py-1.5 px-2 text-center font-bold text-emerald-700">${rvFmt(rvNum(s.amount))}</td>
                    <td class="py-1.5 px-2 text-center font-bold ${remCls}">${rvFmt(rem)}</td>
                    <td class="py-1.5 px-2 text-slate-500">${rvEsc(s.note || '')}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="${sel ? 5 : 6}" class="py-4 text-center text-slate-400">لا توجد تحويلات في هذه الفترة</td></tr>`;
    }
    const total = list.reduce((sum, s) => sum + rvNum(s.amount), 0);
    rvSet('review-transfers-total', list.length ? `${rvFmt(list.length)} تحويل · إجمالي ${rvFmt(total)} جم` : '');
}

// ==========================================================
// تفعيل التاب 7 حتى لو tabs.js مش عارفها
// ==========================================================
function reviewPatchTabs() {
    const orig = window.switchMainTab;
    window.switchMainTab = function (n) {
        const p7 = document.getElementById('main-panel-7');
        const t7 = document.getElementById('topbar-panel-7');
        const indicator = document.getElementById('tab-indicator');

        if (n !== 7) {
            if (p7) { p7.classList.add('hidden'); p7.classList.remove('flex'); }
            if (t7) t7.classList.add('hidden');
            if (indicator) { indicator.style.left = ''; indicator.style.right = ''; indicator.style.width = ''; indicator.style.transform = ''; }
            const b7 = document.getElementById('main-btn-7');
            if (b7) { b7.classList.remove('text-white'); b7.classList.add('text-slate-600'); }
            if (typeof orig === 'function') orig(n);
            return;
        }

        if (typeof orig === 'function') { try { orig(7); } catch (e) { console.warn('tabs.js مش بيدعم 7:', e); } }

        document.querySelectorAll('[id^="main-panel-"]').forEach(el => { if (el !== p7) el.classList.add('hidden'); });
        document.querySelectorAll('.topbar-panel').forEach(el => { if (el !== t7) el.classList.add('hidden'); });
        if (p7) { p7.classList.remove('hidden'); p7.classList.add('flex'); p7.style.opacity = '1'; p7.style.transform = 'none'; }
        if (t7) t7.classList.remove('hidden');

        document.querySelectorAll('.main-tab-btn').forEach(b => {
            const on = b.id === 'main-btn-7';
            b.classList.toggle('text-white', on);
            b.classList.toggle('text-slate-600', !on);
        });
        const btn = document.getElementById('main-btn-7');
        const nav = indicator?.parentElement;
        if (btn && indicator && nav) {
            const nr = nav.getBoundingClientRect(), br = btn.getBoundingClientRect();
            indicator.style.right = 'auto';
            indicator.style.transform = 'none';
            indicator.style.left = (br.left - nr.left + nav.scrollLeft) + 'px';
            indicator.style.width = br.width + 'px';
        }
        reviewRender();
    };
}

document.addEventListener('DOMContentLoaded', () => {
    reviewPatchTabs();
    const wait = setInterval(() => {
        const from = document.getElementById('review-from');
        if (window.db && from) {
            clearInterval(wait);
            const r = rvPresetRange('month');
            reviewSetRange(r.from, r.to);
            document.getElementById('review-search')?.addEventListener('input', reviewRender);
            reviewListenOffices();
            reviewListenSettlements();
            reviewListenStatuses();
            reviewListen();
        }
    }, 100);
});
