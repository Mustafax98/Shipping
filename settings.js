let officesData = [];

// جلب Collection المكاتب من Firestore
function getOfficesCollection() {
    if (!window.db) {
        console.error("لم يتم تهيئة Firebase DB");
        return null;
    }
    return window.db.collection('offices');
}

// ==========================================
// 1. التحكم في المودالات (Modal Control - المكاتب)
// ==========================================

function openAddOfficeModal() {
    const modal = document.getElementById('add-office-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAddOfficeModal() {
    const modal = document.getElementById('add-office-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('add-office-form')?.reset();
}

function openEditOfficeModal(id) {
    const office = officesData.find(o => o.id === id);
    if (!office) return;

    document.getElementById('edit-office-id').value = office.id;
    document.getElementById('edit-office-name').value = office.name || '';
    document.getElementById('edit-office-code').value = office.code || '';
    document.getElementById('edit-office-commission').value = office.commission ?? 0;

    const modal = document.getElementById('edit-office-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeEditOfficeModal() {
    const modal = document.getElementById('edit-office-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// إغلاق المودالات عند الضغط على الخلفية الخارجية
window.addEventListener('click', (e) => {
    const addModal = document.getElementById('add-office-modal');
    const editModal = document.getElementById('edit-office-modal');

    if (e.target === addModal) closeAddOfficeModal();
    if (e.target === editModal) closeEditOfficeModal();
});

// ==========================================
// 2. عمليات الإضافة والتعديل والحذف (CRUD - المكاتب)
// ==========================================

async function handleOfficeSubmit(e) {
    e.preventDefault();
    const collection = getOfficesCollection();
    if (!collection) return;

    const nameInput = document.getElementById('modal-office-name').value.trim();
    const codeInput = document.getElementById('modal-office-code').value.trim().toUpperCase();
    const commissionInput = parseFloat(document.getElementById('modal-office-commission').value) || 0;

    const isNameDuplicate = officesData.some(o => o.name && o.name.toLowerCase() === nameInput.toLowerCase());
    const isCodeDuplicate = officesData.some(o => o.code && o.code.toUpperCase() === codeInput);

    if (isNameDuplicate) {
        alert(`عذراً، يوجد مكتب مسجل بالفعل باسم "${nameInput}"`);
        return;
    }

    if (isCodeDuplicate) {
        alert(`عذراً، الكود/الاختصار "${codeInput}" مستخدم بالفعل لمكتب آخر`);
        return;
    }

    const newOffice = {
        name: nameInput,
        code: codeInput,
        commission: commissionInput,
        sentOrders: 0,
        deliveredOrders: 0,
        totalCollections: 0,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await collection.add(newOffice);
        closeAddOfficeModal();
    } catch (err) {
        console.error("خطأ أثناء الإضافة:", err);
        alert("حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.");
    }
}

async function handleEditOfficeSubmit(e) {
    e.preventDefault();
    const collection = getOfficesCollection();
    if (!collection) return;

    const id = document.getElementById('edit-office-id').value;
    const nameInput = document.getElementById('edit-office-name').value.trim();
    const codeInput = document.getElementById('edit-office-code').value.trim().toUpperCase();
    const commissionInput = parseFloat(document.getElementById('edit-office-commission').value) || 0;

    const isNameDuplicate = officesData.some(o => o.id !== id && o.name && o.name.toLowerCase() === nameInput.toLowerCase());
    const isCodeDuplicate = officesData.some(o => o.id !== id && o.code && o.code.toUpperCase() === codeInput);

    if (isNameDuplicate) {
        alert(`عذراً، اسم المكتب "${nameInput}" مستخدم بالفعل لمكتب آخر`);
        return;
    }

    if (isCodeDuplicate) {
        alert(`عذراً، الكود "${codeInput}" مستخدم بالفعل لمكتب آخر`);
        return;
    }

    try {
        await collection.doc(id).update({
            name: nameInput,
            code: codeInput,
            commission: commissionInput
        });
        closeEditOfficeModal();
    } catch (err) {
        console.error("خطأ أثناء التحديث:", err);
        alert("حدث خطأ أثناء تحديث البيانات.");
    }
}

async function deleteOffice(id) {
    const office = officesData.find(o => o.id === id);
    if (confirm(`هل أنت تأكد من رغبتك في حذف مكتب "${office?.name || ''}" نهائياً؟`)) {
        const collection = getOfficesCollection();
        if (!collection) return;

        try {
            await collection.doc(id).delete();
        } catch (err) {
            console.error("خطأ أثناء الحذف:", err);
            alert("حدث خطأ أثناء حذف المكتب.");
        }
    }
}

async function toggleOfficeStatus(id) {
    const collection = getOfficesCollection();
    const office = officesData.find(o => o.id === id);
    if (!collection || !office) return;

    try {
        await collection.doc(id).update({ active: !office.active });
    } catch (err) {
        console.error("خطأ أثناء تغيير الحالة:", err);
    }
}

// ==========================================
// 3. العرض والفلترة (Render & Filter - المكاتب)
// ==========================================

function renderOfficesTable(data = officesData) {
    const tbody = document.getElementById('offices-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-8 text-slate-400">لا توجد مكاتب مسجلة حالياً</td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(office => {
        const sent = office.sentOrders || 0;
        const delivered = office.deliveredOrders || 0;
        const collections = office.totalCollections || 0;
        const commissionPerOrder = office.commission || 0;

        const totalCommission = delivered * commissionPerOrder;
        const netAmount = collections - totalCommission;
        const rate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

        return `
            <tr class="hover:bg-slate-50/50 transition-colors ${!office.active ? 'bg-slate-50/60' : ''}">
                <td class="p-3.5 font-semibold text-slate-800">${office.name || ''}</td>
                <td class="p-3.5 font-mono text-slate-500 uppercase">${office.code || ''}</td>
                <td class="p-3.5 font-bold text-slate-800">${sent.toLocaleString()}</td>
                <td class="p-3.5 font-bold text-slate-800">${commissionPerOrder.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
                <td class="p-3.5 text-center font-medium text-slate-600">${sent.toLocaleString()}</td>
                <td class="p-3.5 text-center font-medium text-emerald-600">${delivered.toLocaleString()}</td>
                <td class="p-3.5 text-center font-semibold text-slate-800">${collections.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
                <td class="p-3.5 text-center font-semibold text-amber-600">${totalCommission.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
                <td class="p-3.5 text-center font-bold text-emerald-700">${netAmount.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">جم</span></td>
                <td class="p-3.5 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${rate}%
                    </span>
                </td>
                <td class="p-3.5 text-center">
                    ${office.active
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                             <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> نشط
                           </span>`
                : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                             <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> متوقف
                           </span>`
            }
                </td>
                <td class="p-3.5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button type="button" onclick="toggleOfficeStatus('${office.id}')" 
                            class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${office.active
                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
            }">
                            ${office.active ? 'إيقاف' : 'تشغيل'}
                        </button>    
                    
                        <button type="button" onclick="openEditOfficeModal('${office.id}')" title="تعديل" 
                            class="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-all cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>

                        <button type="button" onclick="deleteOffice('${office.id}')" title="حذف" 
                            class="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterOfficesTable() {
    const query = document.getElementById('offices-search-input')?.value.toLowerCase().trim() || '';
    const filtered = officesData.filter(o =>
        (o.name && o.name.toLowerCase().includes(query)) ||
        (o.code && o.code.toLowerCase().includes(query))
    );
    renderOfficesTable([...filtered].sort((a, b) => compareArabicNames(a.name, b.name)));
}

function listenToOffices() {
    const collection = getOfficesCollection();
    if (!collection) return;

    collection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        officesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterOfficesTable();
    }, (err) => console.error("مزامنة المكاتب فشلت:", err));
}


/* ==========================================
   4. إدارة المناطق (Zones Management)
   - الإضافة والتعديل من خلال نافذة وزرار "حفظ" (مفيش حفظ تلقائي)
   - منع تكرار اسم المنطقة
   - كل منطقة تتبع محافظة (المحافظات متخزنة على Firebase: collection governorates)
   ========================================== */

// إعدادات الربط مع الطلبات (لتحديث الأوردرات عند تغيير اسم منطقة)
const ZONES_CFG = {
    ordersCollection: 'orders',
    orderAreaField: 'area'
};

let zonesData = [];

// ---------- المحافظات (Firebase: governorates) ----------
const GOVERNORATES_CFG = {
    collection: 'governorates'
};

// القائمة الافتراضية: بتترفع على Firebase تلقائياً أول مرة لو الكوليكشن فاضي
const DEFAULT_GOVERNORATES = [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية',
    'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس',
    'شمال سيناء', 'جنوب سيناء', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج',
    'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح'
];

let governoratesData = [];   // [{id, name, order}]

function getGovernorateNames() {
    return governoratesData.length
        ? governoratesData.map(g => g.name)
        : DEFAULT_GOVERNORATES;
}

// رفع المحافظات الافتراضية (معرّفات ثابتة => مفيش تكرار حتى لو اتنفذت أكتر من مرة)
async function seedGovernorates() {
    if (!window.db) return;
    try {
        const batch = window.db.batch();
        DEFAULT_GOVERNORATES.forEach((name, i) => {
            const id = 'gov_' + String(i + 1).padStart(2, '0');
            batch.set(window.db.collection(GOVERNORATES_CFG.collection).doc(id), {
                name,
                order: i + 1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
    } catch (err) {
        console.error("خطأ أثناء رفع المحافظات:", err);
    }
}

function initGovernoratesListener() {
    if (!window.db) return;

    let seeded = false;
    window.db.collection(GOVERNORATES_CFG.collection).orderBy('order').onSnapshot((snapshot) => {
        if (snapshot.empty && !seeded) {
            seeded = true;
            seedGovernorates();
            return;
        }
        governoratesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // لو النافذة مفتوحة نحدّث القائمة
        const sel = document.getElementById('zone-modal-governorate');
        if (sel) populateZoneGovernorateSelect(sel.value);
    }, (err) => console.error("مزامنة المحافظات فشلت:", err));
}

function populateZoneGovernorateSelect(selected = '') {
    const sel = document.getElementById('zone-modal-governorate');
    if (!sel) return;

    const names = [...getGovernorateNames()];
    // لو المنطقة مسجلة على محافظة مش موجودة في القائمة نضيفها عشان متضيعش
    if (selected && !names.includes(selected)) names.push(selected);

    sel.innerHTML = `<option value="">اختر المحافظة...</option>` +
        names.map(n =>
            `<option value="${escapeZoneHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeZoneHtml(n)}</option>`
        ).join('');
}

// تطبيع الاسم للمقارنة: يتجاهل المسافات الزائدة والحروف المتشابهة (أ/إ/آ=ا، ة=ه، ى=ي)
function normalizeZoneName(s) {
    return String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u0652\u0640]/g, ''); // التشكيل والتطويل
}

// مقارنة للترتيب الأبجدي العربي (أ/إ/آ تتعامل كـ ا، والأرقام تترتب رقمياً)
function compareArabicNames(a, b) {
    return normalizeZoneName(a).localeCompare(normalizeZoneName(b), 'ar', { numeric: true });
}

function cleanZoneName(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function escapeZoneHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function isZoneNameDuplicate(name, excludeId = '') {
    const n = normalizeZoneName(name);
    return zonesData.some(z => z.id !== excludeId && normalizeZoneName(z.name) === n);
}

// ---------- النافذة (بتتبني تلقائياً، مش محتاج تعديل في HTML) ----------
function ensureZoneModal() {
    if (document.getElementById('zone-modal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
    <div id="zone-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[9999] p-4" dir="rtl">
        <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 id="zone-modal-title" class="text-base font-bold text-slate-800">إضافة منطقة جديدة</h4>
                <button type="button" onclick="closeZoneModal()"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>
            <form id="zone-modal-form" onsubmit="handleZoneSubmit(event)" class="space-y-3" autocomplete="off">
                <input type="hidden" id="zone-modal-id">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">اسم المنطقة</label>
                    <input type="text" id="zone-modal-name" required placeholder="مثال: المهندسين"
                        oninput="clearZoneModalError()"
                        class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">المحافظة</label>
                    <select id="zone-modal-governorate" required onchange="clearZoneModalError()"
                        class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                    </select>
                    <p id="zone-modal-error" class="hidden mt-1.5 text-[11px] font-semibold text-rose-600"></p>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" onclick="closeZoneModal()"
                        class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-colors">إلغاء</button>
                    <button type="submit" id="zone-modal-save"
                        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">حفظ</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(wrapper.firstElementChild);

    const modal = document.getElementById('zone-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeZoneModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeZoneModal();
    });
}

function showZoneModalError(msg) {
    const el = document.getElementById('zone-modal-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearZoneModalError() {
    const el = document.getElementById('zone-modal-error');
    if (el) el.classList.add('hidden');
}

function openZoneModal(title, id = '', name = '', governorate = '') {
    ensureZoneModal();
    document.getElementById('zone-modal-title').textContent = title;
    document.getElementById('zone-modal-id').value = id;
    document.getElementById('zone-modal-name').value = name;
    populateZoneGovernorateSelect(governorate);
    clearZoneModalError();

    const saveBtn = document.getElementById('zone-modal-save');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';

    const modal = document.getElementById('zone-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        const input = document.getElementById('zone-modal-name');
        input.focus();
        input.select();
    }, 50);
}

function openAddZoneModal() {
    openZoneModal('إضافة منطقة جديدة');
}

function openEditZoneModal(id) {
    const zone = zonesData.find(z => z.id === id);
    if (!zone) return;
    openZoneModal('تعديل المنطقة', zone.id, zone.name || '', zone.governorate || '');
}

function closeZoneModal() {
    const modal = document.getElementById('zone-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// الاسم القديم محفوظ لأن الـ HTML بينادي addNewZoneRow()
function addNewZoneRow() {
    openAddZoneModal();
}

// ---------- الحفظ (إضافة / تعديل) ----------
async function handleZoneSubmit(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('zone-modal-id').value;
    const name = cleanZoneName(document.getElementById('zone-modal-name').value);
    const governorate = document.getElementById('zone-modal-governorate').value;

    if (!name) {
        showZoneModalError('اكتب اسم المنطقة');
        return;
    }

    if (!governorate) {
        showZoneModalError('اختار المحافظة التابعة لها المنطقة');
        return;
    }

    if (isZoneNameDuplicate(name, id)) {
        showZoneModalError(`المنطقة "${name}" موجودة بالفعل، مينفعش تتكرر`);
        return;
    }

    const saveBtn = document.getElementById('zone-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    try {
        if (!id) {
            await window.db.collection("zones").add({
                name,
                governorate,
                monthlyOrders: 0,
                totalOrders: 0,
                successfulDeliveries: 0,
                totalCollections: 0,
                status: "نشط",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const oldName = zonesData.find(z => z.id === id)?.name || '';
            await window.db.collection("zones").doc(id).update({
                name,
                governorate,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // لو الاسم اتغير نحدّث الأوردرات المرتبطة بالاسم القديم عشان متضيعش
            if (oldName && oldName !== name) {
                await renameZoneInOrders(oldName, name);
            }
        }
        closeZoneModal();
    } catch (err) {
        console.error("خطأ أثناء حفظ المنطقة:", err);
        showZoneModalError('حدث خطأ أثناء الحفظ، حاول مرة أخرى.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ';
    }
}

// تحديث اسم المنطقة داخل الأوردرات (على دفعات)
async function renameZoneInOrders(oldName, newName) {
    const snap = await window.db.collection(ZONES_CFG.ordersCollection)
        .where(ZONES_CFG.orderAreaField, '==', oldName).get();
    if (snap.empty) return;

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
        const batch = window.db.batch();
        docs.slice(i, i + 400).forEach(d => {
            batch.update(d.ref, { [ZONES_CFG.orderAreaField]: newName });
        });
        await batch.commit();
    }
}

// ---------- العرض ----------
function renderZonesTable(data = zonesData) {
    const tableBody = document.getElementById('zones-table-body');
    if (!tableBody) return;

    if (!data.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="p-6 text-center text-slate-400 font-medium">لا توجد مناطق مضافة حتى الآن</td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = data.map(z => {
        const docId = z.id;
        const isActive = z.status !== "موقوف";

        const total = z.totalOrders || 0;
        const success = z.successfulDeliveries || 0;
        const rateNum = total > 0 ? Math.round((success / total) * 100) : 0;

        const govCell = z.governorate
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">${escapeZoneHtml(z.governorate)}</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">غير محدد</span>`;

        return `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                <td class="p-2.5 font-semibold text-slate-800">${escapeZoneHtml(z.name)}</td>
                <td class="p-2.5">${govCell}</td>
                <td class="p-2.5 text-center font-medium text-slate-700">${(z.monthlyOrders || 0).toLocaleString()}</td>
                <td class="p-2.5 text-center font-semibold text-slate-600">${total.toLocaleString()}</td>
                <td class="p-2.5 text-center font-semibold text-emerald-600">${success.toLocaleString()}</td>
                <td class="p-2.5 text-center font-semibold text-slate-800">
                    ${(z.totalCollections || 0).toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">ج.م</span>
                </td>
                <td class="p-2.5 text-center font-bold text-slate-700">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${rateNum >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${rateNum}%
                    </span>
                </td>
                <td class="p-2.5 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                        ${isActive ? 'نشط' : 'موقوف'}
                    </span>
                </td>
                <td class="p-2.5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="toggleZoneStatus('${docId}', '${z.status || 'نشط'}')"
                            class="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="${isActive ? 'إيقاف المنطقة' : 'تفعيل المنطقة'}">
                            <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-circle-check'}"></i>
                        </button>
                        <button onclick="openEditZoneModal('${docId}')"
                            class="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="تعديل المنطقة">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="deleteZone('${docId}')"
                            class="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="حذف المنطقة">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// البحث بالاسم أو المحافظة، والترتيب: المحافظة ثم اسم المنطقة
function filterZonesTable() {
    const q = normalizeZoneName(document.getElementById('zones-search-input')?.value || '');
    const list = q
        ? zonesData.filter(z =>
            normalizeZoneName(z.name).includes(q) ||
            normalizeZoneName(z.governorate).includes(q))
        : zonesData;

    renderZonesTable([...list].sort((a, b) => {
        // المناطق اللي من غير محافظة في الآخر
        if (!a.governorate && b.governorate) return 1;
        if (a.governorate && !b.governorate) return -1;
        const g = compareArabicNames(a.governorate, b.governorate);
        return g !== 0 ? g : compareArabicNames(a.name, b.name);
    }));
}

// ---------- الاستماع اللحظي ----------
function initZonesRealtimeListener() {
    if (!window.db) return;

    window.db.collection("zones").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        zonesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterZonesTable();
    }, (err) => console.error("مزامنة المناطق فشلت:", err));
}

// ---------- تغيير الحالة / الحذف ----------
function toggleZoneStatus(docId, currentStatus) {
    if (!window.db) return;
    const newStatus = currentStatus === "موقوف" ? "نشط" : "موقوف";
    window.db.collection("zones").doc(docId).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("خطأ تغيير حالة المنطقة:", err));
}

function deleteZone(docId) {
    if (!window.db) return;
    const zone = zonesData.find(z => z.id === docId);
    if (confirm(`هل أنت تأكد من حذف منطقة "${zone?.name || ''}" نهائياً؟`)) {
        window.db.collection("zones").doc(docId).delete()
            .catch(err => console.error("خطأ حذف المنطقة:", err));
    }
}

// ==========================================
// 5. إدارة الحالات (Statuses Management) - منفصلة تماماً عن المناطق
// كوليكشن مستقل: statuses
// ==========================================

const STATUSES_CFG = {
    collection: 'statuses',
    ordersCollection: 'orders',
    orderStatusField: 'status'   // الحقل اللي بيخزن الحالة داخل الأوردر
};

let statusesData = [];
let statusOrderCounts = {};   // { اسم الحالة: عدد الأوردرات }

function isStatusNameDuplicate(name, excludeId = '') {
    const n = normalizeZoneName(name);
    return statusesData.some(s => s.id !== excludeId && normalizeZoneName(s.name) === n);
}

// ---------- النافذة (بتتبني تلقائياً) ----------
function ensureStatusModal() {
    if (document.getElementById('status-modal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
    <div id="status-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[9999] p-4" dir="rtl">
        <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 id="status-modal-title" class="text-base font-bold text-slate-800">إضافة حالة جديدة</h4>
                <button type="button" onclick="closeStatusModal()"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>
            <form id="status-modal-form" onsubmit="handleStatusSubmit(event)" class="space-y-3" autocomplete="off">
                <input type="hidden" id="status-modal-id">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">اسم الحالة</label>
                    <input type="text" id="status-modal-name" required placeholder="مثال: تم التسليم"
                        oninput="clearStatusModalError()"
                        class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500">
                    <p id="status-modal-error" class="hidden mt-1.5 text-[11px] font-semibold text-rose-600"></p>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" onclick="closeStatusModal()"
                        class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-colors">إلغاء</button>
                    <button type="submit" id="status-modal-save"
                        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">حفظ</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(wrapper.firstElementChild);

    const modal = document.getElementById('status-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeStatusModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeStatusModal();
    });
}

function showStatusModalError(msg) {
    const el = document.getElementById('status-modal-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearStatusModalError() {
    document.getElementById('status-modal-error')?.classList.add('hidden');
}

function openStatusModal(title, id = '', name = '') {
    ensureStatusModal();
    document.getElementById('status-modal-title').textContent = title;
    document.getElementById('status-modal-id').value = id;
    document.getElementById('status-modal-name').value = name;
    clearStatusModalError();

    const saveBtn = document.getElementById('status-modal-save');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';

    const modal = document.getElementById('status-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        const input = document.getElementById('status-modal-name');
        input.focus();
        input.select();
    }, 50);
}

function openAddStatusModal() {
    openStatusModal('إضافة حالة جديدة');
}

function openEditStatusModal(id) {
    const s = statusesData.find(x => x.id === id);
    if (!s) return;
    openStatusModal('تعديل الحالة', s.id, s.name || '');
}

function closeStatusModal() {
    const modal = document.getElementById('status-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ---------- الحفظ (إضافة / تعديل) ----------
async function handleStatusSubmit(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('status-modal-id').value;
    const name = cleanZoneName(document.getElementById('status-modal-name').value);

    if (!name) {
        showStatusModalError('اكتب اسم الحالة');
        return;
    }
    if (isStatusNameDuplicate(name, id)) {
        showStatusModalError(`الحالة "${name}" موجودة بالفعل، مينفعش تتكرر`);
        return;
    }

    const saveBtn = document.getElementById('status-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    try {
        const col = window.db.collection(STATUSES_CFG.collection);
        if (!id) {
            await col.add({
                name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const oldName = statusesData.find(s => s.id === id)?.name || '';
            await col.doc(id).update({
                name,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // لو الاسم اتغير نحدّث الأوردرات اللي عليها الحالة القديمة
            if (oldName && oldName !== name) {
                await renameStatusInOrders(oldName, name);
            }
        }
        closeStatusModal();
    } catch (err) {
        console.error("خطأ أثناء حفظ الحالة:", err);
        showStatusModalError('حدث خطأ أثناء الحفظ، حاول مرة أخرى.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ';
    }
}

async function renameStatusInOrders(oldName, newName) {
    const field = STATUSES_CFG.orderStatusField;
    const snap = await window.db.collection(STATUSES_CFG.ordersCollection)
        .where(field, '==', oldName).get();
    if (snap.empty) return;

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
        const batch = window.db.batch();
        docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { [field]: newName }));
        await batch.commit();
    }
}

// ---------- العرض (ترتيب أبجدي) ----------
function renderStatusesTable() {
    const tbody = document.getElementById('statuses-table-body');
    if (!tbody) return;

    if (!statusesData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-slate-400 font-medium">لا توجد حالات مضافة حتى الآن</td>
            </tr>`;
        return;
    }

    const sorted = [...statusesData].sort((a, b) => compareArabicNames(a.name, b.name));

    tbody.innerHTML = sorted.map(s => `
        <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
            <td class="p-2.5 font-semibold text-slate-800">${escapeZoneHtml(s.name)}</td>
            <td class="p-2.5 text-center font-semibold text-slate-600">${(statusOrderCounts[s.name] || 0).toLocaleString()}</td>
            <td class="p-2.5 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="openEditStatusModal('${s.id}')"
                        class="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="تعديل الاسم">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="deleteStatus('${s.id}')"
                        class="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="حذف الحالة">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function deleteStatus(id) {
    if (!window.db) return;
    const s = statusesData.find(x => x.id === id);
    const used = statusOrderCounts[s?.name] || 0;
    const warn = used > 0 ? `\nتنبيه: فيه ${used} أوردر عليهم الحالة دي.` : '';
    if (confirm(`هل أنت تأكد من حذف حالة "${s?.name || ''}" نهائياً؟${warn}`)) {
        window.db.collection(STATUSES_CFG.collection).doc(id).delete()
            .catch(err => console.error("خطأ حذف الحالة:", err));
    }
}

// ---------- الاستماع اللحظي ----------
function initStatusesRealtimeListener() {
    if (!window.db) return;

    window.db.collection(STATUSES_CFG.collection).orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        statusesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderStatusesTable();
    }, (err) => console.error("مزامنة الحالات فشلت:", err));

    // عدّاد الأوردرات لكل حالة
    window.db.collection(STATUSES_CFG.ordersCollection).onSnapshot((snapshot) => {
        const counts = {};
        snapshot.forEach(doc => {
            const st = doc.data()[STATUSES_CFG.orderStatusField];
            if (st) counts[st] = (counts[st] || 0) + 1;
        });
        statusOrderCounts = counts;
        renderStatusesTable();
    }, (err) => console.error("عدّ الأوردرات فشل:", err));
}





// ==========================================
// 6. الإعدادات العامة (اسم الشركة / اللوجو)
// كوليكشن: settings  |  المستند: يعتمد على الحساب (حالياً 'general')
// ==========================================

const GENERAL_SETTINGS_CFG = {
    collection: 'settings',
    cacheKey: 'generalSettingsCache',
    logoMaxSize: 256
};

let generalSettings = { companyName: '', logo: '' };
let generalDirty = false;
let pendingLogo = null; // null = بدون تغيير | '' = حذف | dataURL = لوجو جديد

// لما تعمل تسجيل الدخول: ارجع هنا uid / accountId للحساب الأساسي بدل 'general'
function getGeneralSettingsDocId() {
    return 'general';
}

function getGeneralSettingsRef() {
    return window.db.collection(GENERAL_SETTINGS_CFG.collection).doc(getGeneralSettingsDocId());
}

function markGeneralDirty() {
    generalDirty = true;
}

// تطبيق القيم على الهيدر
function applyGeneralSettingsToHeader(s) {
    const nameEl = document.getElementById('header-company-name');
    const logoEl = document.getElementById('header-company-logo');
    const fallbackEl = document.getElementById('header-company-logo-fallback');

    if (nameEl && s.companyName) nameEl.textContent = s.companyName;

    if (logoEl && fallbackEl) {
        if (s.logo) {
            logoEl.src = s.logo;
            logoEl.classList.remove('hidden');
            fallbackEl.classList.add('hidden');
        } else {
            logoEl.removeAttribute('src');
            logoEl.classList.add('hidden');
            fallbackEl.classList.remove('hidden');
        }
    }

    if (s.companyName) document.title = s.companyName;
}
function setLogoPreview(src) {
    const img = document.getElementById('general-logo-preview');
    const ph = document.getElementById('general-logo-placeholder');
    if (!img || !ph) return;
    if (src) {
        img.src = src;
        img.classList.remove('hidden');
        ph.classList.add('hidden');
    } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
        ph.classList.remove('hidden');
    }
}

function fillGeneralSettingsForm(s) {
    const n = document.getElementById('general-company-name');
    if (n) n.value = s.companyName || '';
    setLogoPreview(s.logo || '');
}

function showGeneralMsg(text, ok = true) {
    const el = document.getElementById('general-settings-msg');
    if (!el) return;
    el.textContent = text;
    el.className = `text-[11px] font-semibold ${ok ? 'text-emerald-600' : 'text-rose-600'}`;
    setTimeout(() => el.classList.add('hidden'), 3000);
}

// تصغير الصورة قبل الحفظ (Firestore حده 1MB للمستند)
function resizeImageToDataURL(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
                const w = Math.round(img.width * ratio);
                const h = Math.round(img.height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleLogoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showGeneralMsg('اختار ملف صورة فقط', false);
        return;
    }
    try {
        pendingLogo = await resizeImageToDataURL(file, GENERAL_SETTINGS_CFG.logoMaxSize);
        setLogoPreview(pendingLogo);
        markGeneralDirty();
    } catch (err) {
        console.error('خطأ في قراءة الصورة:', err);
        showGeneralMsg('تعذر قراءة الصورة', false);
    }
}

function removeGeneralLogo() {
    pendingLogo = '';
    setLogoPreview('');
    markGeneralDirty();
}

async function handleGeneralSettingsSubmit(e) {
    e.preventDefault();
    if (!window.db) return;

    const companyName = cleanZoneName(document.getElementById('general-company-name').value);
    if (!companyName) {
        showGeneralMsg('اكتب اسم الشركة', false);
        return;
    }

    const payload = {
        companyName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (pendingLogo !== null) payload.logo = pendingLogo;

    const btn = document.getElementById('general-save-btn');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';

    try {
        await getGeneralSettingsRef().set(payload, { merge: true });
        pendingLogo = null;
        generalDirty = false;
        showGeneralMsg('تم حفظ الإعدادات ✓');
    } catch (err) {
        console.error('خطأ أثناء حفظ الإعدادات العامة:', err);
        showGeneralMsg('حدث خطأ أثناء الحفظ، حاول مرة أخرى', false);
    } finally {
        btn.disabled = false;
        btn.textContent = 'حفظ الإعدادات';
    }
}

function initGeneralSettings() {
    // تطبيق النسخة المخزنة محلياً فوراً لتفادي وميض الاسم القديم
    try {
        const cached = JSON.parse(localStorage.getItem(GENERAL_SETTINGS_CFG.cacheKey) || 'null');
        if (cached) {
            generalSettings = cached;
            applyGeneralSettingsToHeader(cached);
            fillGeneralSettingsForm(cached);
        }
    } catch (_) { /* تجاهل */ }

    if (!window.db) return;

    getGeneralSettingsRef().onSnapshot((doc) => {
        if (!doc.exists) return;
        generalSettings = { companyName: '', logo: '', ...doc.data() };
        applyGeneralSettingsToHeader(generalSettings);
        if (!generalDirty) fillGeneralSettingsForm(generalSettings);
        try {
            localStorage.setItem(GENERAL_SETTINGS_CFG.cacheKey, JSON.stringify({
                companyName: generalSettings.companyName,
                logo: generalSettings.logo
            }));
        } catch (_) { /* لو الصورة كبيرة على الـ quota */ }
    }, (err) => console.error('مزامنة الإعدادات العامة فشلت:', err));
}






// ==========================================
// 7. التحكم في أعمدة تطبيقات المتابعه والمندوب
// kinds: header (عنوان الكارت) | fields (التفاصيل) | edit (الحقول القابلة للتعديل)
// ==========================================
let appFieldsCfg = {};

function appFieldsRef() {
    return window.db.collection('settings').doc('appsFields');
}

function appCfgKey(app, kind) {
    if (kind === 'header') return app + 'Header';
    if (kind === 'edit') return app + 'Edit';
    return app;
}

function appFieldEnabled(app, kind, key) {
    const list = appFieldsCfg[appCfgKey(app, kind)];
    if (Array.isArray(list)) return list.includes(key);
    if (kind === 'header') return (window.APPS_HEADER_DEFAULT || []).includes(key);
    if (kind === 'edit') return ((window.APPS_EDIT_DEFAULT || {})[app] || []).includes(key);
    return true;
}

function appDefsFor(kind) {
    if (kind === 'header') return window.APPS_HEADER_DEFS || [];
    if (kind === 'edit') return window.APPS_EDIT_DEFS || [];
    return window.APPS_FIELD_DEFS || [];
}


function appOrderList(app) {
    const keys = (window.APPS_FIELD_DEFS || []).map(f => f.key);
    const saved = appFieldsCfg[app + 'Order'];
    const ord = Array.isArray(saved) ? saved.filter(k => keys.includes(k)) : [];
    keys.forEach(k => { if (!ord.includes(k)) ord.push(k); });
    return ord;
}

function renderAppOrderSettings() {
    const defs = window.APPS_FIELD_DEFS || [];
    const label = (k) => (defs.find(f => f.key === k) || {}).label || k;
    ['follow', 'courier'].forEach(app => {
        const box = document.getElementById(`app-order-${app}`);
        if (!box) return;
        const ord = appOrderList(app);
        box.innerHTML = ord.map((k, i) => `
            <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700">
                <span class="w-5 text-slate-400">${i + 1}</span>
                <span class="flex-1">${label(k)}</span>
                <button type="button" onclick="moveAppField('${app}','${k}',-1)" ${i === 0 ? 'disabled' : ''}
                    class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↑</button>
                <button type="button" onclick="moveAppField('${app}','${k}',1)" ${i === ord.length - 1 ? 'disabled' : ''}
                    class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↓</button>
            </div>`).join('');
    });
}

async function moveAppField(app, key, dir) {
    const ord = appOrderList(app);
    const i = ord.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    const ck = app + 'Order';
    appFieldsCfg[ck] = ord;
    renderAppOrderSettings();
    try {
        await appFieldsRef().set({ [ck]: ord }, { merge: true });
    } catch (err) {
        console.error('خطأ حفظ الترتيب:', err);
        alert('تعذر حفظ الترتيب');
    }
}


function renderAppFieldsSettings() {
    ['follow', 'courier'].forEach(app => {
        ['header', 'fields', 'edit'].forEach(kind => {
            const box = document.getElementById(`app-${kind}-${app}`);
            if (!box) return;
            box.innerHTML = appDefsFor(kind).map(f => `
                <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4 accent-emerald-600"
                        ${appFieldEnabled(app, kind, f.key) ? 'checked' : ''}
                        onchange="toggleAppField('${app}', '${kind}', '${f.key}', this.checked)">
                    ${f.label}
                </label>`).join('');
        });
    });

    renderAppOrderSettings();
}

async function toggleAppField(app, kind, key, checked) {
    const all = appDefsFor(kind).map(f => f.key);
    const next = all.filter(k => k === key ? checked : appFieldEnabled(app, kind, k));
    const ck = appCfgKey(app, kind);
    appFieldsCfg[ck] = next;
    try {
        await appFieldsRef().set({ [ck]: next }, { merge: true });
    } catch (err) {
        console.error('خطأ حفظ أعمدة التطبيق:', err);
        alert('تعذر حفظ التغيير');
    }
}

function initAppFieldsSettings() {
    renderAppFieldsSettings();
    appFieldsRef().onSnapshot((doc) => {
        appFieldsCfg = doc.exists ? doc.data() : {};
        renderAppFieldsSettings();
    }, (err) => console.error('مزامنة أعمدة التطبيقات فشلت:', err));
}

// ==========================================
// تهيئة التشغيل والمزامنة العامة
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    // طبّق النسخة المخزنة محلياً فوراً (قبل ما Firebase يجهز)
    try {
        const cached = JSON.parse(localStorage.getItem(GENERAL_SETTINGS_CFG.cacheKey) || 'null');
        if (cached) {
            applyGeneralSettingsToHeader(cached);
            fillGeneralSettingsForm(cached);
        }
    } catch (_) { /* تجاهل */ }

    const checkDb = setInterval(() => {
        if (window.db) {
            clearInterval(checkDb);
            listenToOffices();
            initGovernoratesListener();
            initZonesRealtimeListener();
            initStatusesRealtimeListener();
            initGeneralSettings();   // ← ده كان ناقص
            initAppFieldsSettings();
        }
    }, 100);
});