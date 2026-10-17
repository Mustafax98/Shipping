/* ==========================================
   إدارة المناديب (Couriers) - تاب الإعدادات > المناديب
   - كوليكشن: couriers  |  سجل كل مندوب: couriers/{id}/history
   - الإضافة والتعديل من نافذة (زي المكاتب) بزرار "حفظ"
   - يعتمد على دوال settings.js: normalizeZoneName, compareArabicNames,
     cleanZoneName, escapeZoneHtml
   - ضيف في index.html بعد settings.js:  <script src="/couriers.js"></script>
   ========================================== */

const COURIERS_CFG = {
    collection: 'couriers',
    ordersCollection: 'orders',

    // أسماء الحقول داخل الأوردر (عدّلها لو مختلفة عندك)
    // الحقول اللي ممكن يتخزن فيها المندوب داخل الأوردر (القيمة ممكن تكون اسم أو id).
    // لو عارف الاسم الحقيقي للحقل حطه هنا في الأول. أي حقل اسمه فيه
    // courier / driver / deleg / agent / مندوب بيتجرب تلقائياً كمان.
    orderCourierFields: ['rider', 'courier', 'courierName', 'courierId', 'driver', 'driverName', 'delegate', 'agent', 'representative', 'مندوب'],
    orderCourierNameField: 'courier',      // احتياطي لو مفيش حقل اتكتشف

    ledgerCollection: 'courierLedger',     // سجل العهدة والمديونية
    orderStatusField: 'status',

    // الحالات اللي تتحسب تسليم ناجح / مرتجع
    deliveredStatuses: ['تم التسليم', 'استلام', 'استلامات', 'تم الاستلام', 'مسلم'],
    returnedStatuses: ['مرتجع'],

    // الحالات اللي مبلغ أوردراتها بيتحسب "مبلغ مطلوب" من المندوب
    requiredStatuses: ['استلام', 'استلامات', 'تم الاستلام', 'رفض دفع', 'جزئي', 'استبدال'],

    // الحالات اللي بتتحسب في "نسبة الوصول" (الأوردر وصل للعميل: استلام / جزئي / استبدال / رفض / مرتجع)
    reachStatuses: ['استلام', 'استلامات', 'تم الاستلام', 'جزئي', 'استبدال', 'رفض رفض', 'رفض دفع', 'مرتجع'],

    historyLimit: 100
};

let couriersData = [];
let courierOrdersIndex = {};     // { 'id:xxx' | 'name:xxx': [orders] }
let courierHistoryUnsub = null;
let courierHistoryView = { id: '', tab: 'orders', search: '' };

// ---------- أدوات مساعدة ----------
function courierNormPhone(s) {
    return String(s ?? '').replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660)
        .replace(/\D/g, '');
}

function courierOrderTime(o) {
    const t = o.createdAt || o.addedAt || o.timestamp || o.date;
    if (!t) return null;
    if (typeof t.toDate === 'function') return t.toDate();
    const d = new Date(t);
    return isNaN(d) ? null : d;
}

function courierFmtDate(d) {
    if (!d) return '—';
    return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function courierNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function courierOrderField(o) {
    return {
        code: o.code ?? o.orderCode ?? o.orderId ?? o.id ?? '',
        customer: o.customer ?? o.clientName ?? o.customerName ?? o.name ?? '',
        phone: o.phone ?? o.customerPhone ?? '',
        status: o[COURIERS_CFG.orderStatusField] ?? '',
        total: courierNum(o.total ?? o.totalPrice ?? o.price ?? o.amount),
        collected: courierNum(o.collected ?? o.collection ?? o.collectedAmount),
        area: o.area ?? o.zone ?? '',
        office: o.officeName ?? o.office ?? ''
    };
}

let courierDetectedField = '';   // الحقل اللي اتكتشف إنه فيه اسم المندوب

function isCourierFieldKey(k) {
    if (/note/i.test(k)) return false;   // riderNote وغيره مش حقل مندوب
    return COURIERS_CFG.orderCourierFields.includes(k) || /rider|courier|driver|deleg|agent|مندوب/i.test(k);
}

function buildCourierOrdersIndex(snapshot) {
    const idx = {};
    const fieldCounts = {};
    const push = (k, o) => { (idx[k] = idx[k] || []).push(o); };

    snapshot.forEach(doc => {
        const data = doc.data();
        const o = { _id: doc.id, ...data };
        Object.keys(data).forEach(k => {
            if (!isCourierFieldKey(k)) return;
            const v = String(data[k] ?? '').trim();
            if (!v || /^[\d.\-\s]+$/.test(v)) return;   // تجاهل الأرقام (عمولات وغيره)
            fieldCounts[k] = (fieldCounts[k] || 0) + 1;
            push('id:' + v, o);
            push('name:' + normalizeZoneName(v), o);
        });
    });

    courierOrdersIndex = idx;
    courierDetectedField = Object.keys(fieldCounts).sort((a, b) => fieldCounts[b] - fieldCounts[a])[0] || '';
    if (courierDetectedField) console.info('حقل المندوب في الأوردرات:', courierDetectedField, fieldCounts);
}

function getCourierOrders(c) {
    const a = courierOrdersIndex['id:' + c.id] || [];
    const b = courierOrdersIndex['name:' + normalizeZoneName(c.name)] || [];
    const seen = new Set();
    return [...a, ...b].filter(o => (seen.has(o._id) ? false : (seen.add(o._id), true)));
}

function computeCourierStats(c) {
    const orders = getCourierOrders(c);
    const now = new Date();
    let monthly = 0, delivered = 0, returns = 0, collections = 0, requiredTotal = 0;
    const reqSet = new Set(COURIERS_CFG.requiredStatuses.map(normalizeZoneName));
    const reachSet = new Set(COURIERS_CFG.reachStatuses.map(normalizeZoneName));
    let reachCount = 0;
    orders.forEach(o => {
        const f = courierOrderField(o);
        const t = courierOrderTime(o);
        if (reqSet.has(normalizeZoneName(f.status))) requiredTotal += f.collected;
        if (reachSet.has(normalizeZoneName(f.status))) reachCount++;
        if (t && t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear()) monthly++;
        if (COURIERS_CFG.deliveredStatuses.includes(f.status)) { delivered++; collections += f.collected; }
        if (COURIERS_CFG.returnedStatuses.includes(f.status)) returns++;
    });
    const total = orders.length;
    const commission = c.commission || 0;
    return {
        monthly, total, delivered, returns, collections, requiredTotal, reachCount,
        reachRate: orders.length > 0 ? Math.round((reachCount / orders.length) * 100) : 0,
        commission,
        totalCommission: delivered * commission,
        rate: total > 0 ? Math.round((delivered / total) * 100) : 0
    };
}

// ---------- السجل (History) ----------
async function logCourierHistory(courierId, action, details = '') {
    if (!window.db || !courierId) return;
    try {
        await window.db.collection(COURIERS_CFG.collection).doc(courierId)
            .collection('history').add({
                action,
                details,
                at: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch (err) {
        console.error('خطأ تسجيل سجل المندوب:', err);
    }
}

const COURIER_FIELD_LABELS = {
    name: 'الاسم', phone: 'رقم الهاتف', phone2: 'رقم آخر', commission: 'العمولة',
    nationalId: 'رقم البطاقة', bikeModel: 'نوع الموتوسيكل', bikePlate: 'رقم اللوحة',
    licenseNumber: 'رقم الرخصة', licenseExpiry: 'انتهاء الرخصة', address: 'العنوان'
};

// ---------- النافذة (بتتبني تلقائياً) ----------
function ensureCourierModal() {
    if (document.getElementById('courier-modal')) return;

    const inputCls = 'w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500';
    const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
    <div id="courier-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[10000] p-4" dir="rtl">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
            <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h4 id="courier-modal-title" class="text-base font-bold text-slate-800">إضافة مندوب جديد</h4>
                <button type="button" onclick="closeCourierModal()"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>
            <form id="courier-modal-form" onsubmit="handleCourierSubmit(event)" class="p-6 space-y-3 overflow-y-auto" autocomplete="off">
                <input type="hidden" id="courier-modal-id">

                <div>
                    <label class="${labelCls}">اسم المندوب</label>
                    <input type="text" id="courier-modal-name" required placeholder="مثال: أحمد محمد"
                        oninput="clearCourierModalError()" class="${inputCls}">
                </div>

                <div>
                    <label class="${labelCls}">رقم الهاتف</label>
                    <div class="flex items-center gap-2">
                        <input type="tel" id="courier-modal-phone" required placeholder="01xxxxxxxxx"
                            oninput="clearCourierModalError()" class="${inputCls}">
                        <button type="button" id="courier-phone2-toggle" onclick="toggleCourierPhone2()"
                            title="إضافة رقم آخر"
                            class="w-9 h-9 flex-shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-colors">+</button>
                    </div>
                    <input type="tel" id="courier-modal-phone2" placeholder="رقم آخر"
                        oninput="clearCourierModalError()" class="${inputCls} mt-2 hidden">
                </div>

                <div>
                    <label class="${labelCls}">عمولة الأوردر (جم)</label>
                    <input type="number" step="0.5" id="courier-modal-commission" placeholder="10" class="${inputCls}">
                </div>

                <div>
                    <label class="${labelCls}">رقم البطاقة (القومي)</label>
                    <input type="text" id="courier-modal-nid" inputmode="numeric" maxlength="14" placeholder="14 رقم"
                        oninput="clearCourierModalError()" class="${inputCls}">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="${labelCls}">نوع الموتوسيكل</label>
                        <input type="text" id="courier-modal-bike-model" placeholder="مثال: هوندا 150" class="${inputCls}">
                    </div>
                    <div>
                        <label class="${labelCls}">رقم اللوحة</label>
                        <input type="text" id="courier-modal-bike-plate" placeholder="مثال: ص ع د 1234" class="${inputCls}">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="${labelCls}">رقم رخصة الموتوسيكل</label>
                        <input type="text" id="courier-modal-license" class="${inputCls}">
                    </div>
                    <div>
                        <label class="${labelCls}">انتهاء الرخصة</label>
                        <input type="date" id="courier-modal-license-exp" class="${inputCls}">
                    </div>
                </div>

                <div>
                    <label class="${labelCls}">عنوان المندوب</label>
                    <textarea id="courier-modal-address" rows="2" class="${inputCls} resize-none"></textarea>
                </div>

                <p id="courier-modal-error" class="hidden text-[11px] font-semibold text-rose-600"></p>

                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button type="button" onclick="closeCourierModal()"
                        class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-colors">إلغاء</button>
                    <button type="submit" id="courier-modal-save"
                        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">حفظ المندوب</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(wrapper.firstElementChild);

    const modal = document.getElementById('courier-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeCourierModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!modal.classList.contains('hidden')) closeCourierModal();
        const h = document.getElementById('courier-history-modal');
        if (h && !h.classList.contains('hidden')) closeCourierHistory();
    });
}

function toggleCourierPhone2(forceShow) {
    const input = document.getElementById('courier-modal-phone2');
    const btn = document.getElementById('courier-phone2-toggle');
    if (!input || !btn) return;
    const show = typeof forceShow === 'boolean' ? forceShow : input.classList.contains('hidden');
    input.classList.toggle('hidden', !show);
    btn.textContent = show ? '−' : '+';
    btn.title = show ? 'إخفاء الرقم الآخر' : 'إضافة رقم آخر';
    if (show) input.focus(); else input.value = '';
}

function showCourierModalError(msg) {
    const el = document.getElementById('courier-modal-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearCourierModalError() {
    document.getElementById('courier-modal-error')?.classList.add('hidden');
}

function openCourierModal(title, c = null) {
    ensureCourierModal();
    const set = (id, v) => { document.getElementById(id).value = v ?? ''; };

    document.getElementById('courier-modal-title').textContent = title;
    set('courier-modal-id', c?.id || '');
    set('courier-modal-name', c?.name);
    set('courier-modal-phone', c?.phone);
    set('courier-modal-phone2', c?.phone2);
    set('courier-modal-commission', c?.commission ?? '');
    set('courier-modal-nid', c?.nationalId);
    set('courier-modal-bike-model', c?.bikeModel);
    set('courier-modal-bike-plate', c?.bikePlate);
    set('courier-modal-license', c?.licenseNumber);
    set('courier-modal-license-exp', c?.licenseExpiry);
    set('courier-modal-address', c?.address);
    toggleCourierPhone2(!!c?.phone2);
    clearCourierModalError();

    const saveBtn = document.getElementById('courier-modal-save');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ المندوب';

    const modal = document.getElementById('courier-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('courier-modal-name').focus(), 50);
}

function openAddCourierModal() { openCourierModal('إضافة مندوب جديد'); }

function openEditCourierModal(id) {
    const c = couriersData.find(x => x.id === id);
    if (c) openCourierModal('تعديل بيانات المندوب', c);
}

function closeCourierModal() {
    const modal = document.getElementById('courier-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// الاسم القديم محفوظ لأن الـ HTML بينادي addNewCourierRow()
function addNewCourierRow() { openAddCourierModal(); }

// ---------- الحفظ (إضافة / تعديل) ----------
async function handleCourierSubmit(e) {
    e.preventDefault();
    if (!window.db) return;

    const val = (id) => document.getElementById(id).value.trim();
    const id = val('courier-modal-id');
    const name = cleanZoneName(val('courier-modal-name'));
    const phone = courierNormPhone(val('courier-modal-phone'));
    const phone2 = courierNormPhone(val('courier-modal-phone2'));
    const nationalId = courierNormPhone(val('courier-modal-nid'));

    if (!name) return showCourierModalError('اكتب اسم المندوب');
    if (phone.length < 10) return showCourierModalError('رقم الهاتف غير صحيح');
    if (phone2 && phone2.length < 10) return showCourierModalError('الرقم الآخر غير صحيح');
    if (nationalId && nationalId.length !== 14) return showCourierModalError('رقم البطاقة لازم يكون 14 رقم');

    const others = couriersData.filter(c => c.id !== id);
    if (others.some(c => normalizeZoneName(c.name) === normalizeZoneName(name)))
        return showCourierModalError(`المندوب "${name}" موجود بالفعل، مينفعش يتكرر`);
    if (others.some(c => courierNormPhone(c.phone) === phone || (phone2 && courierNormPhone(c.phone) === phone2)))
        return showCourierModalError('رقم الهاتف ده مسجل لمندوب آخر');
    if (nationalId && others.some(c => courierNormPhone(c.nationalId) === nationalId))
        return showCourierModalError('رقم البطاقة ده مسجل لمندوب آخر');

    const data = {
        name,
        phone,
        phone2,
        commission: parseFloat(val('courier-modal-commission')) || 0,
        nationalId,
        bikeModel: val('courier-modal-bike-model'),
        bikePlate: val('courier-modal-bike-plate'),
        licenseNumber: val('courier-modal-license'),
        licenseExpiry: val('courier-modal-license-exp'),
        address: val('courier-modal-address')
    };

    const saveBtn = document.getElementById('courier-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    try {
        const col = window.db.collection(COURIERS_CFG.collection);
        if (!id) {
            const ref = await col.add({
                ...data,
                active: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await logCourierHistory(ref.id, 'إضافة', 'تم تسجيل المندوب');
        } else {
            const old = couriersData.find(c => c.id === id) || {};
            await col.doc(id).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const changes = Object.keys(data)
                .filter(k => String(old[k] ?? '') !== String(data[k] ?? ''))
                .map(k => `${COURIER_FIELD_LABELS[k] || k}: ${old[k] || '—'} ← ${data[k] || '—'}`);
            if (changes.length) await logCourierHistory(id, 'تعديل', changes.join(' | '));

            // لو الاسم اتغير نحدّث الأوردرات المرتبطة بالاسم القديم
            if (old.name && old.name !== name) await renameCourierInOrders(old.name, name);
        }
        closeCourierModal();
    } catch (err) {
        console.error('خطأ أثناء حفظ المندوب:', err);
        showCourierModalError('حدث خطأ أثناء الحفظ، حاول مرة أخرى.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ المندوب';
    }
}

async function renameCourierInOrders(oldName, newName) {
    const field = courierDetectedField || COURIERS_CFG.orderCourierNameField;
    const snap = await window.db.collection(COURIERS_CFG.ordersCollection).where(field, '==', oldName).get();
    if (snap.empty) return;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
        const batch = window.db.batch();
        docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { [field]: newName }));
        await batch.commit();
    }
}

// ---------- تغيير الحالة / الحذف ----------
async function toggleCourierStatus(id) {
    const c = couriersData.find(x => x.id === id);
    if (!c || !window.db) return;
    const next = c.active === false;
    try {
        await window.db.collection(COURIERS_CFG.collection).doc(id).update({ active: next });
        await logCourierHistory(id, next ? 'تشغيل' : 'إيقاف', next ? 'تم تفعيل المندوب' : 'تم إيقاف المندوب');
    } catch (err) {
        console.error('خطأ تغيير حالة المندوب:', err);
    }
}

async function deleteCourier(id) {
    const c = couriersData.find(x => x.id === id);
    if (!c || !window.db) return;
    const used = getCourierOrders(c).length;
    const warn = used > 0 ? `\nتنبيه: للمندوب ${used} أوردر مسجل (الأوردرات هتفضل زي ما هي).` : '';
    if (!confirm(`هل أنت تأكد من حذف المندوب "${c.name || ''}" نهائياً؟${warn}`)) return;
    try {
        await window.db.collection(COURIERS_CFG.collection).doc(id).delete();
    } catch (err) {
        console.error('خطأ حذف المندوب:', err);
        alert('حدث خطأ أثناء حذف المندوب.');
    }
}

// ---------- العرض ----------
// عمود "نسبة الوصول": بيتضاف للهيدر تلقائياً (بعد نسبة التسليم) لو مش موجود في الـ HTML
function ensureCouriersReachHeader() {
    const tbody = document.getElementById('couriers-table-body');
    const tr = tbody?.closest('table')?.querySelector('thead tr');
    if (!tr) return;
    const ths = Array.from(tr.children);
    if (ths.some(th => th.textContent.includes('نسبة الوصول'))) return;
    const th = document.createElement('th');
    th.className = 'p-3.5 text-center';
    th.textContent = 'نسبة الوصول';
    const after = ths.find(x => x.textContent.includes('نسبة التسليم'));
    if (after) after.insertAdjacentElement('afterend', th); else tr.appendChild(th);
}

function renderCouriersTable(data = couriersData) {
    ensureCouriersReachHeader();
    const tbody = document.getElementById('couriers-table-body');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-slate-400">لا يوجد مناديب مسجلين حالياً</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(c => {
        const s = computeCourierStats(c);
        const bal = getCourierBalance(c.id);
        const active = c.active !== false;
        const e = escapeZoneHtml;
        return `
        <tr class="hover:bg-slate-50/50 transition-colors ${!active ? 'bg-slate-50/60' : ''}">
            <td class="p-3.5 font-semibold text-slate-800">
                <button type="button" onclick="openCourierHistory('${c.id}')" title="عرض التفاصيل والسجل"
                    class="text-right font-semibold text-slate-800 hover:text-emerald-700 hover:underline transition-colors cursor-pointer">${e(c.name)}</button>
                ${bal.cash > 0 ? `<div class="text-[10px] font-semibold text-rose-600">مبلغ العهدة ${bal.cash.toLocaleString()} جم</div>` : ''}
                ${bal.custody > 0 ? `<div class="text-[10px] font-semibold text-amber-600">عهدة ${bal.custody.toLocaleString()} أوردر</div>` : ''}
            </td>
            <td class="p-3.5 font-mono text-slate-600" dir="ltr">
                <div>${e(c.phone)}</div>
                ${c.phone2 ? `<div class="text-[11px] text-slate-400">${e(c.phone2)}</div>` : ''}
            </td>
            <td class="p-3.5 text-center font-medium text-slate-700">${s.monthly.toLocaleString()}</td>
            <td class="p-3.5 text-center font-bold text-slate-800">${s.total.toLocaleString()}</td>
            <td class="p-3.5 text-center font-medium text-emerald-600">${s.delivered.toLocaleString()}</td>
            <td class="p-3.5 text-center font-medium text-rose-600">${s.returns.toLocaleString()}</td>
            <td class="p-3.5 text-center font-bold text-slate-800">${s.commission.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
            <td class="p-3.5 text-center font-semibold text-amber-600">${s.totalCommission.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
            <td class="p-3.5 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.rate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${s.rate}%</span>
            </td>
            <td class="p-3.5 text-center">
                <span title="${s.reachCount} من ${s.total}" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.reachRate >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${s.reachRate}%</span>
            </td>
            <td class="p-3.5 text-center">
                ${active
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> نشط</span>`
                : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> متوقف</span>`}
            </td>
            <td class="p-3.5 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button type="button" onclick="toggleCourierStatus('${c.id}')"
                        class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${active
                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'}">
                        ${active ? 'إيقاف' : 'تشغيل'}
                    </button>
                    <button type="button" onclick="deleteCourier('${c.id}')" title="حذف"
                        class="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterCouriersTable() {
    const q = normalizeZoneName(document.getElementById('couriers-search-input')?.value || '');
    const qPhone = courierNormPhone(q);
    const list = q
        ? couriersData.filter(c =>
            normalizeZoneName(c.name).includes(q) ||
            (qPhone && (courierNormPhone(c.phone).includes(qPhone) || courierNormPhone(c.phone2).includes(qPhone))))
        : couriersData;
    renderCouriersTable([...list].sort((a, b) => compareArabicNames(a.name, b.name)));
}

// ---------- العهدة والمديونية (Ledger) ----------
// كل حركة = مستند في courierLedger:
//   order_debt   : أوردر اتسجل على المندوب (orderRef, orderCode, customer, orderTotal, amount)
//   cash_payment : سداد من المندوب (amount) - عام أو عن أوردر معين (orderRef)
//   cash_debt / custody_out / custody_back : حركات يدوية
const COURIER_LEDGER_TYPES = {
    order_debt:   { label: 'أوردر على المندوب',    kind: 'cash',    sign: 1,  cls: 'bg-rose-100 text-rose-800' },
    cash_payment: { label: 'سداد من المندوب',      kind: 'cash',    sign: -1, cls: 'bg-emerald-100 text-emerald-800' },
    cash_debt:    { label: 'مبلغ على المندوب',     kind: 'cash',    sign: 1,  cls: 'bg-rose-100 text-rose-800' },
    custody_out:  { label: 'استلام عهدة أوردرات',  kind: 'custody', sign: 1,  cls: 'bg-amber-100 text-amber-800' },
    custody_back: { label: 'إرجاع عهدة أوردرات',   kind: 'custody', sign: -1, cls: 'bg-blue-100 text-blue-800' }
};
const COURIER_MANUAL_TYPES = ['cash_debt', 'custody_out', 'custody_back'];

let courierLedgerIndex = {};   // { courierId: [entries] }
let courierLedgerPanel = '';   // '' | 'orders' | 'pay' | 'manual'
let courierPickerSearch = '';
let courierPickState = {};     // { orderId: { checked, amount } }
let courierPayPreset = '';     // أوردر محدد مسبقاً في نافذة السداد

const COURIER_INPUT_CLS = 'px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500';

// حساب كل أوردر مسجل على المندوب: المسجل / المسدد / المتبقي
function getCourierOrderLedger(id) {
    const map = {};
    (courierLedgerIndex[id] || []).forEach(en => {
        if (!en.orderRef) return;
        const m = map[en.orderRef] = map[en.orderRef] ||
            { ref: en.orderRef, code: '', customer: '', total: 0, charged: 0, paid: 0 };
        if (en.orderCode) m.code = en.orderCode;
        if (en.customer) m.customer = en.customer;
        if (en.orderTotal) m.total = courierNum(en.orderTotal);
        if (en.type === 'order_debt') m.charged += courierNum(en.amount);
        else if (en.type === 'cash_payment') m.paid += courierNum(en.amount);
    });
    return map;
}

function getCourierBalance(id) {
    let cash = 0, custody = 0;
    (courierLedgerIndex[id] || []).forEach(en => {
        const t = COURIER_LEDGER_TYPES[en.type];
        if (!t) return;
        if (t.kind === 'cash') cash += t.sign * courierNum(en.amount);
        else custody += t.sign * courierNum(en.count);
    });
    // كل أوردر لسه عليه متبقي = أوردر في العهدة
    Object.values(getCourierOrderLedger(id)).forEach(m => {
        if (m.charged - m.paid > 0.0001) custody++;
    });
    return { cash, custody };
}

// الأوردرات المعينة على المندوب (من Firebase) واللي لسه فيها جزء ممكن يتسجل
function courierLedgerAvailableOrders(c) {
    const map = getCourierOrderLedger(c.id);
    return getCourierOrders(c).map(o => {
        const f = courierOrderField(o);
        const charged = map[o._id]?.charged || 0;
        return { o, f, t: courierOrderTime(o), avail: Math.max(0, f.total - charged) };
    }).filter(x => x.avail > 0)
        .sort((a, b) => (b.t?.getTime() || 0) - (a.t?.getTime() || 0));
}

function renderCourierLedgerTab() {
    const body = document.getElementById('courier-history-body');
    if (!body) return;
    const btn = 'px-3 py-2 rounded-xl text-xs font-semibold transition-colors';
    courierLedgerPanel = '';
    courierPickState = {};
    courierPayPreset = '';
    courierPickerSearch = '';

    body.innerHTML = `
    <div class="p-3 border-b border-slate-100 bg-slate-50/60 space-y-3">
        <div id="courier-ledger-summary" class="grid grid-cols-2 gap-3"></div>
        <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="setCourierLedgerPanel('orders')" class="${btn} bg-emerald-600 hover:bg-emerald-700 text-white">+ إضافة أوردرات على المندوب</button>
            <button type="button" onclick="setCourierLedgerPanel('pay')" class="${btn} bg-slate-800 hover:bg-slate-900 text-white">تسجيل سداد</button>
            <button type="button" onclick="setCourierLedgerPanel('manual')" class="${btn} bg-slate-100 hover:bg-slate-200 text-slate-600">حركة يدوية</button>
        </div>
        <div id="courier-ledger-panel"></div>
    </div>
    <div id="courier-ledger-orders"></div>
    <div id="courier-ledger-list"></div>`;
    updateCourierLedgerView();
}

function setCourierLedgerPanel(p) {
    if (courierLedgerPanel === p) p = '';
    courierLedgerPanel = p;
    if (p === 'orders') { courierPickState = {}; courierPickerSearch = ''; }
    if (p !== 'pay') courierPayPreset = '';
    renderCourierLedgerPanel();
}

function renderCourierLedgerPanel() {
    const box = document.getElementById('courier-ledger-panel');
    const id = courierHistoryView.id;
    const c = couriersData.find(x => x.id === id);
    if (!box || !c) return;
    const e = escapeZoneHtml;

    if (!courierLedgerPanel) { box.innerHTML = ''; return; }

    if (courierLedgerPanel === 'orders') {
        box.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
                <input type="text" id="courier-pick-search" value="${e(courierPickerSearch)}"
                    placeholder="بحث في أوردرات المندوب: كود، عميل، موبايل، حالة..."
                    oninput="courierPickerSearch = this.value; renderCourierPickRows()"
                    class="${COURIER_INPUT_CLS} flex-1 min-w-[220px]">
                <span id="courier-pick-total" class="text-xs font-bold text-slate-700 whitespace-nowrap"></span>
                <button type="button" onclick="saveCourierPickedOrders()"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors">تسجيل على المندوب</button>
            </div>
            <p class="text-[11px] text-slate-400">اختار الأوردرات، وعدّل "المبلغ عليه" لو عايز تسجل جزء من سعر الأوردر بس.</p>
            <p id="courier-pick-error" class="hidden text-[11px] font-semibold text-rose-600"></p>
            <div id="courier-pick-rows" class="overflow-auto max-h-60 rounded-xl border border-slate-100"></div>
        </div>`;
        renderCourierPickRows();
        return;
    }

    if (courierLedgerPanel === 'pay') {
        const bal = getCourierBalance(id);
        const map = getCourierOrderLedger(id);
        const opts = Object.values(map)
            .filter(m => m.charged - m.paid > 0.0001)
            .map(m => `<option value="${m.ref}" ${m.ref === courierPayPreset ? 'selected' : ''}>${e(m.code || m.ref)} - ${e(m.customer)} (متبقي ${(m.charged - m.paid).toLocaleString()} جم)</option>`)
            .join('');
        box.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div class="text-xs text-slate-500">مبلغ العهدة الحالي: <b class="text-rose-600">${bal.cash.toLocaleString()} جم</b></div>
            <div class="flex flex-wrap items-center gap-2">
                <select id="courier-pay-order" onchange="fillCourierPayAmount()" class="${COURIER_INPUT_CLS} min-w-[240px]">
                    <option value="">سداد عام (من إجمالي العهدة)</option>${opts}
                </select>
                <input type="number" min="0" step="any" id="courier-pay-amount" placeholder="المبلغ المسدد (جم)" class="${COURIER_INPUT_CLS} w-40">
                <button type="button" onclick="fillCourierPayAmount()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold">سداد الكل</button>
                <input type="text" id="courier-pay-note" placeholder="ملاحظة (اختياري)" class="${COURIER_INPUT_CLS} flex-1 min-w-[160px]">
                <button type="button" onclick="saveCourierPayment()"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors">تسجيل السداد</button>
            </div>
            <p id="courier-pay-error" class="hidden text-[11px] font-semibold text-rose-600"></p>
        </div>`;
        return;
    }

    // manual
    const typeOpts = COURIER_MANUAL_TYPES
        .map(k => `<option value="${k}">${COURIER_LEDGER_TYPES[k].label}</option>`).join('');
    box.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
            <select id="courier-ledger-type" onchange="updateCourierLedgerFormLabels()" class="${COURIER_INPUT_CLS}">${typeOpts}</select>
            <input type="number" min="0" step="any" id="courier-ledger-value" class="${COURIER_INPUT_CLS} w-32">
            <input type="text" id="courier-ledger-note" placeholder="ملاحظة (اختياري)" class="${COURIER_INPUT_CLS} flex-1 min-w-[200px]">
            <button type="button" onclick="addCourierLedgerEntry()"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors">تسجيل</button>
        </div>
        <p id="courier-ledger-error" class="hidden text-[11px] font-semibold text-rose-600"></p>
    </div>`;
    updateCourierLedgerFormLabels();
}

function updateCourierLedgerFormLabels() {
    const sel = document.getElementById('courier-ledger-type');
    const val = document.getElementById('courier-ledger-value');
    if (!sel || !val) return;
    val.placeholder = COURIER_LEDGER_TYPES[sel.value].kind === 'cash' ? 'المبلغ (جم)' : 'عدد الأوردرات';
}

// ---------- اختيار الأوردرات ----------
function setCourierPickChecked(ref, checked) {
    courierPickState[ref] = { ...(courierPickState[ref] || {}), checked };
    updateCourierPickTotal();
}

function setCourierPickAmount(ref, val) {
    courierPickState[ref] = { ...(courierPickState[ref] || {}), amount: val, checked: val !== '' };
    const cb = document.getElementById('courier-pick-cb-' + ref);
    if (cb) cb.checked = val !== '';
    updateCourierPickTotal();
}

function courierPickAmountOf(ref, avail) {
    const st = courierPickState[ref] || {};
    return st.amount === undefined || st.amount === '' ? avail : parseFloat(st.amount) || 0;
}

function renderCourierPickRows() {
    const box = document.getElementById('courier-pick-rows');
    const c = couriersData.find(x => x.id === courierHistoryView.id);
    if (!box || !c) return;
    const e = escapeZoneHtml;
    const q = normalizeZoneName(courierPickerSearch || '');

    const rows = courierLedgerAvailableOrders(c).filter(({ f, o }) => !q ||
        normalizeZoneName([f.code, f.customer, f.phone, f.status, f.area, o.phone ?? ''].join(' ')).includes(q));

    if (!rows.length) {
        box.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">لا توجد أوردرات متاحة لهذا المندوب</div>`;
        updateCourierPickTotal();
        return;
    }

    box.innerHTML = `
    <table class="w-full text-right text-xs whitespace-nowrap">
        <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 sticky top-0">
            <tr><th class="p-2 w-8"></th><th class="p-2">ID</th><th class="p-2">العميل</th><th class="p-2 text-center">الحالة</th>
                <th class="p-2 text-center">الإجمالي</th><th class="p-2 text-center">المتاح</th><th class="p-2 text-center">المبلغ عليه</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-slate-700">
            ${rows.map(({ o, f, avail }) => {
        const st = courierPickState[o._id] || {};
        return `<tr class="hover:bg-slate-50/60">
                    <td class="p-2"><input type="checkbox" id="courier-pick-cb-${o._id}" ${st.checked ? 'checked' : ''}
                        onchange="setCourierPickChecked('${o._id}', this.checked)" class="w-4 h-4 accent-emerald-600"></td>
                    <td class="p-2 font-mono">${e(f.code)}</td>
                    <td class="p-2 font-semibold">${e(f.customer)}</td>
                    <td class="p-2 text-center">${e(f.status || '—')}</td>
                    <td class="p-2 text-center">${f.total.toLocaleString()}</td>
                    <td class="p-2 text-center text-slate-500">${avail.toLocaleString()}</td>
                    <td class="p-2 text-center"><input type="number" min="0" max="${avail}" step="any"
                        value="${st.amount === undefined ? avail : e(st.amount)}"
                        oninput="setCourierPickAmount('${o._id}', this.value)"
                        class="${COURIER_INPUT_CLS} w-24 text-center"></td>
                </tr>`;
    }).join('')}
        </tbody>
    </table>`;
    updateCourierPickTotal();
}

function updateCourierPickTotal() {
    const el = document.getElementById('courier-pick-total');
    const c = couriersData.find(x => x.id === courierHistoryView.id);
    if (!el || !c) return;
    let n = 0, sum = 0;
    courierLedgerAvailableOrders(c).forEach(({ o, avail }) => {
        if (!courierPickState[o._id]?.checked) return;
        n++;
        sum += courierPickAmountOf(o._id, avail);
    });
    el.textContent = n ? `المحدد: ${n} أوردر | ${sum.toLocaleString()} جم` : '';
}

async function saveCourierPickedOrders() {
    const id = courierHistoryView.id;
    const c = couriersData.find(x => x.id === id);
    if (!c || !window.db) return;
    const err = document.getElementById('courier-pick-error');
    const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    err.classList.add('hidden');

    const picks = [];
    for (const x of courierLedgerAvailableOrders(c)) {
        if (!courierPickState[x.o._id]?.checked) continue;
        const amount = courierPickAmountOf(x.o._id, x.avail);
        if (!(amount > 0)) return fail(`اكتب مبلغ صحيح للأوردر ${x.f.code}`);
        if (amount > x.avail + 0.0001) return fail(`المبلغ أكبر من المتاح (${x.avail}) في الأوردر ${x.f.code}`);
        picks.push({ ...x, amount });
    }
    if (!picks.length) return fail('اختار أوردر واحد على الأقل');

    try {
        const FV = firebase.firestore.FieldValue;
        for (let i = 0; i < picks.length; i += 400) {
            const batch = window.db.batch();
            picks.slice(i, i + 400).forEach(p => {
                batch.set(window.db.collection(COURIERS_CFG.ledgerCollection).doc(), {
                    courierId: id,
                    type: 'order_debt',
                    orderRef: p.o._id,
                    orderCode: String(p.f.code ?? ''),
                    customer: String(p.f.customer ?? ''),
                    orderTotal: p.f.total,
                    amount: p.amount,
                    note: '',
                    at: FV.serverTimestamp()
                });
            });
            await batch.commit();
        }
        const sum = picks.reduce((s, p) => s + p.amount, 0);
        await logCourierHistory(id, 'أوردرات على المندوب',
            `${picks.length} أوردر بإجمالي ${sum} جم: ` + picks.map(p => `${p.f.code} (${p.amount})`).join('، '));
        courierLedgerPanel = '';
        courierPickState = {};
        renderCourierLedgerPanel();
    } catch (e) {
        console.error('خطأ تسجيل الأوردرات على المندوب:', e);
        fail('تعذر الحفظ، حاول مرة أخرى');
    }
}

// ---------- السداد ----------
function payCourierOrder(ref) {
    courierPayPreset = ref;
    courierLedgerPanel = 'pay';
    renderCourierLedgerPanel();
    fillCourierPayAmount();
    document.getElementById('courier-pay-amount')?.focus();
}

function fillCourierPayAmount() {
    const id = courierHistoryView.id;
    const sel = document.getElementById('courier-pay-order');
    const inp = document.getElementById('courier-pay-amount');
    if (!sel || !inp) return;
    let rem;
    if (sel.value) {
        const m = getCourierOrderLedger(id)[sel.value];
        rem = m ? m.charged - m.paid : 0;
    } else {
        rem = getCourierBalance(id).cash;
    }
    inp.value = rem > 0 ? rem : '';
}

async function saveCourierPayment() {
    const id = courierHistoryView.id;
    if (!id || !window.db) return;
    const err = document.getElementById('courier-pay-error');
    const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    err.classList.add('hidden');

    const ref = document.getElementById('courier-pay-order').value;
    const amount = parseFloat(document.getElementById('courier-pay-amount').value);
    const note = document.getElementById('courier-pay-note').value.trim();
    if (!(amount > 0)) return fail('اكتب مبلغ السداد');

    const entry = { courierId: id, type: 'cash_payment', amount, note, at: firebase.firestore.FieldValue.serverTimestamp() };
    if (ref) {
        const m = getCourierOrderLedger(id)[ref];
        const rem = m ? m.charged - m.paid : 0;
        if (amount > rem + 0.0001) return fail(`المبلغ أكبر من المتبقي على الأوردر (${rem.toLocaleString()} جم)`);
        entry.orderRef = ref;
        entry.orderCode = m.code;
        entry.customer = m.customer;
        entry.orderTotal = m.total;
    } else {
        const bal = getCourierBalance(id).cash;
        if (amount > bal + 0.0001 && !confirm(`المبلغ (${amount}) أكبر من مبلغ العهدة (${bal}). تكمل؟`)) return;
    }

    try {
        await window.db.collection(COURIERS_CFG.ledgerCollection).add(entry);
        await logCourierHistory(id, 'سداد من المندوب',
            `${amount} جم${entry.orderCode ? ' | أوردر ' + entry.orderCode : ''}${note ? ' | ' + note : ''}`);
        courierLedgerPanel = '';
        courierPayPreset = '';
        renderCourierLedgerPanel();
    } catch (e) {
        console.error('خطأ تسجيل السداد:', e);
        fail('تعذر الحفظ، حاول مرة أخرى');
    }
}

// ---------- العرض ----------
function updateCourierLedgerView() {
    const summary = document.getElementById('courier-ledger-summary');
    const ordersBox = document.getElementById('courier-ledger-orders');
    const list = document.getElementById('courier-ledger-list');
    const id = courierHistoryView.id;
    const c = couriersData.find(x => x.id === id);
    if (!summary || !list || !ordersBox || !c) return;

    const e = escapeZoneHtml;
    const bal = getCourierBalance(id);
    summary.innerHTML = `
        <div class="bg-white border border-slate-100 border-t-4 ${bal.cash > 0 ? 'border-t-rose-400' : 'border-t-emerald-500'} rounded-xl p-3 text-center">
            <div class="text-[11px] font-semibold text-slate-500">مبلغ العهدة على المندوب</div>
            <div class="text-lg font-bold ${bal.cash > 0 ? 'text-rose-600' : 'text-emerald-600'}">${bal.cash.toLocaleString()} جم</div>
        </div>
        <div class="bg-white border border-slate-100 border-t-4 ${bal.custody > 0 ? 'border-t-amber-400' : 'border-t-emerald-500'} rounded-xl p-3 text-center">
            <div class="text-[11px] font-semibold text-slate-500">أوردرات في عهدة المندوب</div>
            <div class="text-lg font-bold ${bal.custody > 0 ? 'text-amber-600' : 'text-emerald-600'}">${bal.custody.toLocaleString()}</div>
        </div>`;

    // الأوردرات المسجلة على المندوب
    const statusOf = {};
    getCourierOrders(c).forEach(o => { statusOf[o._id] = courierOrderField(o).status; });
    const ordLedger = Object.values(getCourierOrderLedger(id))
        .sort((a, b) => (b.charged - b.paid) - (a.charged - a.paid));

    ordersBox.innerHTML = ordLedger.length ? `
    <div class="px-3 pt-3 text-xs font-bold text-slate-700">الأوردرات المسجلة على المندوب</div>
    <table class="w-full text-right text-xs whitespace-nowrap mt-2">
        <thead class="bg-slate-50 text-slate-600 font-bold border-y border-slate-100">
            <tr><th class="p-2.5">ID</th><th class="p-2.5">العميل</th><th class="p-2.5 text-center">الحالة</th>
                <th class="p-2.5 text-center">إجمالي الأوردر</th><th class="p-2.5 text-center">المسجل عليه</th>
                <th class="p-2.5 text-center">المسدد</th><th class="p-2.5 text-center">المتبقي</th><th class="p-2.5 w-20"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-slate-700">
            ${ordLedger.map(m => {
        const rem = m.charged - m.paid;
        return `<tr class="${rem <= 0.0001 ? 'bg-emerald-50/40' : ''}">
                    <td class="p-2.5 font-mono">${e(m.code)}</td>
                    <td class="p-2.5 font-semibold">${e(m.customer)}</td>
                    <td class="p-2.5 text-center">${e(statusOf[m.ref] || '—')}</td>
                    <td class="p-2.5 text-center">${m.total.toLocaleString()}</td>
                    <td class="p-2.5 text-center">${m.charged.toLocaleString()}</td>
                    <td class="p-2.5 text-center text-emerald-600">${m.paid.toLocaleString()}</td>
                    <td class="p-2.5 text-center font-bold ${rem > 0.0001 ? 'text-rose-600' : 'text-emerald-600'}">${rem > 0.0001 ? rem.toLocaleString() : 'تم السداد'}</td>
                    <td class="p-2.5 text-center">${rem > 0.0001
                ? `<button type="button" onclick="payCourierOrder('${m.ref}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">سداد</button>` : ''}</td>
                </tr>`;
    }).join('')}
        </tbody>
    </table>` : '';

    // سجل الحركات
    const entries = [...(courierLedgerIndex[id] || [])]
        .sort((a, b) => (b.at?.getTime?.() || Date.now()) - (a.at?.getTime?.() || Date.now()));

    if (!entries.length) {
        list.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">لا توجد حركات عهدة أو مديونية مسجلة</div>`;
        return;
    }

    list.innerHTML = `
    <div class="px-3 pt-3 text-xs font-bold text-slate-700">سجل الحركات</div>
    <table class="w-full text-right text-xs mt-2">
        <thead class="bg-slate-50 text-slate-600 font-bold border-y border-slate-100">
            <tr><th class="p-2.5 w-40">التاريخ</th><th class="p-2.5">النوع</th>
                <th class="p-2.5 text-center">المبلغ / العدد</th><th class="p-2.5">التفاصيل</th><th class="p-2.5 w-12"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-slate-700">
            ${entries.map(en => {
        const t = COURIER_LEDGER_TYPES[en.type] || { label: en.type, kind: 'cash', cls: 'bg-slate-100 text-slate-700' };
        const v = t.kind === 'cash' ? `${courierNum(en.amount).toLocaleString()} جم` : `${courierNum(en.count).toLocaleString()} أوردر`;
        const detail = [en.orderCode ? `أوردر ${en.orderCode}${en.customer ? ' - ' + en.customer : ''}` : '', en.note].filter(Boolean).join(' | ');
        return `<tr>
                    <td class="p-2.5 text-slate-500 whitespace-nowrap">${courierFmtDate(en.at)}</td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${t.cls}">${e(t.label)}</span></td>
                    <td class="p-2.5 text-center font-bold">${v}</td>
                    <td class="p-2.5 break-words">${e(detail)}</td>
                    <td class="p-2.5 text-center">
                        <button type="button" onclick="deleteCourierLedgerEntry('${en._id}')" title="حذف الحركة"
                            class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
    }).join('')}
        </tbody>
    </table>`;
}

async function addCourierLedgerEntry() {
    const id = courierHistoryView.id;
    if (!id || !window.db) return;
    const type = document.getElementById('courier-ledger-type').value;
    const value = parseFloat(document.getElementById('courier-ledger-value').value);
    const note = document.getElementById('courier-ledger-note').value.trim();
    const t = COURIER_LEDGER_TYPES[type];
    const errEl = document.getElementById('courier-ledger-error');

    if (!(value > 0)) {
        errEl.textContent = t.kind === 'cash' ? 'اكتب مبلغ صحيح' : 'اكتب عدد الأوردرات';
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const entry = { courierId: id, type, note, at: firebase.firestore.FieldValue.serverTimestamp() };
    if (t.kind === 'cash') entry.amount = value; else entry.count = Math.round(value);

    try {
        await window.db.collection(COURIERS_CFG.ledgerCollection).add(entry);
        await logCourierHistory(id, t.label,
            `${t.kind === 'cash' ? value + ' جم' : Math.round(value) + ' أوردر'}${note ? ' | ' + note : ''}`);
        document.getElementById('courier-ledger-value').value = '';
        document.getElementById('courier-ledger-note').value = '';
    } catch (err) {
        console.error('خطأ تسجيل حركة العهدة:', err);
        errEl.textContent = 'تعذر الحفظ، حاول مرة أخرى';
        errEl.classList.remove('hidden');
    }
}

async function deleteCourierLedgerEntry(entryId) {
    const id = courierHistoryView.id;
    const en = (courierLedgerIndex[id] || []).find(x => x._id === entryId);
    if (!en || !window.db) return;
    if (!confirm('هل تريد حذف هذه الحركة؟')) return;
    try {
        await window.db.collection(COURIERS_CFG.ledgerCollection).doc(entryId).delete();
        const t = COURIER_LEDGER_TYPES[en.type];
        await logCourierHistory(id, 'حذف حركة',
            `${t?.label || en.type}: ${t?.kind === 'custody' ? courierNum(en.count) + ' أوردر' : courierNum(en.amount) + ' جم'}${en.orderCode ? ' | أوردر ' + en.orderCode : ''}`);
    } catch (err) {
        console.error('خطأ حذف الحركة:', err);
        alert('تعذر حذف الحركة');
    }
}

// ---------- نافذة السجل والطلبات ----------
function ensureCourierHistoryModal() {
    if (document.getElementById('courier-history-modal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
    <div id="courier-history-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[9999] p-4" dir="rtl">
        <div class="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh]">
            <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h4 id="courier-history-title" class="text-base font-bold text-slate-800"></h4>
                <button type="button" onclick="closeCourierHistory()"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>
            <div class="p-6 space-y-4 overflow-y-auto">
                <div class="flex items-center gap-2 border-b border-slate-100">
                    <button type="button" id="courier-tab-summary" onclick="setCourierHistoryTab('summary')"
                        class="px-4 py-2 text-xs font-bold border-b-2 transition">الملخص</button>
                    <button type="button" id="courier-tab-orders" onclick="setCourierHistoryTab('orders')"
                        class="px-4 py-2 text-xs font-bold border-b-2 transition">الطلبات</button>
                    <button type="button" id="courier-tab-ledger" onclick="setCourierHistoryTab('ledger')"
                        class="px-4 py-2 text-xs font-bold border-b-2 transition">العهدة والمديونية</button>
                    <button type="button" id="courier-tab-log" onclick="setCourierHistoryTab('log')"
                        class="px-4 py-2 text-xs font-bold border-b-2 transition">سجل المندوب</button>
                    <input type="text" id="courier-history-search" placeholder="بحث في الطلبات: كود، عميل، موبايل، حالة..."
                        oninput="courierHistoryView.search = this.value; renderCourierOrdersHistory()"
                        class="mr-auto w-64 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                </div>

                <div id="courier-history-body" class="overflow-auto rounded-xl border border-slate-100 max-h-[45vh]"></div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(wrapper.firstElementChild);

    const modal = document.getElementById('courier-history-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeCourierHistory(); });
}

function openCourierHistory(id) {
    const c = couriersData.find(x => x.id === id);
    if (!c) return;
    ensureCourierHistoryModal();

    courierHistoryView = { id, tab: 'orders', search: '' };
    document.getElementById('courier-history-search').value = '';
    document.getElementById('courier-history-title').textContent = `سجل المندوب: ${c.name || ''}`;

    const modal = document.getElementById('courier-history-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    courierHistoryView.tab = 'summary';
    setCourierHistoryTab('summary');
}

function closeCourierHistory() {
    const modal = document.getElementById('courier-history-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (courierHistoryUnsub) { courierHistoryUnsub(); courierHistoryUnsub = null; }
    courierHistoryView.id = '';
}

// تاب "الملخص": بيانات المندوب + كروت الإحصائيات
function renderCourierHistoryHeader() {
    if (courierHistoryView.tab !== 'summary') return;
    const c = couriersData.find(x => x.id === courierHistoryView.id);
    const body = document.getElementById('courier-history-body');
    if (!c || !body) return;
    body.innerHTML = `
        <div class="p-3 space-y-3">
            <div class="flex justify-end">
                <button type="button" onclick="openEditCourierModal(courierHistoryView.id)"
                    class="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer">
                    <i class="fa-solid fa-pen"></i> تعديل البيانات
                </button>
            </div>
            <div id="courier-history-info" class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"></div>
            <div id="courier-history-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>
        </div>`;
    const e = escapeZoneHtml;
    const s = computeCourierStats(c);
    const bal = getCourierBalance(c.id);
    const info = (label, v) => `
        <div class="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <div class="text-[11px] font-semibold text-slate-400 mb-0.5">${label}</div>
            <div class="font-semibold text-slate-700 break-words">${v ? e(v) : '—'}</div>
        </div>`;
    document.getElementById('courier-history-info').innerHTML =
        info('رقم الهاتف', c.phone) + info('رقم آخر', c.phone2) + info('رقم البطاقة', c.nationalId) +
        info('عنوان المندوب', c.address) +
        info('الموتوسيكل', [c.bikeModel, c.bikePlate].filter(Boolean).join(' - ')) +
        info('رخصة الموتوسيكل', c.licenseNumber) + info('انتهاء الرخصة', c.licenseExpiry) +
        info('عمولة الأوردر', c.commission ? c.commission + ' جم' : '');

    const stat = (label, v, cls) => `
        <div class="bg-white border border-slate-100 border-t-4 ${cls} rounded-xl p-3 text-center shadow-sm">
            <div class="text-[11px] font-semibold text-slate-500">${label}</div>
            <div class="text-lg font-bold text-slate-800">${v}</div>
        </div>`;
    document.getElementById('courier-history-stats').innerHTML =
        stat('إجمالي الطلبات', s.total.toLocaleString(), 'border-t-slate-400') +
        stat('التسليمات الناجحة', s.delivered.toLocaleString(), 'border-t-emerald-500') +
        stat('المرتجعات', s.returns.toLocaleString(), 'border-t-rose-400') +
        stat('التحصيل', s.collections.toLocaleString() + ' جم', 'border-t-blue-400') +
        stat('إجمالي العمولة', s.totalCommission.toLocaleString() + ' جم', 'border-t-amber-400') +
        stat('المبلغ المطلوب', s.requiredTotal.toLocaleString() + ' جم', 'border-t-rose-500') +
        stat('أوردرات في العهدة', bal.custody.toLocaleString(), bal.custody > 0 ? 'border-t-amber-500' : 'border-t-emerald-500') +
        stat('مبلغ العهدة', bal.cash.toLocaleString() + ' جم', bal.cash > 0 ? 'border-t-amber-500' : 'border-t-emerald-500');
}

function setCourierHistoryTab(tab) {
    courierHistoryView.tab = tab;
    const on = 'border-emerald-600 text-emerald-700';
    const off = 'border-transparent text-slate-500 hover:text-slate-700';
    ['summary', 'orders', 'ledger', 'log'].forEach(t => {
        const b = document.getElementById('courier-tab-' + t);
        if (b) b.className = `px-4 py-2 text-xs font-bold border-b-2 transition ${tab === t ? on : off}`;
    });
    document.getElementById('courier-history-search').classList.toggle('hidden', tab !== 'orders');

    if (courierHistoryUnsub) { courierHistoryUnsub(); courierHistoryUnsub = null; }
    if (tab === 'summary') renderCourierHistoryHeader();
    else if (tab === 'orders') renderCourierOrdersHistory();
    else if (tab === 'ledger') renderCourierLedgerTab();
    else listenCourierLog();
}

function renderCourierOrdersHistory() {
    const body = document.getElementById('courier-history-body');
    const c = couriersData.find(x => x.id === courierHistoryView.id);
    if (!body || !c) return;

    const q = normalizeZoneName(courierHistoryView.search || '');
    const e = escapeZoneHtml;

    const rows = getCourierOrders(c)
        .map(o => ({ o, f: courierOrderField(o), t: courierOrderTime(o) }))
        .filter(({ f }) => !q || normalizeZoneName(
            [f.code, f.customer, f.phone, f.status, f.area, f.office].join(' ')).includes(q))
        .sort((a, b) => (b.t?.getTime() || 0) - (a.t?.getTime() || 0));

    if (!rows.length) {
        body.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">لا توجد طلبات لهذا المندوب${courierDetectedField ? ' (الحقل المستخدم في الأوردرات: ' + escapeZoneHtml(courierDetectedField) + ')' : ' (لم يتم العثور على حقل مندوب في الأوردرات)'}</div>`;
        return;
    }

    body.innerHTML = `
    <table class="w-full text-right text-xs whitespace-nowrap">
        <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 sticky top-0">
            <tr>
                <th class="p-2.5">ID</th><th class="p-2.5">العميل</th><th class="p-2.5">رقم الهاتف</th>
                <th class="p-2.5 text-center">الحالة</th><th class="p-2.5 text-center">الإجمالي</th>
                <th class="p-2.5 text-center">التحصيل</th><th class="p-2.5">المنطقة</th>
                <th class="p-2.5">المكتب</th><th class="p-2.5 text-center">التاريخ</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-slate-700">
            ${rows.map(({ f, t }) => `
            <tr class="hover:bg-slate-50/60">
                <td class="p-2.5 font-mono">${e(f.code)}</td>
                <td class="p-2.5 font-semibold">${e(f.customer)}</td>
                <td class="p-2.5 font-mono" dir="ltr">${e(f.phone)}</td>
                <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${COURIERS_CFG.deliveredStatuses.includes(f.status)
            ? 'bg-emerald-100 text-emerald-800'
            : COURIERS_CFG.returnedStatuses.includes(f.status) ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}">${e(f.status || '—')}</span></td>
                <td class="p-2.5 text-center">${f.total.toLocaleString()}</td>
                <td class="p-2.5 text-center">${f.collected.toLocaleString()}</td>
                <td class="p-2.5">${e(f.area)}</td>
                <td class="p-2.5">${e(f.office)}</td>
                <td class="p-2.5 text-center text-slate-500">${courierFmtDate(t)}</td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

function listenCourierLog() {
    const body = document.getElementById('courier-history-body');
    if (!body || !window.db) return;
    body.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">جاري التحميل...</div>`;

    const id = courierHistoryView.id;
    courierHistoryUnsub = window.db.collection(COURIERS_CFG.collection).doc(id)
        .collection('history').orderBy('at', 'desc').limit(COURIERS_CFG.historyLimit)
        .onSnapshot((snap) => {
            if (courierHistoryView.id !== id || courierHistoryView.tab !== 'log') return;
            if (snap.empty) {
                body.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">لا يوجد سجل بعد</div>`;
                return;
            }
            const e = escapeZoneHtml;
            body.innerHTML = `
            <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 sticky top-0">
                    <tr><th class="p-2.5 w-40">التاريخ</th><th class="p-2.5 w-24">الإجراء</th><th class="p-2.5">التفاصيل</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                    ${snap.docs.map(d => {
                const h = d.data();
                return `<tr>
                            <td class="p-2.5 text-slate-500 whitespace-nowrap">${courierFmtDate(h.at?.toDate?.() || null)}</td>
                            <td class="p-2.5 font-semibold">${e(h.action)}</td>
                            <td class="p-2.5 break-words">${e(h.details)}</td>
                        </tr>`;
            }).join('')}
                </tbody>
            </table>`;
        }, (err) => {
            console.error('مزامنة سجل المندوب فشلت:', err);
            body.innerHTML = `<div class="p-8 text-center text-rose-500 text-xs">تعذر تحميل السجل</div>`;
        });
}

// ---------- الاستماع اللحظي ----------
function initCouriersRealtimeListener() {
    if (!window.db) return;

    window.db.collection(COURIERS_CFG.collection).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        couriersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterCouriersTable();
        if (courierHistoryView.id) renderCourierHistoryHeader();
    }, (err) => console.error('مزامنة المناديب فشلت:', err));

    // أوردرات كل مندوب (للإحصائيات وسجل الطلبات)
    window.db.collection(COURIERS_CFG.ordersCollection).onSnapshot((snapshot) => {
        buildCourierOrdersIndex(snapshot);
        filterCouriersTable();
        if (courierHistoryView.id) {
            renderCourierHistoryHeader();
            if (courierHistoryView.tab === 'orders') renderCourierOrdersHistory();
        }
    }, (err) => console.error('مزامنة أوردرات المناديب فشلت:', err));

    // حركات العهدة والمديونية
    window.db.collection(COURIERS_CFG.ledgerCollection).onSnapshot((snapshot) => {
        const idx = {};
        snapshot.forEach(doc => {
            const d = doc.data();
            if (!d.courierId) return;
            (idx[d.courierId] = idx[d.courierId] || []).push({
                _id: doc.id, ...d, at: d.at?.toDate?.() || null
            });
        });
        courierLedgerIndex = idx;
        filterCouriersTable();
        if (courierHistoryView.id) {
            renderCourierHistoryHeader();
            if (courierHistoryView.tab === 'ledger') updateCourierLedgerView();
        }
    }, (err) => console.error('مزامنة العهدة فشلت:', err));
}

window.addEventListener('DOMContentLoaded', () => {
    const t = setInterval(() => {
        if (window.db) {
            clearInterval(t);
            initCouriersRealtimeListener();
        }
    }, 100);
});