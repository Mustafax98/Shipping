// ==========================================
// 1. نظام إدارة التحديد المتقدم (Single, Multi Ctrl, Range Shift, Drag)
// ==========================================
let selectedCells = new Set(); // يحتفظ بالخلايا المحددة حالياً (docId_fieldName)
let lastSelectedCell = null;   // الخلية الأخيرة المحددة كمرجع للـ Shift
// ===== وضع التعديل والتنقل بين الخلايا =====
let editingEl = null;   // الخلية المفتوحة للتعديل حالياً

function enterEditMode(el) {
    if (!el) return;
    if (editingEl && editingEl !== el) exitEditMode();
    editingEl = el;
    el.classList.add('cell-editing');
    if (el.tagName === 'INPUT') {
        el.readOnly = false;
        el.focus();
        try { const n = el.value.length; el.setSelectionRange(n, n); } catch (_) { }
    } else {
        el.focus();
        try { el.showPicker && el.showPicker(); } catch (_) { }
    }
}

function exitEditMode() {
    if (!editingEl) return;
    const el = editingEl;
    editingEl = null;
    el.classList.remove('cell-editing');
    if (el.tagName === 'INPUT') el.readOnly = true;
}

function selectSingleCell(el) {
    selectedCells.clear();
    selectedCells.add(`${el.dataset.doc}_${el.dataset.field}`);
    lastSelectedCell = { docId: el.dataset.doc, fieldName: el.dataset.field, element: el };
    updateCellVisuals();
    el.focus();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function getCellGrid() {
    return Array.from(document.querySelectorAll('#excel-body tr'))
        .filter(tr => tr.style.display !== 'none')
        .map(tr => Array.from(tr.querySelectorAll('[data-doc][data-field]')))
        .filter(r => r.length);
}

function moveFrom(el, dRow, dCol, edit = false, wrap = false) {
    const grid = getCellGrid();
    let r = grid.findIndex(row => row.includes(el));
    if (r < 0) return;
    let c = grid[r].indexOf(el) + dCol;
    r += dRow;
    if (wrap) {
        if (c >= grid[r].length) { r++; c = 0; }
        else if (c < 0) { r--; c = r >= 0 ? grid[r].length - 1 : 0; }
    }
    if (r < 0 || r >= grid.length) return;
    c = Math.max(0, Math.min(c, grid[r].length - 1));
    exitEditMode();
    const target = grid[r][c];
    selectSingleCell(target);
    if (edit) enterEditMode(target);
}

// تحديث الشكل البصري للخلايا المحددة
function updateCellVisuals() {
    document.querySelectorAll('[data-doc][data-field]').forEach(input => {
        const cellKey = `${input.dataset.doc}_${input.dataset.field}`;
        if (selectedCells.has(cellKey)) {
            input.classList.add('cell-selected');
        } else {
            input.classList.remove('cell-selected');
        }
    });
}


window.addEventListener('DOMContentLoaded', () => {
    const checkDb = setInterval(() => {
        if (window.db) {
            clearInterval(checkDb);
            Promise.all([
                listenOfficesForOrders(),
                listenStatusesForOrders(),
                listenZonesForOrders(),
                listenCouriersForOrders(),
                listenStaffForOrders()
            ]).then(() => listenToOrders());

        }
    }, 100);
});

// تفريغ كافة التحديدات
function clearSelection() {
    selectedCells.clear();
    updateCellVisuals();
}

// دالة التعامل مع الضغط والماوس على الخلايا
let isMouseDown = false;

function handleCellMouseDown(event, docId, fieldName) {
    // الضغط جوه الخلية المفتوحة للتعديل: سيبها (تحريك المؤشر بس)
    if (event.target === editingEl) return;

    // أي خلية تانية: اقفل التعديل السابق
    exitEditMode();

    // القوائم المنسدلة: متفتحش بضغطة واحدة، بس تتحدد
    if (event.target.tagName === 'SELECT') {
        event.preventDefault();
        event.target.focus();
    }

    const cellKey = `${docId}_${fieldName}`;

    if (event.ctrlKey || event.metaKey) {
        if (selectedCells.has(cellKey)) {
            selectedCells.delete(cellKey);
        } else {
            selectedCells.add(cellKey);
        }
        lastSelectedCell = { docId, fieldName, element: event.target };
    } else if (event.shiftKey && lastSelectedCell) {
        selectRange(lastSelectedCell, { docId, fieldName, element: event.target });
    } else {
        selectedCells.clear();
        selectedCells.add(cellKey);
        lastSelectedCell = { docId, fieldName, element: event.target };
    }

    isMouseDown = true;
    updateCellVisuals();
}
// التعامل مع السحب بالماوس (Mouse Drag)
function handleCellMouseEnter(event, docId, fieldName) {
    if (!isMouseDown) return;

    // عند السحب بالماوس نقوم بالتحديد من خلية البداية إلى الخلية الحالية
    if (lastSelectedCell) {
        selectRange(lastSelectedCell, { docId, fieldName, element: event.target });
        updateCellVisuals();
    }
}

window.addEventListener('mouseup', () => {
    isMouseDown = false;
});

// دالة تحديد مدى بين خليتين (Shift / Drag)
function selectRange(startCell, endCell) {
    const allInputs = Array.from(document.querySelectorAll('#excel-body [data-doc][data-field]'));

    // إيجاد ترتيب الأسطر والأعمدة
    const startRow = startCell.element.closest('tr').rowIndex;
    const endRow = endCell.element.closest('tr').rowIndex;

    const startCol = startCell.element.closest('td').cellIndex;
    const endCol = endCell.element.closest('td').cellIndex;

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    if (!event.ctrlKey) {
        selectedCells.clear();
    }

    allInputs.forEach(input => {
        const td = input.closest('td');
        const tr = input.closest('tr');
        const rIndex = tr.rowIndex;
        const cIndex = td.cellIndex;

        if (rIndex >= minRow && rIndex <= maxRow && cIndex >= minCol && cIndex <= maxCol) {
            const key = `${input.dataset.doc}_${input.dataset.field}`;
            selectedCells.add(key);
        }
    });
}

// مسح محتوى كل الخلايا المحددة عند الضغط على Delete
function handleKeyDown(event, docId, fieldName, isNumber = false) {
    if (event.ctrlKey || event.metaKey || event.altKey) return; // سيب الاختصارات (Ctrl+C / Z / Y)

    const el = event.target;
    const editing = editingEl === el;
    const isSelect = el.tagName === 'SELECT';

    switch (event.key) {
        case 'Enter':
            if (editing && isSelect) return;      // سيبه يختار من القائمة
            event.preventDefault();
            editing ? exitEditMode() : enterEditMode(el);
            return;

        case 'Escape':
            if (editing) { event.preventDefault(); exitEditMode(); }
            return;

        case 'Tab':
            event.preventDefault();
            // لو بتعدّل: الخلية اللي بعدها تتفتح للتعديل
            moveFrom(el, 0, event.shiftKey ? -1 : 1, editing, true);
            return;

        case 'ArrowUp':
        case 'ArrowDown':
            if (editing && isSelect) return;      // اختيار من القائمة المفتوحة
            event.preventDefault();
            moveFrom(el, event.key === 'ArrowUp' ? -1 : 1, 0);
            return;

        case 'ArrowRight':
        case 'ArrowLeft':
            event.preventDefault();
            // الصفحة RTL: يمين = العمود السابق، يسار = العمود التالي
            moveFrom(el, 0, event.key === 'ArrowRight' ? -1 : 1);
            return;

        case 'Delete':
            if (editing) return;                  // أثناء التعديل: حذف حروف عادي
            event.preventDefault();
            if (selectedCells.size > 0) {
                selectedCells.forEach(cellKey => {
                    const i = cellKey.indexOf('_');
                    const dId = cellKey.slice(0, i), fName = cellKey.slice(i + 1);
                    const inputEl = document.querySelector(`[data-doc="${dId}"][data-field="${fName}"]`);
                    if (inputEl) {
                        const oldValue = inputEl.value;
                        const num = inputEl.type === 'number';
                        inputEl.value = "";
                        recordHistoryAction(dId, fName, oldValue, "", num);
                        autoSaveField(dId, fName, "", num, false);
                    }
                });
            }
            return;
    }
}

// ==========================================
// 2. نظام إدارة السجل للتراجع والإعادة (Undo / Redo)
// ==========================================
let undoStack = [];
let redoStack = [];
let debounceTimers = {};
let officesList = [];

function updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function recordHistoryAction(docId, fieldName, oldValue, newValue, isNumber = false) {
    if (oldValue === newValue) return;
    undoStack.push({ docId, fieldName, oldValue, newValue, isNumber });
    redoStack = [];
    updateHistoryButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    const lastAction = undoStack.pop();
    redoStack.push(lastAction);
    updateHistoryButtons();
    applyValueToFieldAndDb(lastAction.docId, lastAction.fieldName, lastAction.oldValue, lastAction.isNumber);
}

function redo() {
    if (redoStack.length === 0) return;
    const actionToRedo = redoStack.pop();
    undoStack.push(actionToRedo);
    updateHistoryButtons();
    applyValueToFieldAndDb(actionToRedo.docId, actionToRedo.fieldName, actionToRedo.newValue, actionToRedo.isNumber);
}

function applyValueToFieldAndDb(docId, fieldName, value, isNumber) {
    const inputElement = document.querySelector(`[data-doc="${docId}"][data-field="${fieldName}"]`);
    if (inputElement) {
        inputElement.value = value;
    }
    autoSaveField(docId, fieldName, value, isNumber, false);
}

// اختصارات اللوحة (Ctrl+Z / Ctrl+Y)
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
            e.preventDefault();
            redo();
        } else {
            e.preventDefault();
            undo();
        }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    }
});

// ==========================================
// 3. باقي الدوال الأساسية واستماع الجدول
// ==========================================
let tempOldValue = "";
function handleFocus(event) {
    tempOldValue = event.target.value;
}

function handleBlur(event, docId, fieldName, isNumber = false) {
    const newValue = event.target.value;
    if (tempOldValue !== newValue) {
        recordHistoryAction(docId, fieldName, tempOldValue, newValue, isNumber);
    }
    if (editingEl === event.target) exitEditMode();
}

// ==========================================
// دالة إضافة أوردر جديد فارغ والتركيز عليه
// ==========================================
async function addNewBlankRowAndFocus() {
    if (!window.db) {
        alert("خطأ: لم يتم الاتصال بقاعدة البيانات");
        return;
    }

    try {
        // إنشاء مستند جديد بقيم فارغة في الفايربيز
        const docRef = await window.db.collection("orders").add({
            orderId: "",
            customerName: "",
            phone: "",
            altPhone: "",
            returns: "",
            status: "جديد",
            total: "",
            collected: "",
            quantity: "",
            closingNote: "",
            recycling: "",
            employee: "",
            employeeNote: "",
            officeName: "",
            companyName: "",
            officeNote: "",
            area: "",
            rider: "",
            riderNote: "",
            address: "",
            extraNumber: "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // الانتقال والتركيز على الخلية الأولى للسطر الجديد تحديداً
        setTimeout(() => {
            const firstInput = document.querySelector(`[data-doc="${docRef.id}"][data-field="orderId"]`);
            if (firstInput) {
                clearSelection(); // إلغاء تحديد الخلايا القديمة

                // تحديد الخلية الجديدة
                const cellKey = `${docRef.id}_orderId`;
                selectedCells.add(cellKey);
                lastSelectedCell = { docId: docRef.id, fieldName: 'orderId', element: firstInput };
                updateCellVisuals();

                firstInput.focus();
            }
        }, 300);

    } catch (error) {
        console.error("خطأ أثناء إضافة أوردر جديد:", error);
        alert("حدث خطأ أثناء إضافة صف جديد.");
    }
}

let allOfficesList = [];

function escOpt(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// قائمة المكاتب النشطة + المكتب الحالي للأوردر (لو موقوف يفضل ظاهر بعلامة)
function buildOfficeOptions(current = '') {
    const names = officesList.map(o => o.name);
    let html = `<option value=""></option>`;
    if (current && !names.includes(current)) {
        const known = allOfficesList.some(o => o.name === current);
        html += `<option value="${escOpt(current)}" selected>${escOpt(current)}${known ? ' (متوقف)' : ''}</option>`;
    }
    html += officesList.map(o =>
        `<option value="${escOpt(o.name)}" ${o.name === current ? 'selected' : ''}>${escOpt(o.name)}</option>`
    ).join('');
    return html;
}

// تحديث القوائم الموجودة في الجدول بدون إعادة رسمه
function refreshOfficeSelects() {
    document.querySelectorAll('select[data-field="officeName"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildOfficeOptions(cur);
        sel.value = cur;
    });
}
// ==========================================
// الحالات والمناطق من الإعدادات (Firebase)
// ==========================================
let orderStatusesList = [];   // من كوليكشن statuses
let allZonesList = [];        // كل المناطق من كوليكشن zones
let orderZonesList = [];      // المناطق النشطة فقط

// بيبني خيارات القائمة، ولو القيمة الحالية مش موجودة في الإعدادات بتفضل ظاهرة (مش بتضيع)
function buildListOptions(names, current = '', unknownLabel = '') {
    let html = `<option value=""></option>`;
    if (current && !names.includes(current)) {
        html += `<option value="${escOpt(current)}" selected>${escOpt(current)}${unknownLabel}</option>`;
    }
    html += names.map(n =>
        `<option value="${escOpt(n)}" ${n === current ? 'selected' : ''}>${escOpt(n)}</option>`
    ).join('');
    return html;
}

function buildStatusOptions(current = '') {
    return buildListOptions(orderStatusesList.map(s => s.name), current, ' (غير مضافة)');
}

function buildZoneOptions(current = '') {
    const known = allZonesList.some(z => z.name === current);
    return buildListOptions(orderZonesList.map(z => z.name), current, known ? ' (متوقفة)' : ' (غير مسجلة)');
}

function refreshStatusSelects() {
    document.querySelectorAll('select[data-field="status"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildStatusOptions(cur);
        sel.value = cur;
    });
}

function refreshZoneSelects() {
    document.querySelectorAll('select[data-field="area"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildZoneOptions(cur);
        sel.value = cur;
    });
}
function riderForOrder(area, fallback) {
    const z = allZonesList.find(z => z.name === area);
    return (z && z.courier) || fallback || '';
}

function buildRiderCell(docId, data) {
    return `<td class="py-1 px-2">
        <span data-rider-doc="${docId}" data-rider-fallback="${escOpt(data.rider || '')}"
            class="block w-full text-center bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700 select-none">${escOpt(riderForOrder(data.area, data.rider))}</span>
    </td>`;
}

function refreshRiderCells() {
    document.querySelectorAll('[data-rider-doc]').forEach(sp => {
        const row = sp.closest('tr');
        const areaSel = row ? row.querySelector('select[data-field="area"]') : null;
        sp.textContent = riderForOrder(areaSel ? areaSel.value : '', sp.dataset.riderFallback);
    });
}

function listenStatusesForOrders() {
    return new Promise(resolve => {
        if (!window.db) return resolve();
        let first = true;
        window.db.collection("statuses").onSnapshot((snapshot) => {
            orderStatusesList = snapshot.docs
                .map(doc => ({ id: doc.id, name: String(doc.data().name || '').trim() }))
                .filter(s => s.name)
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            refreshStatusSelects();
            if (first) { first = false; resolve(); }
        }, (err) => {
            console.error("خطأ جلب الحالات:", err);
            if (first) { first = false; resolve(); }
        });
    });
}

function listenZonesForOrders() {
    return new Promise(resolve => {
        if (!window.db) return resolve();
        let first = true;
        window.db.collection("zones").onSnapshot((snapshot) => {
            allZonesList = snapshot.docs.map(doc => ({
                id: doc.id,
                name: String(doc.data().name || '').trim(),
                courier: String(doc.data().courier || '').trim(),
                active: doc.data().status !== "موقوف"
            })).filter(z => z.name);
            orderZonesList = allZonesList
                .filter(z => z.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            refreshZoneSelects();
            refreshRiderCells();
            if (first) { first = false; resolve(); }
        }, (err) => {
            console.error("خطأ جلب المناطق:", err);
            if (first) { first = false; resolve(); }
        });
    });
}

// ==========================================
// المناديب والموظفين (المتابعه) من الإعدادات (Firebase)
// ==========================================
const LIST_CFG = {
    couriersCollection: 'couriers',   // ← غيّرها لو اسم الكوليكشن مختلف
    staffCollection: 'staff'          // ← غيّرها لو اسم الكوليكشن مختلف
};

let allCouriersList = [];
let orderCouriersList = [];   // النشطين فقط
let allStaffList = [];
let orderStaffList = [];      // النشطين فقط

// نشط = مش موقوف (يدعم الشكلين: active:false أو status:"موقوف")
const isListItemActive = d => d.active !== false && d.status !== 'موقوف';

function buildCourierOptions(current = '') {
    const known = allCouriersList.some(c => c.name === current);
    return buildListOptions(orderCouriersList.map(c => c.name), current, known ? ' (متوقف)' : ' (غير مسجل)');
}

function buildStaffOptions(current = '') {
    const known = allStaffList.some(s => s.name === current);
    return buildListOptions(orderStaffList.map(s => s.name), current, known ? ' (متوقف)' : ' (غير مسجل)');
}

function refreshCourierSelects() {
    document.querySelectorAll('select[data-field="rider"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildCourierOptions(cur);
        sel.value = cur;
    });
}

function refreshStaffSelects() {
    document.querySelectorAll('select[data-field="employee"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildStaffOptions(cur);
        sel.value = cur;
    });
}

function listenCouriersForOrders() {
    return new Promise(resolve => {
        if (!window.db) return resolve();
        let first = true;
        window.db.collection(LIST_CFG.couriersCollection).onSnapshot((snapshot) => {
            allCouriersList = snapshot.docs.map(doc => ({
                id: doc.id,
                name: String(doc.data().name || '').trim(),
                active: isListItemActive(doc.data())
            })).filter(c => c.name);
            orderCouriersList = allCouriersList
                .filter(c => c.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            refreshCourierSelects();
            if (first) { first = false; resolve(); }
        }, (err) => {
            console.error("خطأ جلب المناديب:", err);
            if (first) { first = false; resolve(); }
        });
    });
}

function listenStaffForOrders() {
    return new Promise(resolve => {
        if (!window.db) return resolve();
        let first = true;
        window.db.collection(LIST_CFG.staffCollection).onSnapshot((snapshot) => {
            allStaffList = snapshot.docs.map(doc => ({
                id: doc.id,
                name: String(doc.data().name || '').trim(),
                active: isListItemActive(doc.data())
            })).filter(s => s.name);
            orderStaffList = allStaffList
                .filter(s => s.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            refreshStaffSelects();
            if (first) { first = false; resolve(); }
        }, (err) => {
            console.error("خطأ جلب الموظفين:", err);
            if (first) { first = false; resolve(); }
        });
    });
}

// استماع لحظي للمكاتب (بيرجع Promise بتتحل عند أول تحميل)
function listenOfficesForOrders() {
    return new Promise(resolve => {
        if (!window.db) return resolve();
        let first = true;
        window.db.collection("offices").onSnapshot((snapshot) => {
            allOfficesList = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || doc.data().officeName || doc.id,
                active: doc.data().active !== false
            }));
            officesList = allOfficesList
                .filter(o => o.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            refreshOfficeSelects();
            if (first) { first = false; resolve(); }
        }, (err) => {
            console.error("خطأ جلب المكاتب:", err);
            if (first) { first = false; resolve(); }
        });
    });
}

function listenToOrders() {
    if (!window.db) return;

    window.db.collection("orders").onSnapshot((snapshot) => {
        const tableBody = document.getElementById('excel-body');
        if (!tableBody) return;

        const openDocs = snapshot.docs.filter(d => d.data().closed !== true);
        if (!openDocs.length) {
            tableBody.innerHTML = `<tr><td colspan="22" class="py-8 text-center text-slate-400">لا توجد أوردرات مسجلة</td></tr>`;
            return;
        }

        const inputClass = "w-full text-center bg-white border border-slate-300 rounded px-1.5 py-1 text-xs focus:outline-none transition-all select-none";

        let rowsHTML = '';
        const sortedDocs = [...openDocs].sort((a, b) =>
            (b.data().createdAt?.seconds ?? 0) - (a.data().createdAt?.seconds ?? 0));

        sortedDocs.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;

            const buildCell = (field, value, isNum = false) => `
                <td class="py-1 px-2">
                    <input type="${isNum ? 'number' : 'text'}" data-doc="${docId}" data-field="${field}" value="${escOpt(value ?? '')}" readonly
                        onmousedown="handleCellMouseDown(event, '${docId}', '${field}')"
                        onmouseenter="handleCellMouseEnter(event, '${docId}', '${field}')"
                        ondblclick="enterEditMode(this)"
                        onfocus="handleFocus(event)" 
                        onblur="handleBlur(event, '${docId}', '${field}', ${isNum})" 
                        onkeydown="handleKeyDown(event, '${docId}', '${field}', ${isNum})" 
                        oninput="autoSaveField('${docId}', '${field}', this.value, ${isNum})" 
                        class="${inputClass}">
                </td>`;

            // قائمة منسدلة عامة (حالة / مكتب / منطقة)
            const buildSelect = (field, optionsHTML) => `
                <td class="py-1 px-2">
                    <select data-doc="${docId}" data-field="${field}" 
                        onmousedown="handleCellMouseDown(event, '${docId}', '${field}')"
                        ondblclick="enterEditMode(this)"
                        onfocus="handleFocus(event)" 
                        onblur="if (editingEl === this) exitEditMode()"
                        onkeydown="handleKeyDown(event, '${docId}', '${field}', false)"
                        onchange="recordHistoryAction('${docId}', '${field}', tempOldValue, this.value); autoSaveField('${docId}', '${field}', this.value); exitEditMode()" 
                        class="${inputClass}">
                        ${optionsHTML}
                    </select>
                </td>`;

            rowsHTML += `
                <tr id="row-${docId}" class="hover:bg-slate-50 border-b border-slate-200">
                    ${buildCell('orderId', data.orderId)}
                    ${buildCell('customerName', data.customerName)}
                    ${buildCell('phone', data.phone)}
                    ${buildCell('altPhone', data.altPhone)}
                    ${buildCell('returns', data.returns)}
                    ${buildSelect('status', buildStatusOptions(data.status || ''))}
                    ${buildCell('total', data.total, true)}
                    ${buildCell('collected', data.collected, true)}
                    ${buildCell('quantity', data.quantity, true)}
                    ${buildCell('closingNote', data.closingNote)}
                    ${buildCell('recycling', data.recycling)}
                    ${buildSelect('employee', buildStaffOptions(data.employee || ''))}                    ${buildCell('employeeNote', data.employeeNote)}
                    ${buildSelect('officeName', buildOfficeOptions(data.officeName || ''))}
                    ${buildCell('companyName', data.companyName)}
                    ${buildCell('officeNote', data.officeNote)}
                    ${buildSelect('area', buildZoneOptions(data.area || ''))}
                    ${buildRiderCell(docId, data)}                    
                    ${buildCell('riderNote', data.riderNote)}
                    ${buildCell('address', data.address)}
                    ${buildCell('extraNumber', data.extraNumber, true)}
                    <td class="py-2 px-2 text-center flex items-center justify-center gap-1.5">
                        <span id="sync-icon-${docId}" class="text-xs text-slate-400"><i class="fa-solid fa-cloud"></i></span>
                        <button onclick="removeRow('${docId}')" class="text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        const prev = document.activeElement;
        const keep = (prev && prev.dataset && prev.dataset.doc)
            ? { doc: prev.dataset.doc, field: prev.dataset.field, edit: editingEl === prev }
            : null;
        editingEl = null;

        tableBody.innerHTML = rowsHTML;
        updateCellVisuals();

        if (keep) {
            const el = document.querySelector(`[data-doc="${keep.doc}"][data-field="${keep.field}"]`);
            if (el) { el.focus(); if (keep.edit) enterEditMode(el); }
        }
        renderTable();
    }, (err) => {
        console.error("فشل تحميل الأوردرات:", err);
        const tableBody = document.getElementById('excel-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="22" class="py-8 text-center text-rose-500 text-xs">تعذر تحميل الأوردرات: ${err.code || ''} ${err.message || ''}</td></tr>`;
        }
    });
}
// ==========================================
// البحث في الجدول (خانة البحث بتنادي renderTable)
// ==========================================
function renderTable() {
    const q = (document.getElementById('table-search-input')?.value || '').toLowerCase().trim();
    document.querySelectorAll('#excel-body tr').forEach(tr => {
        if (!q) { tr.style.display = ''; return; }
        const text = Array.from(tr.querySelectorAll('input, select'))
            .map(el => el.value || '').join(' ').toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
    });
}

function autoSaveField(docId, fieldName, value, isNumber = false, recordHistory = true) {
    const syncIcon = document.getElementById(`sync-icon-${docId}`);
    if (syncIcon) syncIcon.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-amber-500"></i>`;

    clearTimeout(debounceTimers[`${docId}_${fieldName}`]);
    debounceTimers[`${docId}_${fieldName}`] = setTimeout(() => {
        let finalValue = isNumber ? (value !== "" ? Number(value) : "") : value;

        window.db.collection("orders").doc(docId).update({
            [fieldName]: finalValue,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            if (syncIcon) syncIcon.innerHTML = `<i class="fa-solid fa-cloud-check text-emerald-500"></i>`;
        }).catch(err => {
            console.error("خطأ التحديث التلقائي:", err);
            if (syncIcon) syncIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-500"></i>`;
        });
    }, 400);
}

function removeRow(docId) {
    if (!window.db) return;
    if (confirm("هل أنت تأكد من حذف هذا الأوردر نهائياً؟")) {
        window.db.collection("orders").doc(docId).delete();
    }
}

// ==========================================================
// orders-excel.js — تحميل ورفع جدول الطلبات (Excel <-> Firebase)
// تحميل: كل الأوردرات بنفس أعمدة الجدول في ملف xlsx
// رفع:   الملف بيستبدل بيانات Firebase (تعديل + إضافة + حذف)
// ==========================================================

const ORDERS_XLSX = {
    collection: 'orders',
    idColumn: 'docId',          // عمود معرّف المستند في Firebase (متعدّلوش)
    sheetName: 'Orders',
    defaultStatus: 'جديد'
};

// أعمدة الجدول بنفس ترتيبها (key = اسم الحقل في Firebase، label = عنوان العمود)
const ORDERS_COLUMNS = [
    { key: 'orderId', label: 'ID' },
    { key: 'customerName', label: 'العميل' },
    { key: 'phone', label: 'رقم الهاتف', phone: true },
    { key: 'altPhone', label: 'رقم اخر', phone: true },
    { key: 'returns', label: 'مرتجع' },
    { key: 'status', label: 'الحاله' },
    { key: 'total', label: 'الاجمالي', num: true },
    { key: 'collected', label: 'التحصيل', num: true },
    { key: 'quantity', label: 'العدد', num: true },
    { key: 'closingNote', label: 'م التقفيل' },
    { key: 'recycling', label: 'تدوير' },
    { key: 'employee', label: 'المتابعه' },
    { key: 'employeeNote', label: 'م المتابعه' },
    { key: 'officeName', label: 'المكتب' },
    { key: 'companyName', label: 'الشركه' },
    { key: 'officeNote', label: 'م المكتب' },
    { key: 'area', label: 'المنطقه' },
    { key: 'rider', label: 'المندوب' },
    { key: 'riderNote', label: 'م المندوب' },
    { key: 'address', label: 'العنوان' },
    { key: 'extraNumber', label: 'الرقم', num: true }
];

// ---------- أدوات ----------
function oxCollection() {
    if (!window.db) { alert('قاعدة البيانات غير متصلة بعد.'); return null; }
    return window.db.collection(ORDERS_XLSX.collection);
}

function oxToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// يحوّل قيمة الخلية للنوع الصحيح حسب العمود
function oxNormalize(col, raw) {
    if (raw === null || raw === undefined) return '';
    if (col.num) {
        if (raw === '') return '';
        if (typeof raw === 'number') return raw;
        const n = Number(String(raw).replace(/[,\s]/g, ''));
        return Number.isFinite(n) ? n : String(raw).trim();
    }
    let s = typeof raw === 'number' ? String(raw) : String(raw).trim();
    // إكسيل بيشيل الصفر من أول أرقام الموبايل (1012345678 -> 01012345678)
    if (col.phone && typeof raw === 'number' && /^1\d{9}$/.test(s)) s = '0' + s;
    return s;
}

function oxSame(a, b) {
    return String(a ?? '') === String(b ?? '');
}

// ==========================================================
// 1. تحميل الجدول وبياناته
// ==========================================================
async function exportToExcel() {
    const col = oxCollection();
    if (!col) return;
    if (typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل، تأكد من الإنترنت وحدّث الصفحة.');

    try {
        const snap = await col.get();
        if (snap.empty) return alert('لا توجد طلبات لتحميلها.');

        // نفس ترتيب الجدول: الأحدث أولاً
        const docs = [...snap.docs].sort((a, b) => {
            const ta = a.data().createdAt?.seconds ?? 0;
            const tb = b.data().createdAt?.seconds ?? 0;
            return tb - ta;
        });

        const headers = [...ORDERS_COLUMNS.map(c => c.label), ORDERS_XLSX.idColumn];
        const rows = docs.map(d => {
            const data = d.data();
            const row = {};
            ORDERS_COLUMNS.forEach(c => {
                const v = data[c.key];
                row[c.label] = c.num
                    ? (v === undefined || v === null ? '' : v)
                    : (v === undefined || v === null ? '' : String(v)); // نص عشان الصفر في أول الموبايل
            });
            row[ORDERS_XLSX.idColumn] = d.id;
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        ws['!cols'] = headers.map(h => ({ wch: Math.max(12, String(h).length + 4) }));
        ws['!views'] = [{ RTL: true }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, ORDERS_XLSX.sheetName);
        XLSX.writeFile(wb, `orders_${oxToday()}.xlsx`);
    } catch (err) {
        console.error('خطأ أثناء التحميل:', err);
        alert('حدث خطأ أثناء تحميل الملف.');
    }
}

// ==========================================================
// 2. رفع الملف بعد التعديل (تحديث + إضافة + حذف)
// ==========================================================
async function importFromExcel(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const col = oxCollection();
    if (!col) { input.value = ''; return; }
    if (typeof XLSX === 'undefined') {
        input.value = '';
        return alert('مكتبة Excel لم تُحمّل، تأكد من الإنترنت وحدّث الصفحة.');
    }

    try {
        // --- قراءة الملف ---
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        if (!rows.length) { input.value = ''; return alert('الملف فاضي.'); }

        // مطابقة العناوين: بالعربي أو باسم الحقل
        const headers = Object.keys(rows[0]).map(h => h.trim());
        const rawHeaders = Object.keys(rows[0]);
        const colByHeader = new Map();
        rawHeaders.forEach((raw, i) => {
            const h = headers[i];
            const c = ORDERS_COLUMNS.find(c => c.label === h || c.key === h);
            if (c) colByHeader.set(raw, c);
        });
        if (!colByHeader.size) {
            input.value = '';
            return alert('أعمدة الملف مش مطابقة لأعمدة الجدول. حمّل الملف من زر "تحميل" وعدّل عليه.');
        }
        const idRawHeader = rawHeaders.find((raw, i) => headers[i] === ORDERS_XLSX.idColumn);
        const hasId = !!idRawHeader;

        if (!hasId && !confirm(`الملف مفيهوش عمود "${ORDERS_XLSX.idColumn}"، فالنظام هيطابق الأوردرات بعمود ID والباقي يتضاف كجديد. تكمل؟`)) {
            input.value = '';
            return;
        }

        // --- الأوردرات الحالية ---
        const snap = await col.get();
        const existing = new Map(snap.docs.map(d => [d.id, d.data()]));
        const byOrderId = new Map();
        snap.docs.forEach(d => {
            const oid = String(d.data().orderId ?? '').trim();
            if (oid && !byOrderId.has(oid)) byOrderId.set(oid, d.id);
        });

        const toAdd = [];
        const toUpdate = [];   // { id, changes }
        const seenIds = new Set();
        let unchanged = 0, duplicates = 0;

        rows.forEach(row => {
            // قيم الصف بعد التطبيع
            const data = {};
            let hasValue = false;
            colByHeader.forEach((c, raw) => {
                const v = oxNormalize(c, row[raw]);
                data[c.key] = v;
                if (v !== '') hasValue = true;
            });
            if (!hasValue) return; // صف فاضي

            // تحديد الأوردر المقابل: بالـ docId، وإلا بعمود ID
            let id = hasId ? String(row[idRawHeader] ?? '').trim() : '';
            if (!(id && existing.has(id))) {
                id = '';
                const oid = String(data.orderId ?? '').trim();
                if (oid && byOrderId.has(oid)) id = byOrderId.get(oid);
            }

            if (id) {
                if (seenIds.has(id)) { duplicates++; return; }
                seenIds.add(id);
                const old = existing.get(id);
                const changes = {};
                Object.keys(data).forEach(k => {
                    if (!oxSame(old[k], data[k])) changes[k] = data[k];
                });
                if (Object.keys(changes).length) toUpdate.push({ id, changes });
                else unchanged++;
            } else {
                // أوردر جديد: كل الحقول موجودة، والحالة الافتراضية "جديد"
                const full = {};
                ORDERS_COLUMNS.forEach(c => { full[c.key] = data[c.key] ?? ''; });
                if (!full.status) full.status = ORDERS_XLSX.defaultStatus;
                toAdd.push(full);
            }
        });

        const toDeleteIds = [...existing.keys()].filter(id => !seenIds.has(id));
        // الحالات الموجودة في الملف وغير مضافة في الإعدادات -> هتتضاف تلقائياً
        const knownStatuses = new Set(orderStatusesList.map(s => s.name));
        const newStatuses = new Set();
        [...toAdd, ...toUpdate.map(u => u.changes)].forEach(d => {
            const st = String(d.status ?? '').trim();
            if (st && !knownStatuses.has(st)) newStatuses.add(st);
        });

        if (!toAdd.length && !toUpdate.length && !toDeleteIds.length) {
            input.value = '';
            return alert('مفيش أي تغيير في الملف مقارنة بالموجود على النظام.');
        }

        // --- تأكيد واحد: الملف هيستبدل بيانات Firebase ---
        const doDelete = toDeleteIds.length > 0;
        const summary =
            `رفع الملف هيستبدل بيانات الأوردرات على Firebase:\n\n` +
            `• تعديل: ${toUpdate.length} أوردر\n` +
            `• إضافة: ${toAdd.length} أوردر جديد\n` +
            `• حذف (موجودين على النظام ومش في الملف): ${toDeleteIds.length}\n` +
            `• بدون تغيير: ${unchanged}\n` +
            (newStatuses.size ? `• حالات جديدة هتتضاف للإعدادات: ${[...newStatuses].join('، ')}\n` : '') +
            (duplicates ? `• صفوف مكررة اتجاهلت: ${duplicates}\n` : '') +
            `\nتكمل؟`;
        if (!confirm(summary)) { input.value = ''; return; }

        // --- التنفيذ على دفعات ---
        // --- التنفيذ على دفعات ---
        const FV = firebase.firestore.FieldValue;
        const ops = [];
        toUpdate.forEach(u => ops.push(b => b.update(col.doc(u.id), { ...u.changes, updatedAt: FV.serverTimestamp() })));
        toAdd.forEach(d => ops.push(b => b.set(col.doc(), { ...d, createdAt: FV.serverTimestamp() })));
        if (doDelete) toDeleteIds.forEach(id => ops.push(b => b.delete(col.doc(id))));

        // إضافة الحالات الجديدة في الإعدادات
        newStatuses.forEach(name => ops.push(b =>
            b.set(window.db.collection('statuses').doc(), {
                name,
                createdAt: FV.serverTimestamp()
            })
        ));

        for (let i = 0; i < ops.length; i += 400) {
            const batch = window.db.batch();
            ops.slice(i, i + 400).forEach(op => op(batch));
            await batch.commit();
        }

        alert(
            `تم الرفع بنجاح ✅\n` +
            `تعديل: ${toUpdate.length} | إضافة: ${toAdd.length}` +
            (doDelete ? ` | حذف: ${toDeleteIds.length}` : '')
        );
    } catch (err) {
        console.error('خطأ أثناء الرفع:', err);
        alert('حدث خطأ أثناء رفع الملف، راجع الـ Console. ممكن يكون جزء من التغييرات اتنفذ.');
    } finally {
        input.value = ''; // عشان تقدر ترفع نفس الملف تاني
    }
}


// ==========================================================
// نسخ الخلايا المحددة (Ctrl+C) — صف / عمود / مدى / تحديد متعدد
// بيتنسخ كنص بين كل خلية وخلية Tab وبين كل صف وصف سطر جديد،
// فيتلصق في Excel أو Google Sheets بنفس الشكل.
// ==========================================================
function selTsvEscape(v) {
    const s = String(v ?? '');
    return /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function selGetElements() {
    const els = [];
    selectedCells.forEach(key => {
        const i = key.indexOf('_');
        if (i < 0) return;
        const docId = key.slice(0, i);
        const field = key.slice(i + 1);
        const el = document.querySelector(`[data-doc="${docId}"][data-field="${field}"]`);
        if (el) els.push(el);
    });
    return els;
}

function selBuildTSV() {
    const grid = new Map(); // رقم الصف -> (رقم العمود -> القيمة)
    let minC = Infinity, maxC = -Infinity;

    selGetElements().forEach(el => {
        const tr = el.closest('tr');
        const td = el.closest('td');
        if (!tr || !td || tr.style.display === 'none') return; // تجاهل الصفوف المخفية بالبحث
        const r = tr.rowIndex, c = td.cellIndex;
        if (!grid.has(r)) grid.set(r, new Map());
        grid.get(r).set(c, el.value ?? '');
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
    });

    return [...grid.keys()].sort((a, b) => a - b).map(r => {
        const rowMap = grid.get(r);
        const cells = [];
        for (let c = minC; c <= maxC; c++) cells.push(selTsvEscape(rowMap.get(c) ?? ''));
        return cells.join('\t');
    }).join('\n');
}

// لو المستخدم محدد نص جوه خلية واحدة، نسيب النسخ العادي بتاع المتصفح
function selHasNativeTextSelection() {
    try {
        const a = document.activeElement;
        if (a && a.tagName === 'INPUT' && a.type === 'text' && a.selectionStart !== a.selectionEnd) return true;
    } catch (_) { /* بعض أنواع input مفيهاش selectionStart */ }
    return (window.getSelection()?.toString() || '') !== '';
}

function selShouldHandleCopy() {
    if (selectedCells.size === 0) return false;
    if (selectedCells.size === 1 && selHasNativeTextSelection()) return false;
    return true;
}

async function selCopyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (_) {
        // بديل للمتصفحات/الروابط غير الآمنة
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
}

function selToast(msg) {
    let t = document.getElementById('copy-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'copy-toast';
        t.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg z-[10000] transition-opacity';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 1500);
}

// Ctrl+C (شغال حتى مع الكيبورد العربي لأننا بنقرأ e.code)
window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code !== 'KeyC' && (e.key || '').toLowerCase() !== 'c') return;
    if (!selShouldHandleCopy()) return;

    e.preventDefault();
    const count = selectedCells.size;
    selCopyText(selBuildTSV()).then(() => selToast(`تم نسخ ${count} خلية`));
});

// النسخ من قائمة المتصفح (كليك يمين / Edit > Copy)
document.addEventListener('copy', (e) => {
    if (!selShouldHandleCopy()) return;
    e.clipboardData.setData('text/plain', selBuildTSV());
    e.preventDefault();
});


// ==========================================
// تقفيل اليوم: كل الأوردرات المفتوحة تتقفل وتفضل ظاهرة في تاب المراجعة
// ==========================================
// ==========================================
// تقفيل اليوم: مودال لاختيار تاريخ التقفيل
// ==========================================
let closeDayOpenDocs = [];   // أوردرات مفتوحة محمّلة للمعاينة

function cdTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// تاريخ الإضافة كـ YYYY-MM-DD، أو null لو الأوردر قديم ومفيهوش تاريخ
function cdOrderDayKey(data) {
    const t = data.createdAt;
    if (!t || !t.toDate) return null;
    const d = t.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// الأوردرات اللي هتتقفل: مفتوحة + تاريخها <= التاريخ المختار (أو بدون تاريخ)
function cdSelect(docs, dayKey) {
    return docs.filter(d => {
        const data = d.data();
        if (data.closed === true) return false;
        const k = cdOrderDayKey(data);
        return k === null || k <= dayKey;
    });
}

async function closeDay() {
    if (!window.db) return alert('قاعدة البيانات غير متصلة بعد.');

    try {
        const snap = await window.db.collection('orders').get();
        closeDayOpenDocs = snap.docs.filter(d => d.data().closed !== true);
        if (!closeDayOpenDocs.length) return alert('لا توجد أوردرات مفتوحة لتقفيلها.');

        document.getElementById('close-day-date').value = cdTodayKey();
        updateCloseDayPreview();

        const btn = document.getElementById('close-day-confirm');
        btn.disabled = false;
        btn.textContent = 'تأكيد التقفيل';

        const modal = document.getElementById('closeDayModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (err) {
        console.error('خطأ أثناء فتح التقفيل:', err);
        alert('حدث خطأ أثناء تحميل الأوردرات، راجع الـ Console.');
    }
}

function closeCloseDayModal() {
    const modal = document.getElementById('closeDayModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function updateCloseDayPreview() {
    const dayKey = document.getElementById('close-day-date')?.value;
    const box = document.getElementById('close-day-preview');
    const btn = document.getElementById('close-day-confirm');
    if (!box || !btn) return;

    if (!dayKey) {
        box.innerHTML = 'اختار تاريخ التقفيل.';
        btn.disabled = true;
        return;
    }
    const n = cdSelect(closeDayOpenDocs, dayKey).length;
    const rest = closeDayOpenDocs.length - n;
    box.innerHTML =
        `هيتقفل <b class="text-slate-800">${n}</b> أوردر (تاريخ إضافتهم ${dayKey} أو قبله)` +
        (rest > 0 ? `<br>و<b class="text-slate-800">${rest}</b> أوردر أحدث هيفضلوا مفتوحين.` : '');
    btn.disabled = n === 0;
}

async function confirmCloseDay() {
    const dayKey = document.getElementById('close-day-date')?.value;
    if (!dayKey || !window.db) return;

    const btn = document.getElementById('close-day-confirm');
    btn.disabled = true;
    btn.textContent = 'جاري التقفيل...';

    try {
        // نجيب الأوردرات من جديد عشان العدد يكون دقيق وقت التأكيد
        const snap = await window.db.collection('orders').get();
        const toClose = cdSelect(snap.docs, dayKey);
        if (!toClose.length) {
            closeCloseDayModal();
            return alert('لا توجد أوردرات مفتوحة لتقفيلها في هذا التاريخ.');
        }

        const FV = firebase.firestore.FieldValue;
        for (let i = 0; i < toClose.length; i += 400) {
            const batch = window.db.batch();
            toClose.slice(i, i + 400).forEach(doc => {
                batch.update(doc.ref, { closed: true, closedAt: FV.serverTimestamp(), closedDay: dayKey });
            });
            await batch.commit();
        }

        closeCloseDayModal();
        alert(`تم تقفيل يوم ${dayKey} ✅ (${toClose.length} أوردر)`);
    } catch (err) {
        console.error('خطأ أثناء تقفيل اليوم:', err);
        alert('حدث خطأ أثناء تقفيل اليوم، راجع الـ Console. ممكن يكون جزء من الأوردرات اتقفل.');
        btn.disabled = false;
        btn.textContent = 'تأكيد التقفيل';
    }
}

// إغلاق المودال بالضغط على الخلفية أو Escape
document.addEventListener('click', e => {
    const modal = document.getElementById('closeDayModal');
    if (e.target === modal) closeCloseDayModal();
});
document.addEventListener('keydown', e => {
    const modal = document.getElementById('closeDayModal');
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeCloseDayModal();
});