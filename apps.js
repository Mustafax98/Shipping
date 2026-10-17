/* =====================================================================
   apps.js — تاب "التطبيقات": تطبيق المتابعه + تطبيق المندوب
   ===================================================================== */
(function () {
    'use strict';

    // كل أعمدة الجدول (تفاصيل الكارت) + عنصري التعديل
    const FIELD_DEFS = [
        { key: 'orderId', label: 'ID', row: true },
        { key: 'customerName', label: 'العميل', row: true },
        { key: 'phone', label: 'رقم الهاتف', row: true },
        { key: 'altPhone', label: 'رقم اخر', row: true },
        { key: 'returns', label: 'مرتجع', row: true },
        { key: 'status', label: 'الحاله', row: true },
        { key: 'total', label: 'الاجمالي', row: true },
        { key: 'collected', label: 'التحصيل', row: true },
        { key: 'quantity', label: 'العدد', row: true },
        { key: 'closingNote', label: 'م التقفيل', row: true },
        { key: 'recycling', label: 'تدوير', row: true },
        { key: 'employee', label: 'المتابعه', row: true },
        { key: 'employeeNote', label: 'م المتابعه', row: true },
        { key: 'officeName', label: 'المكتب', row: true },
        { key: 'companyName', label: 'الشركه', row: true },
        { key: 'officeNote', label: 'م المكتب', row: true },
        { key: 'area', label: 'المنطقه', row: true },
        { key: 'rider', label: 'المندوب', row: true },
        { key: 'riderNote', label: 'م المندوب', row: true },
        { key: 'address', label: 'العنوان', row: true },
        { key: 'extraNumber', label: 'الرقم', row: true }
    ];

    // عناصر عنوان الكارت المطوي
    const HEADER_DEFS = FIELD_DEFS.map((f) => ({ key: f.key, label: f.label }));
    const HEADER_DEFAULT = ['orderId', 'officeName', 'area', 'status'];

    window.APPS_FIELD_DEFS = FIELD_DEFS;
    window.APPS_HEADER_DEFS = HEADER_DEFS;
    window.APPS_HEADER_DEFAULT = HEADER_DEFAULT;
    // أنواع الحقول القابلة للتعديل (أي حقل مش مكتوب هنا يتعامل كنص)
    const EDIT_TYPES = {
        status: 'select',
        total: 'number', collected: 'number', quantity: 'number', extraNumber: 'number'
    };
    // كل الحقول ما عدا ID تقدر تتفتح للتعديل
    const EDIT_DEFS = FIELD_DEFS
        .filter((f) => f.row && f.key !== 'orderId')
        .map((f) => ({ key: f.key, label: f.label, type: EDIT_TYPES[f.key] || 'text' }));

    // الافتراضي لكل تطبيق: الحاله + ملاحظة التطبيق نفسه
    const EDIT_DEFAULT = {
        follow: ['status', 'employeeNote'],
        courier: ['status', 'riderNote']
    };
    window.APPS_EDIT_DEFS = EDIT_DEFS;
    window.APPS_EDIT_DEFAULT = EDIT_DEFAULT;


    // الحقول اللي ممكن تتفتح للتعديل (note = ملاحظة المتابع/المندوب حسب التطبيق)

    const APPS = {
        follow: { label: 'المتابعه', icon: 'fa-headset', who: 'employee', note: 'employeeNote', whoLabel: 'المتابع', noteLabel: 'م المتابعه' },
        courier: { label: 'المندوب', icon: 'fa-motorcycle', who: 'rider', note: 'riderNote', whoLabel: 'المندوب', noteLabel: 'م المندوب' }
    };
    const PAGE_SIZE = 50;

    const state = {
        orders: [], statuses: [], fields: {},
        active: 'follow', search: '', person: '',
        limit: PAGE_SIZE, open: new Set(), drafts: {}
    };

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // لو أسماء الحقول في Firestore مختلفة، ضيفها هنا (المفتاح = الاسم اللي الكود بيستخدمه)
    const ALIASES = {
        officeName: ['officeName', 'office', 'officeTitle', 'المكتب'],
        customerName: ['customerName', 'customer', 'clientName', 'name'],
        area: ['area', 'zone', 'region', 'المنطقة'],
        companyName: ['companyName', 'company', 'الشركة'],
        phone: ['phone', 'mobile', 'phoneNumber'],
        address: ['address', 'العنوان'],
        employee: ['employee', 'follower', 'followUp'],
        rider: ['rider', 'courier', 'driver']
    };
    const val = (o, k) => {
        for (const a of (ALIASES[k] || [k])) {
            if (o[a] != null && String(o[a]).trim() !== '') return String(o[a]);
        }
        return '';
    };
    const has = (o, k) => val(o, k).trim() !== '';

    const fieldOn = (f) => {
        const list = state.fields[state.active];
        return !Array.isArray(list) || list.includes(f);
    };
    const headerOn = (f) => {
        const list = state.fields[state.active + 'Header'];
        return Array.isArray(list) ? list.includes(f) : HEADER_DEFAULT.includes(f);
    };
    const editOn = (f) => {
        const list = state.fields[state.active + 'Edit'];
        return Array.isArray(list) ? list.includes(f) : (EDIT_DEFAULT[state.active] || []).includes(f);
    };

    // ترتيب الحقول حسب إعدادات التطبيق (اللي مش متحدد ترتيبه يروح في الآخر بترتيبه الأصلي)
    const sortByOrder = (defs, app = state.active) => {
        const ord = state.fields[app + 'Order'];
        if (!Array.isArray(ord)) return defs;
        const idx = (k) => { const i = ord.indexOf(k); return i === -1 ? 9999 : i; };
        return defs
            .map((d, i) => ({ d, i }))
            .sort((a, b) => (idx(a.d.key) - idx(b.d.key)) || (a.i - b.i))
            .map((x) => x.d);
    };


    function badgeClass(s) {
        s = String(s || '');
        if (/تدوير/.test(s)) return 'bg-amber-50 text-amber-700 border-amber-200';
        if (/رفض|مرتجع|الغاء|إلغاء/.test(s)) return 'bg-rose-50 text-rose-700 border-rose-200';
        if (/مكتمل|استلم|تسليم|تم/.test(s)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (/جزئي/.test(s)) return 'bg-orange-50 text-orange-700 border-orange-200';
        if (/استبدال/.test(s)) return 'bg-purple-50 text-purple-700 border-purple-200';
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }

    function toast(msg, ok) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg ' + (ok === false ? 'bg-rose-600' : 'bg-slate-800');
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
    }

    /* ---------- الفلترة ---------- */
    const appOrders = (key) => state.orders.filter((o) => has(o, APPS[key].who));

    function peopleFor(key) {
        const set = new Set(appOrders(key).map((o) => val(o, APPS[key].who).trim()));
        return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
    }

    function visibleOrders() {
        const app = APPS[state.active];
        const q = state.search.trim().toLowerCase();
        const list = appOrders(state.active).filter((o) => {
            if (state.person && val(o, app.who).trim() !== state.person) return false;
            if (!q) return true;
            const hay = ['orderId', 'customerName', 'phone', 'altPhone', 'officeName', 'companyName', 'area', 'address', 'status', app.who]
                .map((k) => val(o, k)).join(' ').toLowerCase();
            return hay.includes(q);
        });

        if (state.active === 'courier') {
            const num = (o) => { const n = parseFloat(val(o, 'extraNumber')); return isNaN(n) ? null : n; };
            list.sort((a, b) => {
                const r = state.person ? 0 : val(a, 'rider').trim().localeCompare(val(b, 'rider').trim(), 'ar');
                if (r) return r;
                const x = num(a), y = num(b);
                if (x === null && y === null) return 0;
                if (x === null) return 1;
                if (y === null) return -1;
                return x - y;
            });
        }
        return list;
    }

    /* ---------- الرسم ---------- */
    const row = (label, html) => `<div class="flex items-start justify-between gap-4 py-1.5">
        <span class="text-slate-500 text-xs shrink-0">${label}</span>
        <span class="text-slate-800 text-xs font-medium text-left break-words min-w-0">${html || ''}</span></div>`;

    function cardHtml(o) {
        const id = o._id, isOpen = state.open.has(id), d = state.drafts[id] || {};
        const cur = (k) => d[k] !== undefined ? d[k] : val(o, k);
        const status = cur('status');

        const opts = state.statuses.slice();
        if (status && !opts.includes(status)) opts.unshift(status);

        const tel = (p) => p ? `<a href="tel:${esc(p)}" class="text-blue-600" dir="ltr">${esc(p)}</a>` : '';
        const cellVal = (k) => {
            if (k === 'phone' || k === 'altPhone') return tel(val(o, k));
            if (k === 'status') return esc(status);
            if (k === 'orderId') return esc(val(o, 'orderId') || id);
            return esc(val(o, k));
        };

        const cls = 'flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500';
        const editRow = (f) => {
            const type = EDIT_TYPES[f.key] || 'text';
            const v = cur(f.key);
            const input = type === 'select'
                ? `<select data-field="${f.key}" data-id="${esc(id)}" class="${cls}">
                   ${opts.map((s) => `<option value="${esc(s)}" ${s === v ? 'selected' : ''}>${esc(s)}</option>`).join('')}
               </select>`
                : `<input type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'inputmode="decimal"' : ''}
                   data-field="${f.key}" data-id="${esc(id)}" value="${esc(v)}" class="${cls}">`;
            return `<div class="flex items-center gap-3 py-1.5">
                    <label class="text-xs text-emerald-700 font-semibold w-24 shrink-0">${f.label} ✎</label>${input}
                </div>`;
        };

        // العرض والتعديل مستقلين: الحقل يظهر لو متفعّل للعرض أو للتعديل
        const rowsHtml = sortByOrder(FIELD_DEFS)
            .filter((f) => f.row && (fieldOn(f.key) || editOn(f.key)))
            .map((f) => {
                if (editOn(f.key)) return editRow(f);
                if (f.key === 'altPhone' && !has(o, 'altPhone')) return '';
                return row(f.label, cellVal(f.key));
            })
            .join('');

        const canEdit = EDIT_DEFS.some((f) => editOn(f.key));

        const headHtml = sortByOrder(HEADER_DEFS)
            .filter((h) => headerOn(h.key) && h.key !== 'extraNumber')
            .map((h) => {
                if (h.key === 'status') {
                    return status ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass(status)}">${esc(status)}</span>` : '';
                }
                if (h.key === 'orderId') {
                    return `<span class="font-bold text-sm text-slate-800" dir="ltr">${esc(val(o, 'orderId') || id)}</span>`;
                }
                const v = val(o, h.key);
                if (!v) return `<span class="text-[11px] text-slate-300">${h.label}: —</span>`;
                if (h.key === 'phone') return `<span class="text-[11px] text-slate-500" dir="ltr">${esc(v)}</span>`;
                return `<span class="text-[11px] text-slate-500">${esc(v)}</span>`;
            })
            .join('');

        const seq = state.active === 'courier' && has(o, 'extraNumber')
            ? `<span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">${esc(val(o, 'extraNumber'))}</span>` : '';

        return `
    <div class="bg-white rounded-xl border ${isOpen ? 'border-slate-800' : 'border-slate-100'} shadow-sm overflow-hidden">
        <button type="button" data-act="toggle" data-id="${esc(id)}" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-right">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">${seq}${headHtml || '<span class="text-xs text-slate-400">—</span>'}</div>
            <i class="fa-solid fa-chevron-down text-slate-400 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}"></i>
        </button>
        <div class="${isOpen ? '' : 'hidden'} px-4 pb-4 border-t border-slate-100">
            <div class="divide-y divide-slate-50 pt-2">${rowsHtml}</div>
            <div class="grid ${canEdit ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-3">
                ${canEdit ? `<button type="button" data-act="save" data-id="${esc(id)}" class="py-2.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition">حفظ التعديلات</button>` : ''}
                <button type="button" data-act="copy" data-id="${esc(id)}" class="py-2.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5"><i class="fa-regular fa-copy"></i> نسخ الطلب</button>
            </div>
        </div>
    </div>`;
    }
    function render(force) {
        const root = document.getElementById('main-panel-6');
        if (!root) return;
        const ae = document.activeElement;
        if (!force && ae && root.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;

        const list = visibleOrders();
        const shown = list.slice(0, state.limit);
        const people = peopleFor(state.active);
        if (state.person && !people.includes(state.person)) state.person = '';

        const tabBtn = (key) => {
            const on = key === state.active, a = APPS[key];
            return `<button type="button" data-act="app" data-app="${key}" class="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${on ? 'bg-emerald-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-emerald-50'}">
                <i class="fa-solid ${a.icon}"></i><span>${a.label}</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full ${on ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}">${appOrders(key).length}</span></button>`;
        };

        root.innerHTML = `
        <div class="max-w-3xl w-full mx-auto p-2 space-y-3" dir="rtl">
            <div class="flex items-center gap-2">${tabBtn('follow')}${tabBtn('courier')}</div>
            <div class="flex items-center gap-2">
                <select id="apps-person" class="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 min-w-[140px]">
                    <option value="">كل ${state.active === 'follow' ? 'المتابعين' : 'المناديب'}</option>
                    ${people.map((p) => `<option value="${esc(p)}" ${p === state.person ? 'selected' : ''}>${esc(p)}</option>`).join('')}
                </select>
                <div class="relative flex-1">
                    <span class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400"><i class="fa-solid fa-magnifying-glass text-xs"></i></span>
                    <input type="text" id="apps-search" value="${esc(state.search)}" placeholder="ابحث بالكود، العميل، الموبايل، المكتب..."
                        class="w-full pr-9 pl-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                </div>
            </div>
            <div class="flex items-center justify-between">
                <div class="text-[11px] text-slate-400">${list.length} طلب</div>
                ${state.active === 'courier' && state.person
                ? '<button type="button" data-act="renumber" class="px-3 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-white hover:bg-slate-700">إعادة ترقيم 1، 2، 3...</button>'
                : ''}
            </div>
            <div class="space-y-2">
                ${shown.length ? shown.map(cardHtml).join('') : '<div class="bg-white rounded-xl border border-slate-100 p-8 text-center text-xs text-slate-400">لا توجد طلبات</div>'}
            </div>
            ${list.length > shown.length ? `<button type="button" data-act="more" class="w-full py-2.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">عرض المزيد (${list.length - shown.length})</button>` : ''}
        </div>`;

        if (ae && ae.id === 'apps-search') {
            const s = document.getElementById('apps-search');
            if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
        }
    }

    /* ---------- الأحداث ---------- */
    const find = (id) => state.orders.find((o) => o._id === id);

    async function saveOrder(id) {
        const d = state.drafts[id];
        if (!d || !Object.keys(d).length) return toast('لا توجد تعديلات');
        const patch = {};
        Object.keys(d).forEach((k) => {
            if (!editOn(k)) return;
            const v = d[k];
            patch[k] = EDIT_TYPES[k] === 'number'
                ? (String(v).trim() === '' ? '' : Number(v))
                : v;
        });
        if (!Object.keys(patch).length) return toast('لا توجد تعديلات');
        patch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

        try {
            const batch = window.db.batch();
            const col = window.db.collection('orders');
            batch.update(col.doc(id), patch);

            // منع تكرار الرقم عند نفس المندوب: ازاحة الباقي لأعلى
            const o = find(id);
            const newNum = patch.extraNumber;
            if (o && typeof newNum === 'number' && !isNaN(newNum) && newNum >= 1) {
                const rider = val(o, 'rider').trim();
                const others = state.orders
                    .filter((x) => x._id !== id && val(x, 'rider').trim() === rider)
                    .map((x) => ({ x, n: parseFloat(val(x, 'extraNumber')) }))
                    .filter((e) => !isNaN(e.n))
                    .sort((a, b) => a.n - b.n);

                let taken = newNum;
                for (const e of others) {
                    if (e.n < newNum) continue;
                    if (e.n === taken) {
                        taken = e.n + 1;
                        batch.update(col.doc(e.x._id), { extraNumber: taken });
                    } else if (e.n > taken) break;
                }
            }

            await batch.commit();
            delete state.drafts[id];
            toast('تم الحفظ ✅');
        } catch (e) { console.error(e); toast('فشل الحفظ', false); }
    }

    async function renumberRider() {
        if (!state.person) return toast('اختار مندوب الأول', false);
        const list = state.orders
            .filter((o) => val(o, 'rider').trim() === state.person)
            .map((o) => ({ o, n: parseFloat(val(o, 'extraNumber')) }))
            .sort((a, b) => {
                if (isNaN(a.n) && isNaN(b.n)) return 0;
                if (isNaN(a.n)) return 1;
                if (isNaN(b.n)) return -1;
                return a.n - b.n;
            });
        if (!list.length) return;
        try {
            for (let i = 0; i < list.length; i += 400) {
                const batch = window.db.batch();
                list.slice(i, i + 400).forEach((e, j) =>
                    batch.update(window.db.collection('orders').doc(e.o._id), { extraNumber: i + j + 1 }));
                await batch.commit();
            }
            toast('تمت إعادة الترقيم ✅');
        } catch (e) { console.error(e); toast('فشلت إعادة الترقيم', false); }
    }



    function copyOrder(id) {
        const o = find(id); if (!o) return;

        const d = state.drafts[id] || {};
        const cur = (k) => d[k] !== undefined ? String(d[k]) : val(o, k);

        // نفس شروط وترتيب الكارت بالظبط، والحقول الفاضية بتتنسخ كمان
        const text = sortByOrder(FIELD_DEFS)
            .filter((f) => f.row && (fieldOn(f.key) || editOn(f.key)))
            .map((f) => {
                const v = f.key === 'orderId' ? (val(o, 'orderId') || id) : cur(f.key);
                return `${f.label}: ${String(v).trim() === '' ? '—' : v}`;
            })
            .join('\n');

        const fb = () => {
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); toast('تم نسخ الطلب'); } catch (_) { toast('تعذر النسخ', false); } ta.remove();
        };
        navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(text).then(() => toast('تم نسخ الطلب'), fb) : fb();
    }

    function bind() {
        const root = document.getElementById('main-panel-6');
        if (!root || root.dataset.bound) return;
        root.dataset.bound = '1';
        root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const act = b.dataset.act, id = b.dataset.id;
            if (act === 'app') { state.active = b.dataset.app; state.person = ''; state.limit = PAGE_SIZE; render(true); }
            else if (act === 'toggle') { state.open.has(id) ? state.open.delete(id) : state.open.add(id); render(true); }
            else if (act === 'more') { state.limit += PAGE_SIZE; render(true); }
            else if (act === 'save') saveOrder(id);
            else if (act === 'copy') copyOrder(id);
            else if (act === 'renumber') renumberRider();
        });
        root.addEventListener('input', (e) => {
            const t = e.target;
            if (t.id === 'apps-search') { state.search = t.value; state.limit = PAGE_SIZE; render(true); }
            else if (t.dataset.field) (state.drafts[t.dataset.id] = state.drafts[t.dataset.id] || {})[t.dataset.field] = t.value;
        });
        root.addEventListener('change', (e) => {
            const t = e.target;
            if (t.id === 'apps-person') { state.person = t.value; state.limit = PAGE_SIZE; render(true); }
            else if (t.dataset.field) (state.drafts[t.dataset.id] = state.drafts[t.dataset.id] || {})[t.dataset.field] = t.value;
        });
    }

    /* ---------- Firestore ---------- */
    function start() {
        bind(); render(true);

        window.db.collection('orders').onSnapshot((snap) => {
            // نفس جدول الطلبات: الأوردرات المفتوحة فقط (اللي متقفلتش)
            state.orders = snap.docs
                .filter((d) => d.data().closed !== true)
                .map((d) => Object.assign({ _id: d.id }, d.data()))
                .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
            render(false);
        }, (err) => console.error('apps.js orders:', err));

        window.db.collection('statuses').onSnapshot((snap) => {
            state.statuses = snap.docs.map((d) => { const x = d.data(); return x.name || x.title || x.label || x.status || d.id; }).filter(Boolean);
            render(false);
        }, (err) => console.error('apps.js statuses:', err));

        window.db.collection('settings').doc('appsFields').onSnapshot((doc) => {
            state.fields = doc.exists ? doc.data() : {};
            render(true);
        }, (err) => console.error('apps.js fields:', err));
    }

    function waitDb(n) {
        if (window.db) return start();
        if (n > 100) return console.error('apps.js: window.db غير متاح');
        setTimeout(() => waitDb(n + 1), 100);
    }
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => waitDb(0)) : waitDb(0);
})();