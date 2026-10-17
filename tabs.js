let currentMainIndex = 1;

// تخزين التاب الفرعي النشط لكل تاب رئيسي (افتراضياً التاب الفرعي رقم 1)
let currentSubIndices = {
    4: 1,
    5: 1
};

const mainTabNames = {
    1: "الطلبات",
    2: "التقسيم",
    3: "التقارير",
    4: "اداره الموظفين",
    5: "الإعدادات",
    6: "التطبيقات"
};

function updateIndicator(tabIndex) {
    const activeBtn = document.getElementById(`main-btn-${tabIndex}`);
    const indicator = document.getElementById('tab-indicator');
    if (!activeBtn || !indicator) return;

    const container = activeBtn.parentElement;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    // حساب المسافة من جهة اليمين للحاويات التي تعمل بنظام RTL
    const rightOffset = containerRect.right - btnRect.right;

    indicator.style.width = `${btnRect.width}px`;
    indicator.style.right = `${rightOffset}px`;
}

function switchMainTab(tabIndex, saveToStorage = true) {
    const targetPanel = document.getElementById(`main-panel-${tabIndex}`);
    if (tabIndex === currentMainIndex && targetPanel && !targetPanel.classList.contains('hidden')) return;

    const direction = tabIndex > currentMainIndex ? 'translate-x-10' : '-translate-x-10';
    currentMainIndex = tabIndex;

    if (saveToStorage) {
        localStorage.setItem('activeMainTab', tabIndex);
    }

    // 1. Update buttons style
    for (let i = 1; i <= 6; i++) {
        const btn = document.getElementById(`main-btn-${i}`);
        if (!btn) continue;
        if (i === tabIndex) {
            btn.className = "main-tab-btn flex-1 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2.5 text-white z-10 relative";
        } else {
            btn.className = "main-tab-btn flex-1 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50 z-10 relative";
        }
    }

    // Move the sliding pill indicator
    updateIndicator(tabIndex);

    // **تحديث محتوى التوب بار بناءً على التاب النشطة**
    updateTopBar(tabIndex);

    // 2. Hide all panels and animate target panel
    for (let i = 1; i <= 6; i++) {
        const panel = document.getElementById(`main-panel-${i}`);
        if (!panel) continue;
        if (i === tabIndex) {
            panel.classList.remove('hidden');
            panel.classList.add('opacity-0', direction, 'scale-95');
            void panel.offsetWidth;
            panel.classList.remove('opacity-0', direction, 'scale-95');
            panel.classList.add('opacity-100', 'translate-x-0', 'scale-100');
        } else {
            panel.classList.add('hidden');
            panel.classList.remove('opacity-100', 'translate-x-0', 'scale-100');
            panel.classList.add('opacity-0', 'scale-95');
        }
    }
}

// دالة التبديل بين التبويبات الفرعية مع الحفظ
// دالة التبديل بين التبويبات الفرعية مع الحفظ
function switchSubTab(mainIndex, subIndex, saveToStorage = true) {
    currentSubIndices[mainIndex] = subIndex;

    if (saveToStorage) {
        localStorage.setItem(`activeSubTab_${mainIndex}`, subIndex);
    }

    // البحث عن جميع الأزرار واللوحات الفرعية الخاصة بهذا التاب الرئيسي ديناميكياً
    const subBtns = document.querySelectorAll(`[id^="sub-btn-${mainIndex}-"]`);
    const subPanels = document.querySelectorAll(`[id^="sub-panel-${mainIndex}-"]`);

    subBtns.forEach((btn, idx) => {
        const i = idx + 1;
        if (i === subIndex) {
            btn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
        } else {
            btn.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
        }
    });

    subPanels.forEach((panel, idx) => {
        const i = idx + 1;
        if (i === subIndex) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

// إلغاء الكائن القديم topBarContents لأنه أصبح في الـ HTML

// تحديث دالة updateTopBar للتعامل مع الـ HTML Elements
function updateTopBar(tabIndex) {
    for (let i = 1; i <= 6; i++) {
        const panel = document.getElementById(`topbar-panel-${i}`);
        if (!panel) continue;

        if (i === tabIndex) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
}




// عند تحميل الصفحة، نقرأ التاب الرئيسي والتابات الفرعية المحفوظة
window.addEventListener('load', () => {
    const savedMainTab = localStorage.getItem('activeMainTab');
    const initialMainTab = savedMainTab ? parseInt(savedMainTab) : 1;

    // تفعيل التاب الرئيسي المحفوظ
    switchMainTab(initialMainTab, false);

    // تأخير بسيط لضمان قياس الأبعاد بدقة عند الفتح لأول مرة
    setTimeout(() => {
        updateIndicator(initialMainTab);
    }, 50);

    // تفعيل التابسات الفرعية المحفوظة للتابين 4 و 5
    [4, 5].forEach(mainIdx => {
        const savedSubTab = localStorage.getItem(`activeSubTab_${mainIdx}`);
        const initialSubTab = savedSubTab ? parseInt(savedSubTab) : 1;
        switchSubTab(mainIdx, initialSubTab, false);
    });
});

window.addEventListener('resize', () => updateIndicator(currentMainIndex));