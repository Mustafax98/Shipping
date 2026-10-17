// ==========================================================
// review-export.js — تصدير المراجعة: Excel لكل مكتب + تقرير PDF للفترة المحددة
// بيعتمد على review.js (لازم يتحمل قبله) ومكتبة ExcelJS
// ==========================================================

const RVX_OFFICELESS = 'بدون مكتب';

function rvxOfficeKey(o) { return String(o.officeName || RVX_OFFICELESS); }

// أوردرات الفترة المختارة (يوم أو شهر) مرتبة بالتاريخ
// أوردرات الفترة المختارة (يوم أو من - إلى) مرتبة بالتاريخ
function rvxPeriod() {
    const r = rvRange();
    const rows = [];
    reviewAll.forEach(o => {
        const d = rvDate(o);
        if (!d || !rvInRange(rvDayKey(d), r)) return;
        rows.push({ o, d });
    });
    rows.sort((a, b) => a.d - b.d);
    return { from: r.from, to: r.to, single: r.single, rows, label: r.single ? r.from : `${r.from}_${r.to}` };
}

function rvxSettlements(p, name) {
    return reviewSettlements
        .filter(s => rvInRange(String(s.day || ''), p)
            && (!name || String(s.officeName || RVX_OFFICELESS) === name))
        .sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

function rvxSummary(p, name) {
    const rows = p.rows.filter(x => rvxOfficeKey(x.o) === name);
    const t = rows.reduce((a, x) => {
        a.total += rvNum(x.o.total);
        a.collected += rvNum(x.o.collected);
        a.commission += rvCommission(x.o);
        if (rvIsDelivered(x.o)) a.delivered++;
        return a;
    }, { total: 0, collected: 0, commission: 0, delivered: 0 });
    const paid = rvxSettlements(p, name).reduce((s, x) => s + rvNum(x.amount), 0);
    const send = t.collected - t.commission;
    return { n: rows.length, ...t, send, paid, rem: send - paid, rows };
}

function rvxFileSafe(s) { return String(s).replace(/[\\/:*?"<>|]/g, '-').trim(); }

function rvxOrderLine(x) {
    const o = x.o;
    return [
        o.orderId ?? '', o.customerName ?? '', o.phone ?? '', o.altPhone ?? '', o.status ?? '',
        rvNum(o.total), rvNum(o.collected), rvxOfficeKey(o), rvCommission(o),
        o.area ?? '', o.rider ?? '', rvDayKey(x.d)
    ];
}
const RVX_ORDER_HEAD = ['ID', 'العميل', 'رقم الهاتف', 'رقم آخر', 'الحالة', 'الإجمالي', 'التحصيل', 'المكتب', 'العمولة', 'المنطقة', 'المندوب', 'التاريخ'];

// ---------- Excel بنفس شكل تقرير الـ PDF (بيحتاج ExcelJS) ----------
function rvxPeriodTitle(p) {
    const f = k => new Date(k + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    return p.single
        ? new Date(p.from + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `من ${f(p.from)} إلى ${f(p.to)}`;
}

async function rvxBuildExcel(sel) {
    if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمّل، أضف سطر السكريبت في الـ HTML.'); return; }
    const p = rvxPeriod();
    const scope = sel ? p.rows.filter(x => rvxOfficeKey(x.o) === sel) : p.rows;
    const trs = rvxSettlements(p, sel || '');
    if (!scope.length && !trs.length) { alert('لا توجد بيانات في هذه الفترة.'); return; }

    const COLS = 11;
    const C = { border: 'FFE2E8F0', head: 'FFF1F5F9', foot: 'FFF8FAFC', green: 'FF047857', dark: 'FF1E293B', grey: 'FF64748B' };
    const thin = { style: 'thin', color: { argb: C.border } };
    const box = { top: thin, bottom: thin, left: thin, right: thin };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const font = o => Object.assign({ name: 'Arial', size: 10, color: { argb: C.dark } }, o);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('تقرير المراجعة', {
        views: [{ rightToLeft: true, showGridLines: false }],
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    [14, 22, 15, 16, 13, 13, 20, 12, 16, 16, 13].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    let r = 1;
    const line = (text, f, h) => {
        ws.mergeCells(r, 1, r, COLS);
        const c = ws.getCell(r, 1);
        c.value = text; c.font = font(f); c.alignment = { horizontal: 'right', vertical: 'middle' };
        if (h) ws.getRow(r).height = h;
        r++;
    };
    const gap = () => { r++; };
    const row = (vals, spans, style, h) => {
        let col = 1;
        vals.forEach((v, i) => {
            const span = spans[i];
            if (span > 1) ws.mergeCells(r, col, r, col + span - 1);
            for (let k = 0; k < span; k++) ws.getCell(r, col + k).border = box;
            const c = ws.getCell(r, col);
            c.value = v;
            style(c, i, v);
            col += span;
        });
        if (h) ws.getRow(r).height = h;
        r++;
    };
    const table = (heads, spans, body, foot, textCols) => {
        row(heads, spans, c => {
            c.font = font({ bold: true }); c.fill = fill(C.head);
            c.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        body.forEach(vals => row(vals, spans, (c, i, v) => {
            c.alignment = { horizontal: textCols.includes(i) ? 'right' : 'center', vertical: 'middle' };
            if (typeof v === 'number') c.numFmt = '#,##0';
        }));
        if (foot) row(foot, spans, (c, i, v) => {
            c.font = font({ bold: true }); c.fill = fill(C.foot);
            c.alignment = { horizontal: i === 0 ? 'right' : 'center', vertical: 'middle' };
            if (typeof v === 'number') c.numFmt = '#,##0';
        });
    };

    // العنوان
    line('تقرير المراجعة' + (sel ? ' — ' + sel : ''), { bold: true, size: 18 }, 30);
    line(`${rvxPeriodTitle(p)} · تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}`, { color: { argb: C.grey } });
    gap();

    // كروت الحالات
    const cnt = {};
    scope.forEach(x => {
        const k = rvCategory(x.o);
        if (k) cnt[k] = (cnt[k] || 0) + 1;
        if (k !== 'ret' && String(x.o.returns ?? '').trim() !== '') cnt.ret = (cnt.ret || 0) + 1;
    });
    const total = scope.reduce((s, x) => s + rvNum(x.o.total), 0);
    const collected = scope.reduce((s, x) => s + rvNum(x.o.collected), 0);
    const commission = scope.reduce((s, x) => s + rvCommission(x.o), 0);
    const ones = Array(COLS).fill(1);
    row(['الطلبات', 'إجمالي القيمة', 'التحصيل', 'إجمالي العمولة', 'الاستلامات', 'الجزئي', 'الاستبدال', 'رفض رفض', 'رفض دفع', 'تدوير', 'مرتجع'],
        ones, c => { c.font = font({ bold: true, size: 9, color: { argb: C.green } }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }, 20);
    row([scope.length, total, collected, commission, cnt.recv || 0, cnt.partial || 0, cnt.exch || 0, cnt.rr || 0, cnt.rp || 0, cnt.rot || 0, cnt.ret || 0],
        ones, c => { c.font = font({ bold: true, size: 14 }); c.alignment = { horizontal: 'center', vertical: 'middle' }; c.numFmt = '#,##0'; }, 28);
    gap();

    // حسابات المكاتب
    line('حسابات المكاتب', { bold: true, size: 12 }, 22);
    const names = sel ? [sel] : [...new Set(p.rows.map(x => rvxOfficeKey(x.o)))]
        .sort((a, b) => rvxSummary(p, b).n - rvxSummary(p, a).n);
    const sums = { n: 0, delivered: 0, collected: 0, commission: 0, send: 0, paid: 0, rem: 0 };
    const officeRows = names.map(n => {
        const s = rvxSummary(p, n);
        Object.keys(sums).forEach(k => { sums[k] += s[k]; });
        return [n, s.n, s.delivered, s.collected, s.commission, s.send, s.paid, s.rem];
    });
    table(['المكتب', 'العدد', 'المكتمل', 'التحصيل', 'العمولة', 'المطلوب سداده', 'المحوّل', 'المديونية'],
        [2, 1, 1, 1, 1, 2, 1, 2], officeRows,
        ['الإجمالي', sums.n, sums.delivered, sums.collected, sums.commission, sums.send, sums.paid, sums.rem], [0]);
    gap();

    // التحويلات
    line('التحويلات', { bold: true, size: 12 }, 22);
    if (sel) {
        table(['التاريخ', 'النوع', 'المبلغ (جم)', 'ملاحظة'], [2, 3, 3, 3],
            trs.length ? trs.map(t => [t.day, t.type || '—', rvNum(t.amount), t.note || '']) : [['لا توجد تحويلات', '', '', '']], null, [3]);
    } else {
        table(['التاريخ', 'المكتب', 'النوع', 'المبلغ (جم)', 'ملاحظة'], [2, 2, 2, 2, 3],
            trs.length ? trs.map(t => [t.day, t.officeName || RVX_OFFICELESS, t.type || '—', rvNum(t.amount), t.note || '']) : [['لا توجد تحويلات', '', '', '', '']], null, [1, 4]);
    }
    gap();

    // الأوردرات
    line(`الأوردرات (${rvFmt(scope.length)})`, { bold: true, size: 12 }, 22);
    const t = v => String(v ?? '');
    table(['ID', 'العميل', 'الهاتف', 'الحالة', 'الإجمالي', 'التحصيل', 'المكتب', 'العمولة', 'المنطقة', 'المندوب', 'التاريخ'], ones,
        scope.map(x => {
            const o = x.o;
            return [t(o.orderId), t(o.customerName), t(o.phone), t(o.status), rvNum(o.total), rvNum(o.collected),
            rvxOfficeKey(o), rvCommission(o), t(o.area), t(o.rider), rvDayKey(x.d)];
        }), null, [1, 6, 8, 9]);

    // تنزيل
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sel ? rvxFileSafe(sel) : 'تقرير'}_${p.label}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ملف مكتب واحد
function reviewExportOffice(name) { return rvxBuildExcel(name); }
// نفس التقرير بتاع الـ PDF: المكتب المختار لو في واحد، وإلا كل المكاتب في شيت واحد
function reviewExportExcelReport() { return rvxBuildExcel(reviewSelectedOffice || null); }

// الزر: المكتب المختار حالياً
function reviewExportSelectedOffice() {
    if (!reviewSelectedOffice) { alert('اختار مكتب الأول (اضغط على المكتب من جدول حسابات المكاتب).'); return; }
    reviewExportOffice(reviewSelectedOffice);
}

// الزر: ملف منفصل لكل مكتب عنده أوردرات أو تحويلات في الفترة
function reviewExportAllOffices() {
    const p = rvxPeriod();
    const names = new Set(p.rows.map(x => rvxOfficeKey(x.o)));
    rvxSettlements(p).forEach(s => names.add(String(s.officeName || RVX_OFFICELESS)));
    const list = [...names];
    if (!list.length) { alert('لا توجد بيانات في هذه الفترة.'); return; }
    list.forEach((n, i) => setTimeout(() => reviewExportOffice(n), i * 500));   // فاصل بسيط عشان المتصفح ما يمنعش التحميلات
}

// ---------- تقرير PDF (طباعة → حفظ كـ PDF) ----------
function reviewExportPDF() {
    const p = rvxPeriod();
    const sel = reviewSelectedOffice;
    const scope = sel ? p.rows.filter(x => rvxOfficeKey(x.o) === sel) : p.rows;
    if (!scope.length) { alert('لا توجد أوردرات في هذه الفترة.'); return; }

    const periodTitle = p.dayVal
        ? new Date(p.dayVal + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'شهر ' + new Date(p.monthVal + '-01T00:00:00').toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

    // كروت الحالات
    const cats = { recv: 'الاستلامات', partial: 'الجزئي', exch: 'الاستبدال', rr: 'رفض رفض', rp: 'رفض دفع', rot: 'تدوير', ret: 'مرتجع' };
    const cnt = {};
    scope.forEach(x => {
        const k = rvCategory(x.o);
        if (k) cnt[k] = (cnt[k] || 0) + 1;
        if (k !== 'ret' && String(x.o.returns ?? '').trim() !== '') cnt.ret = (cnt.ret || 0) + 1;
    });
    const total = scope.reduce((s, x) => s + rvNum(x.o.total), 0);
    const collected = scope.reduce((s, x) => s + rvNum(x.o.collected), 0);
    const commission = scope.reduce((s, x) => s + rvCommission(x.o), 0);

    const card = (l, v) => `<div class="card"><div class="l">${rvEsc(l)}</div><div class="v">${v}</div></div>`;
    const cards = card('الطلبات', rvFmt(scope.length)) + card('إجمالي القيمة', rvFmt(total)) + card('التحصيل', rvFmt(collected)) +
        card('إجمالي العمولة', rvFmt(commission)) +
        Object.keys(cats).map(k => card(cats[k], rvFmt(cnt[k] || 0))).join('');

    // جدول المكاتب
    const names = sel ? [sel] : [...new Set(p.rows.map(x => rvxOfficeKey(x.o)))]
        .sort((a, b) => rvxSummary(p, b).n - rvxSummary(p, a).n);
    let sumPaid = 0, sumRem = 0;
    const officeRows = names.map(n => {
        const s = rvxSummary(p, n);
        sumPaid += s.paid; sumRem += s.rem;
        return `<tr><td class="r">${rvEsc(n)}</td><td>${rvFmt(s.n)}</td><td>${rvFmt(s.delivered)}</td><td>${rvFmt(s.collected)}</td>
            <td>${rvFmt(s.commission)}</td><td>${rvFmt(s.send)}</td><td>${rvFmt(s.paid)}</td><td><b>${rvFmt(s.rem)}</b></td></tr>`;
    }).join('');

    // التحويلات
    const trs = rvxSettlements(p, sel || '');
    const trRows = trs.length ? trs.map(t => `<tr><td>${rvEsc(t.day)}</td>${sel ? '' : `<td class="r">${rvEsc(t.officeName || RVX_OFFICELESS)}</td>`}
        <td>${rvEsc(t.type || '—')}</td><td>${rvFmt(rvNum(t.amount))}</td><td class="r">${rvEsc(t.note || '')}</td></tr>`).join('')
        : `<tr><td colspan="${sel ? 4 : 5}">لا توجد تحويلات</td></tr>`;

    // الأوردرات
    const orderRows = scope.map(x => {
        const o = x.o;
        return `<tr><td>${rvEsc(o.orderId)}</td><td class="r">${rvEsc(o.customerName)}</td><td>${rvEsc(o.phone)}</td><td>${rvEsc(o.status)}</td>
            <td>${rvFmt(rvNum(o.total))}</td><td>${rvFmt(rvNum(o.collected))}</td><td class="r">${rvEsc(rvxOfficeKey(o))}</td>
            <td>${rvFmt(rvCommission(o))}</td><td class="r">${rvEsc(o.area)}</td><td class="r">${rvEsc(o.rider)}</td><td>${rvDayKey(x.d)}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>تقرير المراجعة - ${rvEsc(p.label)}${sel ? ' - ' + rvEsc(sel) : ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: 'Cairo', sans-serif; font-size: 11px; color: #1e293b; margin: 0; }
h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 16px 0 6px; }
.sub { color: #64748b; margin-bottom: 10px; }
.cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; text-align: center; }
.card .l { color: #047857; font-weight: 600; } .card .v { font-size: 15px; font-weight: 700; }
table { width: 100%; border-collapse: collapse; text-align: center; }
th, td { border: 1px solid #e2e8f0; padding: 4px 5px; } th { background: #f1f5f9; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
td.r { text-align: right; } tfoot td { background: #f8fafc; font-weight: 700; }
</style></head><body>
<h1>تقرير المراجعة${sel ? ' — ' + rvEsc(sel) : ''}</h1>
<div class="sub">${rvEsc(periodTitle)} · تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
<div class="cards">${cards}</div>

<h2>حسابات المكاتب</h2>
<table><thead><tr><th>المكتب</th><th>العدد</th><th>المكتمل</th><th>التحصيل</th><th>العمولة</th><th>المطلوب سداده</th><th>المحوّل</th><th>المديونية</th></tr></thead>
<tbody>${officeRows}</tbody>
<tfoot><tr><td class="r">الإجمالي</td><td colspan="5"></td><td>${rvFmt(sumPaid)}</td><td>${rvFmt(sumRem)}</td></tr></tfoot></table>

<h2>التحويلات</h2>
<table><thead><tr><th>التاريخ</th>${sel ? '' : '<th>المكتب</th>'}<th>النوع</th><th>المبلغ (جم)</th><th>ملاحظة</th></tr></thead><tbody>${trRows}</tbody></table>

<h2>الأوردرات (${rvFmt(scope.length)})</h2>
<table><thead><tr><th>ID</th><th>العميل</th><th>الهاتف</th><th>الحالة</th><th>الإجمالي</th><th>التحصيل</th><th>المكتب</th><th>العمولة</th><th>المنطقة</th><th>المندوب</th><th>التاريخ</th></tr></thead>
<tbody>${orderRows}</tbody></table>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('المتصفح منع النافذة، اسمح بالـ Pop-ups للموقع.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => { w.focus(); w.print(); };
    w.onload = () => (w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready.then(go) : go());
}