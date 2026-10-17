// ==========================================================
// orders-filter.js — فلترة أعمدة جدول الطلبات + كروت الإحصائيات الحية
// حطه في index.html بعد <script src="/orders-table.js"></script>
// ==========================================================
(function () {
    // ---------- إعدادات الكروت (عدّل الكلمات لو أسماء الحالات عندك مختلفة) ----------
    // الكارت بيعد الأوردرات اللي "الحاله" بتاعتها بتحتوي على الكلمة دي
    const STATUS_RULES = {
        recv: 'استلام',     // استلامات
        rot: 'تدوير',      // تدوير
        rr: 'رفض رفض',    // رفض رفض
        rp: 'رفض دفع',    // رفض دفع
        ret: 'مرتجع'       // مرتجع
    };
    // ترتيب الكروت في الهيدر: الطلبات، التحصيل، استلامات، تدوير، رفض رفض، رفض دفع، مرتجع
    const CARD_ORDER = ['orders', 'collected', 'recv', 'rot', 'rr', 'rp', 'ret'];

    // حقول الأعمدة بنفس ترتيب data-col-index (1 → 21)
    const FIELDS = ['orderId', 'customerName', 'phone', 'altPhone', 'returns', 'status', 'total', 'collected',
        'quantity', 'closingNote', 'recycling', 'employee', 'employeeNote', 'officeName', 'companyName',
        'officeNote', 'area', 'rider', 'riderNote', 'address', 'extraNumber'];
    const NUM_FIELDS = new Set(['total', 'collected', 'quantity', 'extraNumber']);
    const STORAGE_KEY = 'ordersColumnFilters_v1';

    const labels = {};            // field -> عنوان العمود
    let saved = loadSaved();      // الفلاتر المثبّتة { field: Set(values) }
    let draft = null;             // الفلتر المفتوح حالياً (معاينة قبل الحفظ) { field, all, counts, sel, pending }
    const touched = new Set();    // صفوف اتعدّلت: تفضل ظاهرة لحد ما الفلتر يتغير
    let baseline = null;          // الصفوف الموجودة وقت تثبيت الفلتر (الجديدة بتفضل ظاهرة)
    let lastQ = '';
    let panel = null, clearBtn = null;

    // ---------- أدوات ----------
    const norm = s => String(s ?? '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ').trim().toLowerCase();

    function cellVal(tr, f) {
        const el = tr.querySelector(`[data-field="${f}"]`);
        return String(el ? el.value : '').trim();
    }
    const dataRows = () => Array.from(document.querySelectorAll('#excel-body tr')).filter(tr => tr.id && tr.id.startsWith('row-'));

    function loadSaved() {
        try {
            const o = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const r = {};
            Object.keys(o).forEach(k => { if (Array.isArray(o[k])) r[k] = new Set(o[k]); });
            return r;
        } catch (_) { return {}; }
    }
    function persist() {
        try {
            const o = {};
            Object.keys(saved).forEach(k => o[k] = [...saved[k]]);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
        } catch (_) { }
    }
    function resetExempt() { touched.clear(); baseline = null; }

    // الفلاتر الفعّالة = المثبّتة + معاينة الفلتر المفتوح
    function effective() {
        const f = { ...saved };
        if (draft) {
            if ((draft.sel.size === 0 && !draft.explicit) || draft.sel.size >= draft.all.length) delete f[draft.field];
            else f[draft.field] = draft.sel;
        }
        return f;
    }

    // ---------- الفلترة الفعلية (بتستبدل renderTable الأصلية) ----------
    window.renderTable = function () {
        const q = (document.getElementById('table-search-input')?.value || '').toLowerCase().trim();
        if (q !== lastQ) { lastQ = q; resetExempt(); }

        const rows = Array.from(document.querySelectorAll('#excel-body tr'));
        const data = rows.filter(tr => tr.id && tr.id.startsWith('row-'));
        if (!baseline && data.length) baseline = new Set(data.map(tr => tr.id));
        const entries = Object.entries(effective());

        rows.forEach(tr => {
            if (!(tr.id && tr.id.startsWith('row-'))) { tr.style.display = ''; return; }
            // صف اتعدّل أو أوردر جديد: يفضل ظاهر عشان مايختفيش وانت بتكتب فيه
            const exempt = touched.has(tr.id) || !baseline.has(tr.id);
            let ok = true;
            if (!exempt) {
                for (const [f, set] of entries) {
                    if (!set.has(cellVal(tr, f))) { ok = false; break; }
                }
                if (ok && q) {
                    const text = Array.from(tr.querySelectorAll('input, select')).map(el => el.value || '').join(' ').toLowerCase();
                    ok = text.includes(q);
                }
            }
            tr.style.display = ok ? '' : 'none';
        });
        updateStats();
        updateClearBtn();
    };

    function filtersChanged() { resetExempt(); window.renderTable(); refreshButtons(); }

    // ---------- كروت الهيدر ----------
    function fmtMoney(n) {
        const a = Math.abs(n);
        if (a >= 1e6) return (n / 1e6).toFixed(3).replace(/\.?0+$/, '') + 'M';
        if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
        return n.toLocaleString('en');
    }

    function updateStats() {
        const cards = document.querySelectorAll('#topbar-panel-1 .grid > div');
        if (cards.length < CARD_ORDER.length) return;

        const c = { orders: 0, collected: 0, recv: 0, rot: 0, rr: 0, rp: 0, ret: 0 };
        dataRows().forEach(tr => {
            if (tr.style.display === 'none') return;
            c.orders++;
            c.collected += Number(cellVal(tr, 'collected')) || 0;
            const st = norm(cellVal(tr, 'status'));
            for (const k in STATUS_RULES) {
                if (st && st.includes(norm(STATUS_RULES[k]))) { c[k]++; break; }
            }
        });

        CARD_ORDER.forEach((k, i) => {
            const span = cards[i].lastElementChild;
            if (!span) return;
            span.textContent = k === 'collected' ? fmtMoney(c[k]) : c[k].toLocaleString('en');
            if (k === 'collected') span.title = c[k].toLocaleString('en');
        });
    }

    // ---------- أزرار الفلتر في عناوين الأعمدة ----------
    function injectButtons() {
        document.querySelectorAll('th[data-col-index]').forEach(th => {
            const f = FIELDS[Number(th.dataset.colIndex) - 1];
            if (!f || th.querySelector('.col-filter-btn')) return;
            labels[f] = Array.from(th.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();

            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'col-filter-btn';
            b.dataset.field = f;
            b.title = 'فلترة';
            b.innerHTML = '<i class="fa-solid fa-filter"></i>';
            b.addEventListener('mousedown', e => e.stopPropagation());
            b.addEventListener('click', e => { e.stopPropagation(); openPanel(f, b); });
            th.insertBefore(b, th.querySelector('.resizer'));
        });
        refreshButtons();
    }

    function refreshButtons() {
        document.querySelectorAll('.col-filter-btn').forEach(b => {
            const f = b.dataset.field;
            const on = !!saved[f];
            b.classList.toggle('active', on);
            b.title = on ? `فلتر مفعّل (${saved[f].size} قيمة)` : 'فلترة';
        });
    }

    // ---------- زر إلغاء الفلترة ----------
    function createClearBtn() {
        const input = document.getElementById('table-search-input');
        if (!input || clearBtn) return;
        const wrap = input.closest('.relative');
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'clear-all-filters';
        clearBtn.style.display = 'none';
        clearBtn.innerHTML = '<i class="fa-solid fa-filter-circle-xmark"></i> <span>إلغاء الفلترة</span>';
        clearBtn.addEventListener('click', () => {
            saved = {}; persist();
            closePanel(false);
            input.value = '';
            lastQ = '';
            filtersChanged();
        });
        wrap.insertAdjacentElement('afterend', clearBtn);
    }

    function updateClearBtn() {
        if (!clearBtn) return;
        const q = (document.getElementById('table-search-input')?.value || '').trim();
        const n = Object.keys(saved).length;
        clearBtn.style.display = (n || q) ? 'inline-flex' : 'none';
        clearBtn.querySelector('span').textContent = n ? `إلغاء الفلترة (${n})` : 'إلغاء الفلترة';
    }

    // ---------- لوحة الفلتر ----------
    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'col-filter-panel';
        panel.innerHTML = `
            <div class="cfp-title"></div>
            <input type="text" class="cfp-search" placeholder="اكتب للبحث وتحديد القيم...">
            <div class="cfp-hint">اكتب لتضييق القايمة، وحدّد بنفسك. Enter يحدد كل النتايج الظاهرة</div>
            <label class="cfp-row cfp-all"><input type="checkbox" class="cfp-all-cb"><span>تحديد الكل</span></label>
            <div class="cfp-list"></div>
            <div class="cfp-foot">
                <button type="button" class="cfp-save">حفظ الفلتر</button>
                <button type="button" class="cfp-clear">مسح</button>
            </div>`;
        document.body.appendChild(panel);

        // الكتابة بتضيّق القايمة بس، ومابتحددش حاجة لوحدها
        panel.querySelector('.cfp-search').addEventListener('input', () => {
            if (draft) renderList();
        });
        // Enter: يحدد كل نتايج البحث الظاهرة ويفضّي الخانة (اختياري)
        panel.querySelector('.cfp-search').addEventListener('keydown', e => {
            if (e.key !== 'Enter' || !draft) return;
            e.preventDefault();
            const vals = visibleValues();
            if (vals.length && vals.length < draft.all.length) {
                draft.explicit = true;
                vals.forEach(v => draft.sel.add(v));
            }
            e.target.value = '';
            renderList(); filtersChanged();
        });

        panel.querySelector('.cfp-all-cb').addEventListener('change', e => {
            if (!draft) return;
            draft.explicit = true;
            visibleValues().forEach(v => {
                draft.pending.delete(v);
                e.target.checked ? draft.sel.add(v) : draft.sel.delete(v);
            });
            renderList(); filtersChanged();
        });

        panel.querySelector('.cfp-save').addEventListener('click', () => {
            if (!draft) return;
            if (draft.sel.size === 0 || draft.sel.size >= draft.all.length) delete saved[draft.field];
            else saved[draft.field] = new Set(draft.sel);
            persist();
            closePanel(false);
            filtersChanged();
        });

        panel.querySelector('.cfp-clear').addEventListener('click', () => {
            if (!draft) return;
            delete saved[draft.field]; persist();
            closePanel(false);
            filtersChanged();
        });
    }

    function visibleValues() {
        const t = norm(panel.querySelector('.cfp-search').value);
        return draft.all.filter(v => !t || norm(v).includes(t));
    }

    function renderList() {
        const list = panel.querySelector('.cfp-list');
        list.innerHTML = '';
        const vals = visibleValues();
        vals.forEach(v => {
            const row = document.createElement('label');
            row.className = 'cfp-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = draft.sel.has(v);
            cb.addEventListener('change', () => {
                draft.explicit = true;
                draft.pending.delete(v);   // الباقي (نتيجة البحث المؤقتة) مايتثبتش من غير Enter
                cb.checked ? draft.sel.add(v) : draft.sel.delete(v);
                syncAll(); filtersChanged();
            });
            const s = document.createElement('span');
            s.textContent = v === '' ? '(فارغ)' : v;
            const n = document.createElement('em');
            n.textContent = draft.counts.get(v);
            row.append(cb, s, n);
            list.appendChild(row);
        });
        if (!vals.length) list.innerHTML = '<div class="cfp-empty">لا توجد قيم</div>';
        syncAll();
    }

    function syncAll() {
        const vals = visibleValues();
        const cb = panel.querySelector('.cfp-all-cb');
        cb.checked = vals.length > 0 && vals.every(v => draft.sel.has(v));
    }

    function openPanel(field, btn) {
        if (!panel) buildPanel();
        const wasSame = draft && draft.field === field && panel.style.display === 'block';
        closePanel(true);
        if (wasSame) return;

        const counts = new Map();
        dataRows().forEach(tr => {
            const v = cellVal(tr, field);
            counts.set(v, (counts.get(v) || 0) + 1);
        });
        const all = [...counts.keys()].sort((a, b) => NUM_FIELDS.has(field)
            ? (Number(a) || 0) - (Number(b) || 0)
            : a.localeCompare(b, 'ar'));
        const sel = saved[field] ? new Set(all.filter(v => saved[field].has(v))) : new Set();
        draft = { field, all, counts, sel, pending: new Set(), explicit: false };

        panel.querySelector('.cfp-title').textContent = 'فلترة: ' + (labels[field] || field);
        panel.querySelector('.cfp-search').value = '';
        renderList();

        panel.style.display = 'block';
        const r = btn.getBoundingClientRect();
        const w = panel.offsetWidth, h = panel.offsetHeight;
        panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
        panel.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8)) + 'px';
        panel.querySelector('.cfp-search').focus();
    }

    // revert=true: قفل من غير حفظ → الجدول يرجع للفلتر المثبّت
    function closePanel(revert) {
        if (!panel) return;
        const hadDraft = !!draft;
        panel.style.display = 'none';
        draft = null;
        if (revert && hadDraft) filtersChanged();
    }

    // ---------- تشغيل ----------
    function init() {
        const style = document.createElement('style');
        style.textContent = `
            .col-filter-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-inline-start:4px;border:0;border-radius:5px;background:transparent;color:#94a3b8;font-size:9px;cursor:pointer;vertical-align:middle}
            .col-filter-btn:hover{background:#e2e8f0;color:#334155}
            .col-filter-btn.active{background:#10b981;color:#fff}
            #clear-all-filters{align-items:center;gap:6px;white-space:nowrap;padding:7px 12px;border-radius:10px;background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;font-size:12px;font-weight:700;cursor:pointer}
            #clear-all-filters:hover{background:#ffe4e6}
            #col-filter-panel{display:none;position:fixed;z-index:10000;width:250px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.18);direction:rtl;text-align:right;font-family:'Cairo',sans-serif;font-size:12px;color:#334155}
            #col-filter-panel .cfp-title{font-weight:700;margin-bottom:8px;color:#0f172a}
            #col-filter-panel .cfp-search{width:100%;padding:6px 10px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;outline:none}
            #col-filter-panel .cfp-search:focus{border-color:#10b981}
            #col-filter-panel .cfp-hint{font-size:10px;color:#94a3b8;margin:-2px 2px 6px}
            #col-filter-panel .cfp-list{max-height:220px;overflow-y:auto;border-top:1px solid #f1f5f9;margin-top:4px;padding-top:4px}
            #col-filter-panel .cfp-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer}
            #col-filter-panel .cfp-row:hover{background:#f1f5f9}
            #col-filter-panel .cfp-row span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            #col-filter-panel .cfp-row em{font-style:normal;font-size:10px;color:#94a3b8;background:#f1f5f9;padding:0 6px;border-radius:99px}
            #col-filter-panel .cfp-all{font-weight:700}
            #col-filter-panel .cfp-empty{padding:12px;text-align:center;color:#94a3b8}
            #col-filter-panel .cfp-foot{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9}
            #col-filter-panel .cfp-save{flex:1;padding:7px;border:0;border-radius:8px;background:#059669;color:#fff;font-weight:700;cursor:pointer}
            #col-filter-panel .cfp-save:disabled{opacity:.4;cursor:not-allowed}
            #col-filter-panel .cfp-clear{padding:7px 12px;border:0;border-radius:8px;background:#f1f5f9;color:#475569;font-weight:600;cursor:pointer}`;
        document.head.appendChild(style);

        injectButtons();
        createClearBtn();

        const body = document.getElementById('excel-body');
        if (body) {
            // أي تعديل في صف: الصف يفضل ظاهر + الكروت تتحدث لحظياً
            let t;
            const onEdit = e => {
                const tr = e.target.closest && e.target.closest('tr');
                if (tr && tr.id) touched.add(tr.id);
                clearTimeout(t);
                t = setTimeout(updateStats, 150);
            };
            body.addEventListener('input', onEdit);
            body.addEventListener('change', onEdit);

            // لما الجدول يتعاد رسمه من Firebase (حتى لو فاضي) نطبّق الفلتر ونحدّث الكروت
            let raf;
            new MutationObserver(() => {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => window.renderTable());
            }).observe(body, { childList: true });
        }

        // قفل اللوحة بدون حفظ: ضغط برا أو Escape
        document.addEventListener('mousedown', e => {
            if (!panel || panel.style.display !== 'block') return;
            if (panel.contains(e.target) || e.target.closest('.col-filter-btn')) return;
            closePanel(true);
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panel && panel.style.display === 'block') closePanel(true);
        });

        window.renderTable();
    }

    // ---------- التعديل: دابل كليك / Enter للخلايا العادية، وضغطة واحدة للقوائم المنسدلة ----------
    const _enterEditMode = window.enterEditMode;
    window.enterEditMode = function (el) {
        if (el && el.tagName === 'SELECT' && editingEl === el) return; // مفتوحة بالفعل من الضغطة الأولى
        return _enterEditMode(el);
    };

    window.handleCellMouseDown = function (event, docId, fieldName) {
        if (event.target === editingEl) return;
        exitEditMode();

        const el = event.target;
        const cellKey = `${docId}_${fieldName}`;
        const multi = event.ctrlKey || event.metaKey || event.shiftKey;

        if (event.ctrlKey || event.metaKey) {
            if (selectedCells.has(cellKey)) selectedCells.delete(cellKey);
            else selectedCells.add(cellKey);
            lastSelectedCell = { docId, fieldName, element: el };
        } else if (event.shiftKey && lastSelectedCell) {
            selectRange(lastSelectedCell, { docId, fieldName, element: el });
        } else {
            selectedCells.clear();
            selectedCells.add(cellKey);
            lastSelectedCell = { docId, fieldName, element: el };
        }
        isMouseDown = true;
        updateCellVisuals();

        if (el.tagName === 'SELECT') {
            if (multi) { event.preventDefault(); el.focus(); }          // تحديد متعدد: مايفتحش
            else { editingEl = el; el.classList.add('cell-editing'); }  // ضغطة واحدة: تفتح القائمة
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();