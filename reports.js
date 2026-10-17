let allOrders = [
    {
        id: 1,
        date: "2026-09-23",
        driverName: "محمد أحمد",
        driverPhone: "01012345678",
        officeName: "مكتب السريع",
        officePhone: "01198765432",
        status: "delivered",
        amount: 500
    },
    {
        id: 2,
        date: "2026-09-22",
        driverName: "محمود علي",
        driverPhone: "01234567890",
        officeName: "أكسبريس لوجستيك",
        officePhone: "01511223344",
        status: "partial",
        amount: 300
    }
];

let userInputsData = {
    drivers: {},
    offices: {}
};

function applyDateFilter() {
    const searchTerm = document.getElementById('search-all-input')?.value.toLowerCase().trim() || "";

    let driversMap = {};
    let officesMap = {};

    allOrders.forEach(order => {
        let dKey = order.driverPhone;
        if (!driversMap[dKey]) {
            let saved = userInputsData.drivers[dKey] || { deduction: 0, commissionRate: 0 };
            driversMap[dKey] = { 
                name: order.driverName, phone: order.driverPhone, 
                total: 0, delivered: 0, returned: 0, partial: 0, exchange: 0, 
                amount: 0, deduction: saved.deduction, commissionRate: saved.commissionRate 
            };
        }
        driversMap[dKey].total++;
        if (order.status === 'delivered') {
            driversMap[dKey].delivered++;
            driversMap[dKey].amount += (order.amount || 0);
        } else if (order.status === 'partial') {
            driversMap[dKey].partial++;
            driversMap[dKey].amount += (order.amount || 0);
        } else if (order.status === 'returned') {
            driversMap[dKey].returned++;
        } else if (order.status === 'exchange') {
            driversMap[dKey].exchange++;
        }

        let oKey = order.officePhone;
        if (!officesMap[oKey]) {
            let saved = userInputsData.offices[oKey] || { deduction: 0, commission: 0 };
            officesMap[oKey] = { 
                name: order.officeName, phone: order.officePhone, 
                total: 0, delivered: 0, returned: 0, partial: 0, exchange: 0, 
                amount: 0, deduction: saved.deduction, commission: saved.commission 
            };
        }
        officesMap[oKey].total++;
        if (order.status === 'delivered') {
            officesMap[oKey].delivered++;
            officesMap[oKey].amount += (order.amount || 0);
        } else if (order.status === 'partial') {
            officesMap[oKey].partial++;
            officesMap[oKey].amount += (order.amount || 0);
        } else if (order.status === 'returned') {
            officesMap[oKey].returned++;
        } else if (order.status === 'exchange') {
            officesMap[oKey].exchange++;
        }
    });

    let driversList = Object.values(driversMap);
    let officesList = Object.values(officesMap);

    // تطبيق البحث الموحد على الجدولين
    if (searchTerm !== "") {
        driversList = driversList.filter(d => d.name.toLowerCase().includes(searchTerm) || d.phone.includes(searchTerm));
        officesList = officesList.filter(o => o.name.toLowerCase().includes(searchTerm) || o.phone.includes(searchTerm));
    }

    renderTables(driversList, officesList);
}

function renderTables(drivers, offices) {
    const driversTbody = document.getElementById('drivers-report-tbody');
    const officesTbody = document.getElementById('offices-report-tbody');
    
    if (!driversTbody || !officesTbody) return;

    document.getElementById('drivers-count').textContent = drivers.length;
    document.getElementById('offices-count').textContent = offices.length;

    driversTbody.innerHTML = "";
    officesTbody.innerHTML = "";

    // تعبئة جدول المناديب
    if (drivers.length === 0) {
        driversTbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-slate-400">لا توجد بيانات مناديب مطابقة للبحث</td></tr>`;
    } else {
        drivers.forEach(d => {
            let successRate = d.total > 0 ? Math.round(((d.delivered + d.partial) / d.total) * 100) : 0;
            let eligibleOrders = d.delivered + d.partial + d.exchange; 
            let totalCommission = eligibleOrders * d.commissionRate;
            let netDriverAmount = (d.amount - d.deduction) + totalCommission;

            driversTbody.innerHTML += `
                <tr class="hover:bg-slate-50/50 transition-colors" data-driver-phone="${d.phone}">
                    <td class="p-3 font-medium text-slate-800">${d.name} <span class="text-slate-400 block text-[10px]">${d.phone}</span></td>
                    <td class="p-3 text-center text-emerald-600 font-bold">${d.delivered}</td>
                    <td class="p-3 text-center text-rose-600 font-bold">${d.returned}</td>
                    <td class="p-3 text-center text-amber-600 font-bold">${d.partial}</td>
                    <td class="p-3 text-center text-purple-600 font-bold">${d.exchange}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${successRate}%</td>
                    <td class="p-3 text-center font-bold text-slate-800 amount-base">${d.amount} ج.م</td>
                    <td class="p-3 text-center">
                        <input type="number" value="${d.deduction}" class="w-20 bg-slate-50 border border-slate-200 rounded-lg p-1 text-center text-rose-600 font-bold driver-deduction focus:outline-none focus:border-rose-500" placeholder="0">
                    </td>
                    <td class="p-3 text-center">
                        <input type="number" value="${d.commissionRate}" class="w-20 bg-slate-50 border border-slate-200 rounded-lg p-1 text-center text-indigo-600 font-bold driver-commission-rate" placeholder="0">
                        <span class="block text-[10px] text-indigo-400 mt-0.5">إجمالي: <span class="total-commission-val">${totalCommission}</span></span>
                    </td>
                    <td class="p-3 text-left font-bold text-emerald-700 net-amount">${netDriverAmount} ج.م</td>
                </tr>
            `;
        });
    }

    // تعبئة جدول المكاتب
    if (offices.length === 0) {
        officesTbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-slate-400">لا توجد بيانات مكاتب مطابقة للبحث</td></tr>`;
    } else {
        offices.forEach(o => {
            let successRate = o.total > 0 ? Math.round(((o.delivered + o.partial) / o.total) * 100) : 0;
            let netOfficeAmount = (o.amount - o.deduction) - o.commission;
            officesTbody.innerHTML += `
                <tr class="hover:bg-slate-50/50 transition-colors" data-office-phone="${o.phone}">
                    <td class="p-3 font-medium text-slate-800">${o.name} <span class="text-slate-400 block text-[10px]">${o.phone}</span></td>
                    <td class="p-3 text-center font-bold">${o.total}</td>
                    <td class="p-3 text-center text-emerald-600 font-bold">${o.delivered}</td>
                    <td class="p-3 text-center text-rose-600 font-bold">${o.returned}</td>
                    <td class="p-3 text-center text-amber-600 font-bold">${o.partial}</td>
                    <td class="p-3 text-center text-purple-600 font-bold">${o.exchange}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${successRate}%</td>
                    <td class="p-3 text-center font-bold text-slate-800 amount-base">${o.amount} ج.م</td>
                    <td class="p-3 text-center">
                        <input type="number" value="${o.deduction}" class="w-20 bg-slate-50 border border-slate-200 rounded-lg p-1 text-center text-rose-600 font-bold office-deduction focus:outline-none focus:border-rose-500" placeholder="0">
                    </td>
                    <td class="p-3 text-center">
                        <input type="number" value="${o.commission}" class="w-20 bg-slate-50 border border-slate-200 rounded-lg p-1 text-center text-blue-600 font-bold office-commission focus:outline-none focus:border-blue-500" placeholder="0">
                    </td>
                    <td class="p-3 text-left font-bold text-blue-800 net-amount">${netOfficeAmount} ج.م</td>
                </tr>
            `;
        });
    }

    attachInputListeners();
}

function attachInputListeners() {
    document.querySelectorAll('#drivers-report-tbody tr').forEach(row => {
        let phone = row.getAttribute('data-driver-phone');
        let dedInput = row.querySelector('.driver-deduction');
        let comRateInput = row.querySelector('.driver-commission-rate');
        let totalComSpan = row.querySelector('.total-commission-val');
        let netCell = row.querySelector('.net-amount');
        let baseAmount = parseFloat(row.querySelector('.amount-base').textContent) || 0;
        
        let delivered = parseInt(row.children[1].textContent) || 0;
        let partial = parseInt(row.children[3].textContent) || 0;
        let exchange = parseInt(row.children[4].textContent) || 0;
        let eligibleOrders = delivered + partial + exchange;

        let updateCalc = () => {
            let ded = parseFloat(dedInput.value) || 0;
            let comRate = parseFloat(comRateInput.value) || 0;
            let totalCom = eligibleOrders * comRate;
            let net = (baseAmount - ded) + totalCom;

            totalComSpan.textContent = totalCom;
            netCell.textContent = net + " ج.م";

            if (!userInputsData.drivers[phone]) userInputsData.drivers[phone] = {};
            userInputsData.drivers[phone].deduction = ded;
            userInputsData.drivers[phone].commissionRate = comRate;
        };

        dedInput?.addEventListener('input', updateCalc);
        comRateInput?.addEventListener('input', updateCalc);
    });

    document.querySelectorAll('#offices-report-tbody tr').forEach(row => {
        let phone = row.getAttribute('data-office-phone');
        let dedInput = row.querySelector('.office-deduction');
        let comInput = row.querySelector('.office-commission');
        let netCell = row.querySelector('.net-amount');
        let baseAmount = parseFloat(row.querySelector('.amount-base').textContent) || 0;

        let updateCalc = () => {
            let ded = parseFloat(dedInput.value) || 0;
            let com = parseFloat(comInput.value) || 0;
            let net = (baseAmount - ded) - com;
            netCell.textContent = net + " ج.م";

            if (!userInputsData.offices[phone]) userInputsData.offices[phone] = {};
            userInputsData.offices[phone].deduction = ded;
            userInputsData.offices[phone].commission = com;
        };

        dedInput?.addEventListener('input', updateCalc);
        comInput?.addEventListener('input', updateCalc);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-all-input')?.addEventListener('input', applyDateFilter);
    applyDateFilter();
});