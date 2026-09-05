const firebaseConfig = {

    apiKey: "AIzaSyDOXucjJQHpWHH1Gc6BKdFkRgFGNsIoxoo",

    authDomain: "supermarket-b0553.firebaseapp.com",

    projectId: "supermarket-b0553",

    storageBucket: "supermarket-b0553.firebasestorage.app",

    messagingSenderId: "905002063423",

    appId: "1:905002063423:web:e7ab2a26c9cffecb1b4a8a"

};

let db = null;

let firebaseReady = false;

function isPlaceholderFirebaseConfig() {

    return Object.values(firebaseConfig).some(value =>

        typeof value === "string" && value.includes("YOUR_")

    );

}

function setConnectionStatus(message, type = "error") {

    const el = document.getElementById("connectionStatus");

    if (!el) return;

    if (!message) {

        el.textContent = "";

        el.className = "connection-status";

        return;

    }

    el.textContent = message;

    el.className = `connection-status show ${type}`;

}

function initializeFirebase() {

    try {

        if (typeof firebase === "undefined") {

            throw new Error("Firebase library was not loaded.");

        }

        if (isPlaceholderFirebaseConfig()) {

            setConnectionStatus(

                "تنبيه: بيانات Firebase غير مكتملة. ضع Firebase Config الحقيقية داخل login.js.",

                "error"

            );

            console.error("Firebase Config still contains YOUR_* placeholders.");

            return false;

        }

        if (!firebase.apps.length) {

            firebase.initializeApp(firebaseConfig);

        }

        db = firebase.firestore();

        firebaseReady = true;

        setConnectionStatus("تم الاتصال بقاعدة البيانات.", "success");

        setTimeout(() => {

            if (firebaseReady) setConnectionStatus("");

        }, 2500);

        return true;

    } catch (error) {

        firebaseReady = false;

        console.error("Firebase initialization error:", error);

        setConnectionStatus(

            "تعذر تشغيل Firebase. راجع Firebase Config وConsole في المتصفح.",

            "error"

        );

        return false;

    }

}

let allProductsCache = [];

let allPriceUpdatesCache = [];
let allDebtCustomersCache = [];
let allCustomersCache = [];
let customerTransactionsCache = new Map();
let selectedShakakCustomerId = null;
let selectedDebtCustomerId = null;
let selectedDebtCustomerData = null;
let confirmCallback = null;

let activeScanner = null;

let activeScannerElementId = null;

const defaultProductCategories = [
    "مشروبات", "شيبسي", "بسكويت", "زيوت", "ألبان", "معلبات", "منظفات", "أخرى"
];

let productCategories = [];
let categoryDialogResolver = null;

function loadProductCategories() {
    try {
        const saved = JSON.parse(localStorage.getItem("productCategories") || "[]");
        productCategories = [...new Set([...defaultProductCategories, ...saved].filter(Boolean))];
    } catch (error) {
        productCategories = [...defaultProductCategories];
    }
}

function saveProductCategories() {
    localStorage.setItem("productCategories", JSON.stringify(productCategories));
}

function populateProductCategories(selectedValue = "") {
    const select = document.getElementById("productCategory");
    const filter = document.getElementById("productCategoryFilter");

    const categories = [...new Set([...productCategories, selectedValue].filter(Boolean))];
    if (select) {
        select.innerHTML = '<option value="" disabled hidden></option>' + categories.map(category =>
            `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
        ).join("");
        select.value = selectedValue;
    }
    if (filter) {
        const currentFilter = filter.value;
        filter.innerHTML = '<option value="">كل الأقسام</option>' + categories.map(category =>
            `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
        ).join("");
        filter.value = categories.includes(currentFilter) ? currentFilter : "";
    }
}

function getProductCategory(product) {
    return String(product?.category || "").trim();
}

function normalizeCategoryText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[إأآا]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/[ًٌٍَُِّْـ]/g, "")
        .replace(/[^\u0600-\u06ff\w]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function suggestCategoryFromName(name) {
    const value = normalizeCategoryText(name);
    if (!value) return "";
    const keywords = {
        "مشروبات": ["عصير", "جوس", "بيبسي", "بيبيسي", "كولا", "كوكاكولا", "مشروب", "مياه", "ماء", "شاي", "شاى", "قهوة", "قهوه", "نسكافيه", "نسكفيه", "فيروز", "سبيرو سباتس", "ميرندا", "سفن", "سفن اب", "ريد بول", "مشروب طاقه", "باور هورس", "ستينج", "بيبسي دايت", "فانتا", "ديو", "تانج", "راني", "ايد", "energy", "drink", "juice", "water", "cola", "pepsi", "coca", "fanta", "red bull"],
        "شيبسي": ["شيبسي", "شيبس", "تشيبس", "بطاطس", "مقرمش", "مقرمشات", "سناكس", "سناك", "فشار", "ذره مقرمشه", "كرسبي", "بفك", "بوشار", "تسالي", "لب", "فول سوداني", "crackers", "chips", "snack", "doritos", "lays", "ليز", "تايجر", "برينجلز", "pringles", "cheetos", "cheetos"],
        "بسكويت": ["بسكويت", "بسكوت", "ويفر", "شوكولاته", "شيكولاته", "شكولاته", "شوكولا", "كاكاو", "حلوى", "حلاوه", "كيك", "جاتوه", "كوكيز", "قرشله", "بسكويت شاي", "cookies", "biscuit", "wafer", "chocolate", "cocoa", "oreo", "اوريو", "جالكسي", "galaxy", "cadbury", "kinder", "kit kat", "مارس", "سنيكرز", "snickers", "twix", "milka", "toblerone"],
        "زيوت": ["زيت", "زيوت", "سمن", "سمنة", "كانولا", "ذره", "عباد الشمس", "زيت زيتون", "زيتون", "زيت حار", "زيت قلي", "oil", "ghee", "olive oil"],
        "ألبان": ["لبن", "حليب", "جبنه", "جبن", "زبادي", "زبادى", "رايب", "قشطه", "قشطة", "كريمه", "كريمة", "موتزاريلا", "فيتا", "لبنه", "لبان", "دانون", "جهينه", "المراعي", "dairy", "milk", "cheese", "yogurt", "cream"],
        "معلبات": ["معلب", "معلبات", "تونه", "تونة", "فول", "صلصه", "صلصة", "ذره", "حمص", "بسله", "بسلة", "لانشون", "سردين", "مربى", "مربي", "مكرونه", "مكرونة", "كاتشب", "مايونيز", "canned", "tuna", "beans", "pasta", "ketchup", "mayonnaise"],
        "منظفات": ["منظف", "منظفات", "مسحوق", "صابون", "كلور", "مطهر", "معطر", "سائل مواعين", "غسيل", "شامبو", "بلسم", "مناديل", "فيري", "بريل", "تايد", "اريال", "كلوركس", "داوني", "برسيل", "فانيش", "detergent", "soap", "cleaner", "shampoo", "fabric softener"],
        "أخرى": ["سجائر", "سيجاره", "سجاير", "تبغ", "دخان", "ولاعة", "مخبوز", "مخبوزات", "عيش", "خبز", "باتيه", "كرواسون", "فطير", "بقلاوه", "حلويات شرقيه", "cigarette", "tobacco", "bakery", "bread", "croissant", "pastry"]
    };
    const matches = Object.entries(keywords).flatMap(([category, words]) =>
        words.map(word => ({
            category,
            keyword: normalizeCategoryText(word)
        }))
    ).filter(match => match.keyword && value.includes(match.keyword));

    matches.sort((a, b) => b.keyword.length - a.keyword.length);
    return matches[0]?.category || "";
}

function suggestCategoryFromFile(fileName) {
    return suggestCategoryFromName(String(fileName || "").replace(/[._-]+/g, " "));
}

function applySuggestedCategory(name) {
    const suggestion = suggestCategoryFromName(name);
    const select = document.getElementById("productCategory");
    if (suggestion && select && productCategories.includes(suggestion) && !select.dataset.categoryManuallyChanged) {
        select.value = suggestion;
    }
}

async function updateProductCategoryReferences(oldCategory, newCategory) {
    const affected = allProductsCache.filter(product => getProductCategory(product) === oldCategory);
    affected.forEach(product => { product.category = newCategory; });

    if (firebaseReady && db && affected.length) {
        const batch = db.batch();
        affected.forEach(product => {
            batch.update(db.collection("products").doc(product.id), { category: newCategory });
        });
        await batch.commit();
    }
    displayProducts(allProductsCache);
}

function openCategoryManager() {
    renderCategoryManagerList();
    document.getElementById("categoryManagerModal").style.display = "flex";
}

function closeCategoryManager() {
    document.getElementById("categoryManagerModal").style.display = "none";
}

function closeCategoryDialog(value) {
    const modal = document.getElementById("categoryDialogModal");
    if (modal) modal.style.display = "none";
    if (categoryDialogResolver) {
        const resolve = categoryDialogResolver;
        categoryDialogResolver = null;
        resolve(value);
    }
}

function showCategoryDialog({ title, message = "", value = "", confirmText = "تأكيد", input = true }) {
    const modal = document.getElementById("categoryDialogModal");
    const titleElement = document.getElementById("categoryDialogTitle");
    const messageElement = document.getElementById("categoryDialogMessage");
    const inputElement = document.getElementById("categoryDialogInput");
    const confirmButton = document.getElementById("categoryDialogConfirm");
    if (!modal || !titleElement || !messageElement || !inputElement || !confirmButton) return Promise.resolve(null);

    titleElement.textContent = title;
    messageElement.textContent = message;
    inputElement.value = value;
    inputElement.hidden = !input;
    confirmButton.textContent = confirmText;
    modal.style.display = "flex";

    return new Promise(resolve => {
        categoryDialogResolver = resolve;
        confirmButton.onclick = () => closeCategoryDialog(input ? inputElement.value.trim() : true);
        if (input) requestAnimationFrame(() => inputElement.focus());
    });
}

function renderCategoryManagerList() {
    const list = document.getElementById("categoryManagerList");
    if (!list) return;
    list.innerHTML = productCategories.map(category => `
        <div class="category-manager-row">
            <span>${escapeHtml(category)}</span>
            <span class="category-manager-actions">
                <button type="button" onclick="renameCategory('${escapeHtml(category)}')">تعديل</button>
                <button type="button" class="danger" onclick="deleteCategory('${escapeHtml(category)}')">حذف</button>
            </span>
        </div>
    `).join("");
}

function addCategory(name) {
    const category = String(name || "").trim();
    if (!category) return false;
    if (productCategories.includes(category)) {
        showToast("القسم موجود بالفعل", false);
        return false;
    }
    productCategories.push(category);
    saveProductCategories();
    populateProductCategories(category);
    return true;
}

function addCategoryFromManager() {
    const input = document.getElementById("newCategoryName");
    if (addCategory(input?.value)) {
        input.value = "";
        renderCategoryManagerList();
        showToast("تمت إضافة القسم");
    }
}

async function renameCategory(oldCategory) {
    const newCategory = await showCategoryDialog({
        title: "تعديل اسم القسم",
        message: "اكتب الاسم الجديد للقسم",
        value: oldCategory,
        confirmText: "حفظ"
    });
    if (!newCategory || newCategory === oldCategory || productCategories.includes(newCategory)) return;
    productCategories = productCategories.map(category => category === oldCategory ? newCategory : category);
    saveProductCategories();
    await updateProductCategoryReferences(oldCategory, newCategory);
    populateProductCategories(newCategory);
    renderCategoryManagerList();
    showToast("تم تعديل القسم وربط المنتجات به");
}

async function deleteCategory(oldCategory) {
    const confirmed = await showCategoryDialog({
        title: "تأكيد حذف القسم",
        message: `سيتم حذف «${oldCategory}» نهائياً. ستبقى المنتجات المرتبطة به دون تغيير.`,
        confirmText: "حذف نهائياً",
        input: false
    });
    if (!confirmed) return;
    productCategories = productCategories.filter(category => category !== oldCategory);
    saveProductCategories();
    populateProductCategories("");
    renderCategoryManagerList();
    displayProducts(allProductsCache);
    showToast("تم حذف القسم");
}

function playBeep() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "square";
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.frequency.setValueAtTime(2400, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.start(now);
        osc.stop(now + 0.1);

        osc.addEventListener("ended", () => {
            try { audioCtx.close(); } catch (e) {}
        });
    } catch (e) {
    }
}

function playBeepSound() {
    playBeep();
}

function vibrateAfterScan() {
    try {
        if (typeof navigator.vibrate === "function") navigator.vibrate(100);
    } catch (error) {
    }
}

function showToast(msg, isSuccess = true) {

    const toast = document.getElementById("toast");

    if (!toast) return;

    toast.textContent = msg;

    toast.style.background = isSuccess

        ? "linear-gradient(135deg, #10b981, #059669)"

        : "linear-gradient(135deg, #f43f5e, #e11d48)";

    toast.className = "show";

    playBeep();

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {

        toast.className = "";

    }, 3000);

}

let modalScrollLockCount = 0;

function lockBodyScrollForModal() {
    modalScrollLockCount += 1;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
}

function unlockBodyScrollForModal() {
    if (modalScrollLockCount > 0) {
        modalScrollLockCount -= 1;
    }
    if (modalScrollLockCount === 0) {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    }
}

function isMobileInputViewport() {
    return window.matchMedia('(max-width: 767px)').matches;
}

function getInputDropdown(input) {
    const parent = input.closest('.pos-search-wrap, .shakak-customer-wrap, .report-date-control');
    if (!parent) return null;
    return parent.querySelector('.pos-autocomplete-results, .shakak-customer-results, .report-calendar');
}

function keepMobileInputVisible(input) {
    if (!isMobileInputViewport() || !input || !input.matches('input, select, textarea')) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport ? viewport.offsetTop : 0;
    const viewportHeight = viewport ? viewport.height : window.innerHeight;
    const keyboardBuffer = 96;
    const safeTop = viewportTop + 56;
    const safeBottom = viewportTop + viewportHeight - keyboardBuffer;
    const rect = input.getBoundingClientRect();
    const dropdown = getInputDropdown(input);
    const dropdownHeight = dropdown && getComputedStyle(dropdown).display !== 'none'
        ? Math.min(dropdown.scrollHeight || 0, 220)
        : 0;
    const needsSpaceAbove = Boolean(dropdown && rect.bottom + dropdownHeight > safeBottom);

    if (dropdown) {
        dropdown.classList.toggle('open-above', needsSpaceAbove);
        dropdown.style.top = needsSpaceAbove ? 'auto' : '100%';
        dropdown.style.bottom = needsSpaceAbove ? 'calc(100% + 4px)' : 'auto';
    }

    const targetTop = needsSpaceAbove
        ? Math.max(viewportTop + 20, rect.top - Math.max(0, dropdownHeight - 12))
        : Math.max(safeTop, rect.top);
    const targetBottom = needsSpaceAbove ? safeBottom : safeBottom - dropdownHeight;
    const scrollDelta = rect.bottom > targetBottom
        ? rect.bottom - targetBottom
        : rect.top < targetTop
            ? rect.top - targetTop
            : 0;

    if (Math.abs(scrollDelta) > 1) {
        window.scrollBy({ top: scrollDelta, behavior: 'smooth' });
    } else {
        input.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

document.addEventListener('focusin', event => {
    if (!event.target.matches('input, select, textarea')) return;
    window.setTimeout(() => keepMobileInputVisible(event.target), 250);
    window.setTimeout(() => keepMobileInputVisible(event.target), 550);
});

function isSelectableTextInput(element) {
    return element.matches('input[type="text"], input[type="number"], input:not([type]), textarea');
}

document.addEventListener('focusin', event => {
    if (!isSelectableTextInput(event.target)) return;
    if (event.target.dataset.autoSelectApplied === "1") return;
    event.target.dataset.autoSelectApplied = "1";
    requestAnimationFrame(() => {
        try { event.target.select(); } catch (error) {}
    });
});

document.addEventListener("DOMContentLoaded", () => {
    loadProductCategories();
    populateProductCategories();
});

function escapeHtml(value) {

    return String(value ?? "")

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");

}

function getProductById(id) {

    return allProductsCache.find(product => product.id === id) || null;

}

function compareProductsByCategory(a, b) {
    const categoryCompare = String(a.category || "أخرى").localeCompare(
        String(b.category || "أخرى"),
        "ar",
        { sensitivity: "base" }
    );
    if (categoryCompare !== 0) return categoryCompare;

    return String(a.name || "").localeCompare(
        String(b.name || ""),
        "ar",
        { sensitivity: "base" }
    );
}

function sortProductsByCategory(products) {
    return [...products].sort(compareProductsByCategory);
}

function normalizeProductName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeProductInputName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function parseProductName(value) {
    const normalized = normalizeProductInputName(value);
    const separatorIndex = normalized.search(/[.-]/);
    if (separatorIndex < 0) return { main: normalized, badge: "" };

    const main = normalized.slice(0, separatorIndex).trim();
    const badge = normalized.slice(separatorIndex + 1).trim();
    if (!main || !badge) return { main: normalized, badge: "" };
    return { main, badge };
}

function productNameMarkup(value) {
    const { main, badge } = parseProductName(value);
    return `<span class="product-name-main">${escapeHtml(main || "بدون اسم")}</span>${badge ? `<span class="product-name-badge">${escapeHtml(badge)}</span>` : ""}`;
}

function isDuplicateProductName(name, ignoreId = "") {
    const normalized = normalizeProductName(name);
    if (!normalized) return false;

    return allProductsCache.some(product => {
        const currentId = String(product.id || "");
        const currentName = normalizeProductName(product.name || "");
        return currentId !== ignoreId && currentName === normalized;
    });
}

function isDuplicateProductBarcode(barcode, ignoreId = "") {
    const normalizedBarcode = normalizeBarcode(barcode);
    if (!normalizedBarcode || normalizedBarcode === "بدونباركود") return false;

    return allProductsCache.some(product => {
        const currentId = String(product.id || "");
        return currentId !== ignoreId && normalizeBarcode(product.barcode) === normalizedBarcode;
    });
}

function getProductImageSource(item) {
    return String(item?.imageHd || item?.imageOriginal || item?.image || "").trim();
}

function isProductAvailable(product) {
    if (typeof product?.available === "boolean") return product.available;
    return String(product?.status || "available").toLowerCase() !== "unavailable";
}

function getProductStatusLabel(product) {
    return isProductAvailable(product) ? "متوفر" : "غير متوفر";
}

function getUpdateById(id) {

    return allPriceUpdatesCache.find(update => update.id === id) || null;

}



function getImageAsDataUrl(file) {

    return new Promise((resolve, reject) => {

        if (!file) {

            resolve(null);

            return;

        }

        const reader = new FileReader();

        reader.onload = event => {
            const image = new Image();

            image.onload = () => {
                const maxWidth = 400;
                const scale = Math.min(1, maxWidth / image.naturalWidth);
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");

                if (!context) {
                    reject(new Error("تعذر ضغط صورة المنتج."));
                    return;
                }

                canvas.width = width;
                canvas.height = height;
                context.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL("image/png"));
            };

            image.onerror = () => reject(new Error("تعذر قراءة صورة المنتج."));
            image.src = event.target.result;
        };

        reader.onerror = () => reject(new Error("تعذر قراءة صورة المنتج."));
        reader.readAsDataURL(file);

    });

}

async function refreshApp() {
    try {
        stopCurrentScanner();
        posCart = [];
        shakakCart = [];
        selectedShakakCustomerId = null;
        selectedDebtCustomerId = null;
        selectedDebtCustomerData = null;
    } catch (error) {
        console.warn("Refresh state reset warning:", error);
    }

    const reloadWithCacheBust = () => {
        const cachedUrl = new URL(window.location.href);
        cachedUrl.searchParams.set("v", String(Date.now()));
        window.location.replace(cachedUrl.toString());
    };

    const clearAppCachesSafely = async () => {
        try {
            if (!("caches" in window)) return;
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (error) {
            console.warn("Cache clear warning:", error);
        }
    };

    const refreshServiceWorkerSafely = async () => {
        if (!("serviceWorker" in navigator)) return;

        try {
            const registrations = await navigator.serviceWorker.getRegistrations();

            await Promise.all(registrations.map(async registration => {
                try {
                    await registration.update();
                } catch (error) {
                    console.warn("Service worker update warning:", error);
                }
            }));

            await Promise.all(registrations.map(async registration => {
                try {
                    const isUnregistered = await registration.unregister();
                    if (!isUnregistered) {
                        console.info("Service worker could not be unregistered; browser may keep control.");
                    }
                } catch (error) {
                    console.warn("Service worker unregister warning:", error);
                }
            }));
        } catch (error) {
            console.warn("Service worker refresh warning:", error);
        }
    };

    if (typeof showToast === "function") {
        showToast("جاري تحديث التطبيق...", true);
    }

    try {
        await refreshServiceWorkerSafely();
        await clearAppCachesSafely();
    } catch (error) {
        console.warn("PWA refresh fallback warning:", error);
    }

    setTimeout(() => {
        reloadWithCacheBust();
    }, 500);
}

function setThemeIcon(isDark) {
    const themeBtn = document.getElementById("themeToggleBtn");
    if (!themeBtn) return;
    themeBtn.textContent = isDark ? "🌙" : "☀️";
    themeBtn.setAttribute("aria-label", isDark ? "الوضع الليلي" : "الوضع النهاري");
    themeBtn.setAttribute("title", isDark ? "الوضع الليلي" : "الوضع النهاري");
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    try { 
        localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch (error) {}
    setThemeIcon(isDark);
}

function setupScrollTopButton() {
    const button = document.getElementById("scrollTopBtn");
    if (!button || button.dataset.ready === "1") return;
    button.dataset.ready = "1";

    const updateVisibility = () => {
        button.classList.toggle("is-visible", window.scrollY > 280);
    };

    window.addEventListener("scroll", updateVisibility, { passive: true });
    button.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    updateVisibility();
}

function switchTab(tab) {

    stopCurrentScanner();

    const mainContainer = document.querySelector(".container");
    const priceUpdatesSection = document.getElementById("priceUpdatesSection");

    if (mainContainer) {
        mainContainer.style.display = tab === "priceUpdates" ? "none" : "";
    }
    if (priceUpdatesSection) {
        priceUpdatesSection.style.display = tab === "priceUpdates" ? "block" : "none";
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {

        btn.classList.remove("active");

    });

    document.querySelectorAll(".tab-content, .section-content").forEach(section => {

        section.style.display = "none";

        section.classList.remove("active");

    });

    const tabMap = {
        pos: { buttonIndex: 0, sectionId: "pos-section" },
        add: { buttonIndex: 1, sectionId: "addSection" },
        search: { buttonIndex: 2, sectionId: "searchSection" },
        shakak: { buttonIndex: 3, sectionId: "shakakSection" },
        debts: { buttonIndex: 4, sectionId: "debtsSection" },
        reports: { buttonIndex: 5, sectionId: "reportsSection" },
        priceUpdates: { buttonIndex: null, sectionId: "priceUpdatesSection" }
    };

    const selected = tabMap[tab];

    if (!selected) return;

    const buttons = document.querySelectorAll(".tab-btn");

    const section = document.getElementById(selected.sectionId);

    if (selected.buttonIndex !== null && selected.buttonIndex !== undefined && buttons[selected.buttonIndex]) {

        buttons[selected.buttonIndex].classList.add("active");

    }

    if (section) {

        section.style.display = "block";

        section.classList.add("active");

    }

    if (tab === "reports" && typeof loadDailyReport === "function") {
        loadDailyReport();
    }

    if (tab === "search") {
        displayProducts(allProductsCache);
    }

}

function initRealtimeListeners() {

    if (!firebaseReady || !db) return;

    db.collection("products").onSnapshot(

        snapshot => {

            allProductsCache = [];

            snapshot.forEach(doc => {

                allProductsCache.push({

                    id: doc.id,

                    ...doc.data()

                });

            });

            allProductsCache = sortProductsByCategory(allProductsCache);

            populateProductCategories(document.getElementById("productCategory")?.value || "");

            updateStats(allProductsCache);

            displayProducts(allProductsCache);

        },

        error => {

            console.error("Products onSnapshot error:", error);

            setConnectionStatus(

                "تعذر قراءة المنتجات من Firestore. راجع قواعد Firestore والاتصال.",

                "error"

            );

        }

    );

    db.collection("price_updates_list").onSnapshot(

        snapshot => {

            allPriceUpdatesCache = [];

            snapshot.forEach(doc => {

                allPriceUpdatesCache.push({

                    id: doc.id,

                    ...doc.data()

                });

            });

            allPriceUpdatesCache.sort((a, b) => {

                const aTime = a.timestamp && a.timestamp.toMillis

                    ? a.timestamp.toMillis()

                    : Number(a.updateId || 0);

                const bTime = b.timestamp && b.timestamp.toMillis

                    ? b.timestamp.toMillis()

                    : Number(b.updateId || 0);

                return bTime - aTime;

            });

            displayPriceUpdates(allPriceUpdatesCache);

        },

        error => {

            console.error("Price updates onSnapshot error:", error);

            setConnectionStatus(

                "تعذر قراءة سجل تغييرات الأسعار من Firestore.",

                "error"

            );

        }

    );

    db.collection("debt_customers").onSnapshot(
        snapshot => {
            allCustomersCache = [];
            allDebtCustomersCache = [];

            snapshot.forEach(doc => {
                const data = doc.data() || {};
                const customer = {
                    id: doc.id,
                    ...data,
                    customerName: String(data.customerName || "").trim(),
                    customerKey: normalizeCustomerName(data.customerName || ""),
                    totalDebt: Number(data.totalDebt || 0)
                };

                if (customer.customerName && customer.totalDebt > 0.000001) {
                    allCustomersCache.push(customer);
                }

                if (customer.totalDebt > 0.000001) {
                    allDebtCustomersCache.push(customer);
                }
            });

            allDebtCustomersCache.sort((a, b) => b.totalDebt - a.totalDebt);
            renderDebtCustomers();
            renderShakakCustomerSuggestions(document.getElementById("shakakCustomerName")?.value || "");
        },
        error => {
            console.error("Debt customers onSnapshot error:", error);
            setConnectionStatus("تعذر قراءة العملاء المديونين من Firestore.", "error");
        }
    );

}

function updateStats(products) {

    const statTotal = document.getElementById("statTotal");

    const statMax = document.getElementById("statMax");

    if (statTotal) {

        statTotal.textContent = products.length;

    }

    let max = 0;

    products.forEach(product => {

        const price = Number(product.price);

        if (Number.isFinite(price) && price > max) {

            max = price;

        }

    });

    if (statMax) {

        statMax.textContent = `${formatCurrency(max)} ج.م`;

    }

}

async function saveProduct() {

    if (!firebaseReady || !db) {

        showToast("تعذر الحفظ", false);

        return;

    }

    const editingId = document.getElementById("editingId").value.trim();
    const saveButton = document.getElementById("saveProductBtn");

    const name = normalizeProductInputName(document.getElementById("productName").value);

    const priceRaw = document.getElementById("productPrice").value.trim();

    const category = document.getElementById("productCategory").value.trim();

    const status = document.getElementById("productStatus")?.value || "available";

    const barcode =

        document.getElementById("productBarcode").value.trim() || "بدون باركود";

    const imageInput = document.getElementById("productImage");

    if (!name || !priceRaw) {

        showToast("أدخل الاسم والسعر", false);

        return;

    }

    const priceNumber = Number(priceRaw);

    if (!Number.isFinite(priceNumber) || priceNumber < 0) {

        showToast("السعر غير صحيح", false);

        return;

    }

    if (isDuplicateProductName(name, editingId)) {
        showToast("هذا المنتج موجود", false);
        return;
    }

    if (!category) {
        showToast("اختر القسم أولاً", false);
        document.getElementById("productCategory").focus();
        return;
    }

    if (isDuplicateProductBarcode(barcode, editingId)) {
        showToast("هذا الباركود مستخدم بالفعل لمنتج آخر", false);
        return;
    }

    if (saveButton?.disabled) return;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add("is-saving");
        saveButton.textContent = editingId ? "جاري التعديل..." : "جاري الحفظ...";
    }

    try {

        const imageFile =

            imageInput && imageInput.files && imageInput.files[0]

                ? imageInput.files[0]

                : null;

        const imageUrlField = document.getElementById("productImageUrl");
        const lookedUpImageUrl = imageUrlField ? imageUrlField.value.trim() : "";
        const newImage = (await getImageAsDataUrl(imageFile)) || lookedUpImageUrl || null;

        if (editingId) {
            await updateExistingProduct(editingId, name, priceRaw, category, barcode, status, newImage);
            document.getElementById("editingId").value = "";
            resetFormFields();
            showToast("تم التعديل");
        } else {

            const newProduct = {

                name,

                price: priceRaw,

                category,

                barcode,

                status,

                image: newImage || "",

                createdAt: Date.now()

            };

            await db.collection("products").add(newProduct);
            resetFormFields();
            showToast("تم الحفظ");

        }

    } catch (error) {

        console.error("Save product error:", error);

        if (error && error.message === "DUPLICATE_PRODUCT_NAME") {
            showToast("هذا المنتج موجود", false);
        } else if (error && error.message === "DUPLICATE_PRODUCT_BARCODE") {
            showToast("هذا الباركود مستخدم بالفعل لمنتج آخر", false);
        } else {
            showToast("تعذر الحفظ", false);
        }

    } finally {

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.classList.remove("is-saving");
            saveButton.textContent = document.getElementById("editingId").value.trim()
                ? "حفظ التعديل"
                : "حفظ";
        }

    }

}

async function updateExistingProduct(id, name, price, category, barcode, status, newImage) {

    const productRef = db.collection("products").doc(id);

    const oldSnapshot = await productRef.get();

    if (!oldSnapshot.exists) {

        throw new Error("المنتج المطلوب تعديله غير موجود.");

    }

    const old = oldSnapshot.data() || {};

    if (isDuplicateProductName(name, id)) {
        throw new Error("DUPLICATE_PRODUCT_NAME");
    }

    if (isDuplicateProductBarcode(barcode, id)) {
        throw new Error("DUPLICATE_PRODUCT_BARCODE");
    }

    const oldPrice = Number(old.price);

    const newPrice = Number(price);

    const priceChanged =

        Number.isFinite(oldPrice) &&

        Number.isFinite(newPrice) &&

        oldPrice !== newPrice;

    const updatedData = {

        name,

        price,

        category,

        barcode,

        status,

        image: newImage !== null ? newImage : (old.image || ""),

        updatedAt: firebase.firestore.FieldValue.serverTimestamp()

    };

    if (priceChanged) {

        const batch = db.batch();

        batch.update(productRef, updatedData);

        const latestProductUpdate = [...allPriceUpdatesCache]
            .filter(item => item.productId === id)
            .sort((a, b) => {
                const aTime = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : Number(a.updateId || 0);
                const bTime = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : Number(b.updateId || 0);
                return bTime - aTime;
            })[0];

        const updateRef = latestProductUpdate && latestProductUpdate.id
            ? db.collection("price_updates_list").doc(latestProductUpdate.id)
            : db.collection("price_updates_list").doc();

        batch.set(updateRef, {

            updateId: Date.now(),

            productId: id,

            name,

            image: updatedData.image,

            oldPrice: String(old.price ?? ""),

            price,

            barcode,

            category,

            timestamp: firebase.firestore.FieldValue.serverTimestamp()

        });

        await batch.commit();

    } else {

        await productRef.update(updatedData);

    }

}

function resetFormFields() {

    const editingId = document.getElementById("editingId");
    const search = document.getElementById("productSearchInput");
    const searchResults = document.getElementById("productSearchResults");
    const name = document.getElementById("productName");

    const price = document.getElementById("productPrice");

    const category = document.getElementById("productCategory");

    const status = document.getElementById("productStatus");

    const barcode = document.getElementById("productBarcode");

    const image = document.getElementById("productImage");

    const imageName = document.getElementById("imageFileName");

    const imagePreview = document.getElementById("imagePreview");

    const imagePreviewWrap = document.getElementById("imagePreviewWrap");

    if (editingId) editingId.value = "";
    if (search) search.value = "";
    if (searchResults) searchResults.innerHTML = "";
    if (name) name.value = "";
    if (price) price.value = "";

    if (category) {
        category.value = "";
        delete category.dataset.categoryManuallyChanged;
    }

    if (status) status.value = "available";

    if (barcode) barcode.value = "";

    if (image) image.value = "";

    if (imageName) imageName.textContent = "";

    if (imagePreview) imagePreview.src = "";

    if (imagePreviewWrap) imagePreviewWrap.classList.remove("is-visible");

    const imageUrl = document.getElementById("productImageUrl");
    if (imageUrl) imageUrl.value = "";

    const saveButton = document.getElementById("saveProductBtn");
    if (saveButton) saveButton.textContent = "حفظ";

    setBarcodeLookupStatus("");

}

function displayProducts(products) {

    const list = document.getElementById("resultsList");

    if (!list) return;

    const selectAllBtn = document.getElementById("selectAllBtn");

    const filter = document.getElementById("productCategoryFilter");
    const selectedCategory = filter ? filter.value : "";
    const sortedProducts = sortProductsByCategory(products).filter(product =>
        !selectedCategory || getProductCategory(product) === selectedCategory
    );

    if (filter && !filter.options.length) populateProductCategories();

    if (sortedProducts.length === 0) {

        if (!list.querySelector(".inline-style-20")) {
            list.replaceChildren(Object.assign(document.createElement("p"), {
                className: "inline-style-20",
                textContent: "لا توجد منتجات"
            }));
        }

        if (selectAllBtn) {

            selectAllBtn.style.display = "none";

        }

        toggleDeleteSelectedBtn();

        return;

    }

    list.querySelectorAll(".inline-style-20").forEach(emptyMessage => emptyMessage.remove());

    const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23eef2f4'/%3E%3C/svg%3E";
    const existingCards = new Map(
        [...list.querySelectorAll(".product-card[data-product-id]")]
            .map(card => [card.dataset.productId, card])
    );
    const orderedCards = [];

    sortedProducts.forEach(product => {

        const productId = String(product.id);
        const name = normalizeProductInputName(product.name) || "بدون اسم";
        const price = formatCurrency(product.price ?? 0);
        const productImage = getProductImageSource(product) || fallbackImage;
        let card = existingCards.get(productId);

        if (!card) {
            card = document.createElement("div");
            card.className = "product-card";
            card.dataset.productId = productId;
            card.innerHTML = `
                <div class="product-thumb">
                    <div class="product-image-box">
                        <img loading="lazy">
                    </div>
                </div>
                <div class="product-info">
                    <h4 data-product-name></h4>
                    <p class="product-subtitle" data-product-subtitle></p>
                    <p class="product-price-txt"><strong data-product-price></strong></p>
                    <span class="product-status-badge" data-product-status aria-label="حالة المنتج"></span>
                </div>
            `;
            card.addEventListener("click", () => openProductModal(productId));
        }

        card.title = name;
        card.querySelector("[data-product-name]").innerHTML = productNameMarkup(product.name);
        card.querySelector("[data-product-subtitle]").textContent = getProductCategory(product) || "";
        card.querySelector("[data-product-price]").textContent = `${price} ج.م`;
        const statusBadge = card.querySelector("[data-product-status]");
        statusBadge.textContent = "";
        statusBadge.title = getProductStatusLabel(product);
        statusBadge.className = `product-status-badge ${isProductAvailable(product) ? "is-available" : "is-unavailable"}`;

        const image = card.querySelector("img");
        image.alt = name;
        const imageSource = image.dataset.failedSource === productImage
            ? fallbackImage
            : productImage;
        if (image.dataset.source !== imageSource) {
            image.dataset.source = imageSource;
            image.src = imageSource;
            image.onerror = () => {
                image.onerror = null;
                image.dataset.failedSource = productImage;
                image.dataset.source = fallbackImage;
                image.src = fallbackImage;
            };
        }

        orderedCards.push(card);
        existingCards.delete(productId);
    });

    existingCards.forEach(card => card.remove());

    orderedCards.forEach((card, index) => {
        if (list.children[index] !== card) {
            list.insertBefore(card, list.children[index] || null);
        }
    });

    toggleDeleteSelectedBtn();

}

function productMatchesQuery(product, query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return true;

    return [product.name, product.price, product.barcode]
        .some(value => String(value ?? "").toLowerCase().includes(normalizedQuery));
}

function filterProductSearch() {

    const input = document.getElementById("productSearchInput");

    const list = document.getElementById("productSearchResults");

    if (!input || !list) return;

    const q = input.value.trim().toLowerCase();

    if (!q) {
        list.innerHTML = "";
        input.dataset.quickSelectedIndex = "-1";
        return;
    }

    const filtered = sortProductsByCategory(allProductsCache
        .filter(product => productMatchesQuery(product, q)))
        .slice(0, 8);

    if (!filtered.length) {
        list.innerHTML = '<div class="quick-empty">لا توجد منتجات</div>';
        input.dataset.quickSelectedIndex = "-1";
        return;
    }

    list.innerHTML = filtered.map((product, index) => `
        <button type="button" class="quick-product-item${index === Number(input.dataset.quickSelectedIndex || 0) ? " active" : ""}" data-index="${index}" data-product-id="${product.id}" onclick="fillProductForm('${product.id}')">
            <span>${escapeHtml(product.name || "بدون اسم")}</span>
            <small>${escapeHtml(formatCurrency(product.price ?? 0))} ج.م</small>
        </button>
    `).join("");

    input.dataset.quickSelectedIndex = String(Number(input.dataset.quickSelectedIndex || 0));

    if (!input.dataset.quickKeybound) {
        input.dataset.quickKeybound = "1";
        input.addEventListener("keydown", function (event) {
            const items = Array.from(document.querySelectorAll(".quick-product-item"));
            if (!items.length) return;

            const currentIndex = Number(input.dataset.quickSelectedIndex || 0);

            if (event.key === "ArrowDown") {
                event.preventDefault();
                const nextIndex = Math.min(currentIndex + 1, items.length - 1);
                input.dataset.quickSelectedIndex = String(nextIndex);
                items.forEach((item, index) => item.classList.toggle("active", index === nextIndex));
                items[nextIndex].scrollIntoView({ block: "nearest", inline: "nearest" });
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                const prevIndex = Math.max(currentIndex - 1, 0);
                input.dataset.quickSelectedIndex = String(prevIndex);
                items.forEach((item, index) => item.classList.toggle("active", index === prevIndex));
                items[prevIndex].scrollIntoView({ block: "nearest", inline: "nearest" });
            }

            if (event.key === "Enter") {
                const activeIndex = Number(input.dataset.quickSelectedIndex || 0);
                const activeItem = items[activeIndex];
                if (activeItem) {
                    event.preventDefault();
                    activeItem.click();
                }
            }

            if (event.key === "Escape") {
                list.innerHTML = "";
                input.dataset.quickSelectedIndex = "-1";
            }
        });
    }
}

function fillProductForm(id) {
    const product = getProductById(id);
    if (!product) return;

    document.getElementById("editingId").value = product.id;
    document.getElementById("productName").value = product.name || "";
    document.getElementById("productPrice").value = product.price ?? "";
    const statusInput = document.getElementById("productStatus");
    if (statusInput) statusInput.value = isProductAvailable(product) ? "available" : "unavailable";
    const categoryInput = document.getElementById("productCategory");
    categoryInput.value = product.category || "";
    categoryInput.dataset.categoryManuallyChanged = "1";
    document.getElementById("productBarcode").value = product.barcode === "بدون باركود" ? "" : (product.barcode || "");
    document.getElementById("productImageUrl").value = product.image || "";
    document.getElementById("productSearchInput").value = "";
    document.getElementById("productSearchResults").innerHTML = "";

    const imagePreview = document.getElementById("imagePreview");
    const imagePreviewWrap = document.getElementById("imagePreviewWrap");
    const imageName = document.getElementById("imageFileName");
    if (imagePreview && imagePreviewWrap) {
        imagePreview.src = product.image || "";
        imagePreviewWrap.classList.toggle("is-visible", Boolean(product.image));
    }
    if (imageName) imageName.textContent = product.image ? "الصورة الحالية" : "";

    const saveBtn = document.getElementById("saveProductBtn");
    if (saveBtn) saveBtn.textContent = "حفظ التعديل";

    switchTab("add");
    showToast("تم تحميل المنتج");
}

function showConfirm(message, callback) {

    const confirmMsg = document.getElementById("confirmMessage");

    const confirmModal = document.getElementById("confirmModal");

    if (confirmMsg) confirmMsg.textContent = message;

    if (confirmModal) confirmModal.style.display = "flex";

    confirmCallback = callback;

}

function closeConfirmModal() {

    const confirmModal = document.getElementById("confirmModal");

    if (confirmModal) {

        confirmModal.style.display = "none";

    }

    confirmCallback = null;

}

function runConfirmCallback() {

    const callback = confirmCallback;

    closeConfirmModal();

    if (typeof callback === "function") {

        Promise.resolve(callback()).catch(error => {

            console.error("Confirmation action error:", error);

            showToast("تعذر التنفيذ", false);

        });

    }

}

function deleteProductFromModal() {
    const modal = document.getElementById("productModal");
    const productId = modal ? modal.dataset.productId : "";
    if (!productId) return;
    closeProductModal();
    deleteProduct(productId);
}

function editProductFromModal() {
    const modal = document.getElementById("productModal");
    const productId = modal ? modal.dataset.productId : "";
    if (!productId) return;

    closeProductModal();
    fillProductForm(productId);
}

function deleteProduct(id) {

    if (!firebaseReady || !db) {

        showToast("غير متصل", false);

        return;

    }

    showConfirm(

        "هل أنت متأكد من حذف هذا المنتج؟ سيتم إزالته نهائياً.",

        async () => {

            try {

                await db.collection("products").doc(id).delete();

                const updatesSnapshot = await db

                    .collection("price_updates_list")

                    .where("productId", "==", id)

                    .get();

                if (!updatesSnapshot.empty) {

                    const batch = db.batch();

                    updatesSnapshot.forEach(doc => {

                        batch.delete(doc.ref);

                    });

                    await batch.commit();

                }

                showToast("تم الحذف", false);

            } catch (error) {

                console.error("Delete product error:", error);

                showToast("تعذر الحذف", false);

            }

        }

    );

}

function toggleDeleteSelectedBtn() {

    const checked = document.querySelectorAll(".product-checkbox:checked");

    const total = document.querySelectorAll(".product-checkbox");

    const deleteBtn = document.getElementById("deleteSelectedBtn");

    const selectBtn = document.getElementById("selectAllBtn");

    const showBulk = checked.length > 2;
    if (deleteBtn) { deleteBtn.style.display = showBulk ? "block" : "none"; deleteBtn.textContent = "حذف الكل"; }
    if (selectBtn) {
        if (showBulk) { selectBtn.style.display = "block"; selectBtn.textContent = checked.length === total.length ? "إلغاء الكل" : "تحديد الكل"; }
        else selectBtn.style.display = "none";
    }
}

async function deleteFirestoreRefsInChunks(refs, chunkSize = 50) {
    for (let index = 0; index < refs.length; index += chunkSize) {
        const batch = db.batch();
        refs.slice(index, index + chunkSize).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

async function deleteSelectedProducts() {

    if (!firebaseReady || !db) {

        showToast("غير متصل", false);

        return;

    }

    const checked = Array.from(

        document.querySelectorAll(".product-checkbox:checked")

    );

    if (checked.length === 0) return;

    showConfirm(

        `هل أنت متأكد من حذف ${checked.length} منتج/منتجات محددة؟`,

        async () => {

            try {
                const productIds = checked

                    .map(cb => cb.getAttribute("data-id"))

                    .filter(Boolean);

                const productRefs = productIds.map(id => db.collection("products").doc(id));
                await deleteFirestoreRefsInChunks(productRefs);

                const updateRefs = [];

                for (const id of productIds) {

                    const snapshot = await db

                        .collection("price_updates_list")

                        .where("productId", "==", id)

                        .get();

                    snapshot.forEach(doc => updateRefs.push(doc.ref));
                }

                if (updateRefs.length > 0) {
                    await deleteFirestoreRefsInChunks(updateRefs);
                }

                showToast("تم الحذف", false);

            } catch (error) {

                console.error("Bulk delete error:", error);

                showToast("تعذر الحذف", false);

            }

        }

    );

}

function openProductModal(id) {
    const product = getProductById(id);
    if (!product) {
        showToast("المنتج غير موجود", false);
        return;
    }

    const image = document.getElementById("modalImg");
    const name = document.getElementById("modalName");
    const price = document.getElementById("modalPrice");
    const barcode = document.getElementById("modalBarcode");
    const category = document.getElementById("modalCategory");
    const modal = document.getElementById("productModal");

    if (modal) modal.dataset.productId = id;

    if (image) {
        image.src = getProductImageSource(product) || "https://via.placeholder.com/130?text=No+Img";
        image.onerror = () => {
            image.src = "https://via.placeholder.com/130?text=No+Img";
        };
    }

    if (name) name.innerHTML = productNameMarkup(product.name);
    if (barcode) barcode.textContent = "الباركود: " + (product.barcode || "بدون باركود");
    if (category) category.textContent = "القسم: " + (getProductCategory(product) || "غير محدد");

    const updates = allPriceUpdatesCache.filter(u => u.productId === id).sort((a, b) => {
        const t = x => x.timestamp && typeof x.timestamp.toMillis === "function" ? x.timestamp.toMillis() : Number(x.updateId || 0);
        return t(b) - t(a);
    });
    const latest = updates[0];
    const updatedAt = document.getElementById("modalUpdatedAt");

    if (updatedAt) {
        const updateSource = latest || {
            updatedAt: product.updatedAt || product.createdAt
        };
        updatedAt.textContent = formatPriceUpdateDateTime(updateSource);
        updatedAt.style.display = "";
    }

    if (price) {
        if (latest && String(latest.price) === String(product.price)) {
            price.innerHTML = `<span class="modal-old-price">${escapeHtml(formatCurrency(latest.oldPrice ?? 0))} ج.م</span><span class="modal-new-price">${escapeHtml(formatCurrency(product.price ?? 0))} ج.م</span>`;
        } else {
            price.textContent = `${formatCurrency(product.price ?? 0)} ج.م`;
        }
    }

    if (modal) modal.style.display = "flex";
}

function openUpdateModal(docId) {

    const update = getUpdateById(docId);

    if (!update) {

        showToast("السجل غير موجود", false);

        return;

    }

    const image = document.getElementById("modalImg");

    const name = document.getElementById("modalName");

    const price = document.getElementById("modalPrice");

    const barcode = document.getElementById("modalBarcode");
    const category = document.getElementById("modalCategory");

    const modal = document.getElementById("productModal");

    if (image) {

        image.src =

            getProductImageSource(update) ||

            "https://via.placeholder.com/130?text=No+Img";

        image.onerror = () => {

            image.src = "https://via.placeholder.com/130?text=No+Img";

        };

    }

    if (name) name.innerHTML = productNameMarkup(update.name);
    if (price) {

        price.innerHTML = "";

        const oldSpan = document.createElement("span");

        oldSpan.textContent = `${formatCurrency(update.oldPrice ?? 0)} ج.م`;

        oldSpan.style.textDecoration = "line-through";

        oldSpan.style.color = "#ef4444";

        oldSpan.style.marginLeft = "10px";

        const newSpan = document.createElement("span");

        newSpan.textContent = `${formatCurrency(update.price ?? 0)} ج.م`;

        newSpan.style.color = "#10b981";

        newSpan.style.fontWeight = "900";

        newSpan.style.fontSize = "22px";

        price.appendChild(oldSpan);

        price.appendChild(newSpan);

    }

    if (barcode) {

        barcode.textContent =

            "الباركود: " + (update.barcode || "بدون باركود");

    }
    if (category) {
        const product = allProductsCache.find(item => item.id === update.productId);
        category.textContent = "القسم: " + (getProductCategory(product) || update.category || "غير محدد");
    }

    const updatedAt = document.getElementById("modalUpdatedAt");
    if (updatedAt) updatedAt.textContent = formatPriceUpdateDateTime(update);

    if (modal) modal.style.display = "flex";

}

function closeProductModal() {

    const modal = document.getElementById("productModal");

    if (modal) {
        modal.style.display = "none";
        modal.dataset.productId = "";
    }
    closeFullscreenImage();

}

let fullscreenImageScale = 1;
let fullscreenImageOffset = { x: 0, y: 0 };
let fullscreenImagePointers = new Map();
let fullscreenImagePinchStart = null;
let fullscreenImageLastTap = 0;
let fullscreenImagePanStart = null;
let fullscreenImageDidMove = false;

function resetFullscreenImageTransform() {
    fullscreenImageScale = 1;
    fullscreenImageOffset = { x: 0, y: 0 };
    fullscreenImagePinchStart = null;
    fullscreenImagePanStart = null;
    fullscreenImageDidMove = false;
    const image = document.getElementById("imageFullscreenImg");
    if (image) image.style.transform = "translate3d(0, 0, 0) scale(1)";
}

function updateFullscreenImageTransform() {
    const image = document.getElementById("imageFullscreenImg");
    if (!image) return;
    image.style.transform = `translate3d(${fullscreenImageOffset.x}px, ${fullscreenImageOffset.y}px, 0) scale(${fullscreenImageScale})`;
}

function clampFullscreenImageOffset() {
    const image = document.getElementById("imageFullscreenImg");
    const stage = image?.parentElement;
    if (!image || !stage) return;
    const maxX = Math.max(0, (image.offsetWidth * fullscreenImageScale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * fullscreenImageScale - stage.clientHeight) / 2);
    fullscreenImageOffset.x = Math.min(maxX, Math.max(-maxX, fullscreenImageOffset.x));
    fullscreenImageOffset.y = Math.min(maxY, Math.max(-maxY, fullscreenImageOffset.y));
}

function openFullscreenImage() {
    const modal = document.getElementById("productModal");
    const sourceImage = document.getElementById("modalImg");
    const fullscreen = document.getElementById("imageFullscreen");
    const fullscreenImage = document.getElementById("imageFullscreenImg");
    if (!fullscreen || !fullscreenImage || !sourceImage?.src) return;

    fullscreenImage.src = sourceImage.src;
    fullscreenImage.alt = sourceImage.alt || "صورة المنتج المكبرة";
    resetFullscreenImageTransform();
    fullscreen.classList.add("is-visible");
    fullscreen.setAttribute("aria-hidden", "false");
    modal?.classList.add("is-image-fullscreen");
}

function closeFullscreenImage() {
    const modal = document.getElementById("productModal");
    const fullscreen = document.getElementById("imageFullscreen");
    if (!fullscreen) return;
    fullscreen.classList.remove("is-visible");
    fullscreen.setAttribute("aria-hidden", "true");
    modal?.classList.remove("is-image-fullscreen");
    fullscreenImagePointers.clear();
    fullscreenImagePanStart = null;
    resetFullscreenImageTransform();
}

function getFullscreenPointerDistance() {
    const points = Array.from(fullscreenImagePointers.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function setupFullscreenImage() {
    const sourceImage = document.getElementById("modalImg");
    const closeButton = document.getElementById("imageFullscreenClose");
    const image = document.getElementById("imageFullscreenImg");
    if (!sourceImage || !closeButton || !image || sourceImage.dataset.fullscreenReady === "1") return;

    sourceImage.dataset.fullscreenReady = "1";
    sourceImage.addEventListener("click", openFullscreenImage);
    closeButton.addEventListener("click", closeFullscreenImage);
    image.addEventListener("pointerdown", event => {
        try { image.setPointerCapture(event.pointerId); } catch (error) {}
        fullscreenImagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        fullscreenImageDidMove = false;
        if (fullscreenImagePointers.size === 1 && fullscreenImageScale > 1) {
            fullscreenImagePanStart = {
                x: event.clientX,
                y: event.clientY,
                offsetX: fullscreenImageOffset.x,
                offsetY: fullscreenImageOffset.y
            };
        } else {
            fullscreenImagePanStart = null;
        }
        if (fullscreenImagePointers.size === 2) fullscreenImagePinchStart = {
            distance: getFullscreenPointerDistance(),
            scale: fullscreenImageScale
        };
    });
    image.addEventListener("pointermove", event => {
        if (!fullscreenImagePointers.has(event.pointerId)) return;
        fullscreenImagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fullscreenImagePointers.size === 2 && fullscreenImagePinchStart) {
            const distance = getFullscreenPointerDistance();
            fullscreenImageScale = Math.min(5, Math.max(1, fullscreenImagePinchStart.scale * distance / fullscreenImagePinchStart.distance));
            clampFullscreenImageOffset();
            updateFullscreenImageTransform();
        } else if (fullscreenImagePointers.size === 1 && fullscreenImageScale > 1 && fullscreenImagePanStart) {
            const deltaX = event.clientX - fullscreenImagePanStart.x;
            const deltaY = event.clientY - fullscreenImagePanStart.y;
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) fullscreenImageDidMove = true;
            fullscreenImageOffset.x = fullscreenImagePanStart.offsetX + deltaX;
            fullscreenImageOffset.y = fullscreenImagePanStart.offsetY + deltaY;
            clampFullscreenImageOffset();
            updateFullscreenImageTransform();
        }
    });
    ["pointerup", "pointercancel"].forEach(type => image.addEventListener(type, event => {
        fullscreenImagePointers.delete(event.pointerId);
        if (fullscreenImagePointers.size < 2) fullscreenImagePinchStart = null;
        if (fullscreenImagePointers.size === 0) fullscreenImagePanStart = null;
    }));
    image.addEventListener("click", event => {
        if (fullscreenImageDidMove) {
            fullscreenImageDidMove = false;
            fullscreenImageLastTap = 0;
            event.stopPropagation();
            return;
        }
        const now = Date.now();
        if (now - fullscreenImageLastTap < 300) {
            fullscreenImageScale = fullscreenImageScale > 1 ? 1 : 2.5;
            fullscreenImageOffset = { x: 0, y: 0 };
            clampFullscreenImageOffset();
            updateFullscreenImageTransform();
        }
        fullscreenImageLastTap = now;
        event.stopPropagation();
    });

}

function displayPriceUpdates(updates) {

    const list = document.getElementById("priceUpdatesModalList") || document.getElementById("updatesList");

    if (!list) return;

    const latestByProduct = new Map();
    updates.forEach(update => {
        const key = update.productId || update.id;
        if (!latestByProduct.has(key)) latestByProduct.set(key, update);
    });
    const uniqueUpdates = Array.from(latestByProduct.values());

    if (uniqueUpdates.length === 0) {

        list.innerHTML =

            '<p class="inline-style-21">لا توجد تعديلات على الأسعار حتى الآن.</p>';

        return;

    }

    let html = "";

    uniqueUpdates.forEach(update => {

        const id = escapeHtml(update.id);

        const name = escapeHtml(normalizeProductInputName(update.name) || "بدون اسم");

        const oldPrice = escapeHtml(formatCurrency(update.oldPrice ?? 0));

        const price = escapeHtml(formatCurrency(update.price ?? 0));

        const image = update.image

            ? escapeHtml(update.image)

            : "https://via.placeholder.com/50?text=No+Img";

        html += `

            <div class="price-update-row" onclick="openUpdateModal('${id}')">

                <div class="price-update-left">
                    <img

                        src="${image}"

                        class="price-update-thumb"

                        alt="${name}"

                        loading="lazy"

                        onerror="this.src='https://via.placeholder.com/50?text=No+Img'"

                    >

                    <div class="price-update-main">
                        <div class="price-update-name">${productNameMarkup(update.name)}</div>
                        <div class="price-update-line">
                            <span class="price-update-old">${oldPrice} ج.م</span>
                            <span class="price-update-arrow">←</span>
                            <strong class="price-update-new">${price} ج.م</strong>
                        </div>
                        <div class="price-update-barcode">الباركود: ${escapeHtml(update.barcode || "بدون باركود")}</div>
                        <div class="price-update-date">${escapeHtml(formatPriceUpdateDateTime(update))}</div>
                    </div>
                </div>

                <button type="button" class="price-update-delete" aria-label="حذف سجل السعر" onclick="event.stopPropagation(); deleteSingleUpdate('${id}')">×</button>

            </div>

        `;

    });

    list.innerHTML = html;

}

function deleteSingleUpdate(docId) {

    if (!firebaseReady || !db) {

        showToast("غير متصل", false);

        return;

    }

    showConfirm(

        "هل أنت متأكد من حذف هذا السجل؟",

        async () => {

            try {

                await db.collection("price_updates_list").doc(docId).delete();

                showToast("تم الحذف", false);

            } catch (error) {

                console.error("Delete update error:", error);

                showToast("تعذر الحذف", false);

            }

        }

    );

}

function updateImageFileName(input) {

    const file = input && input.files && input.files[0] ? input.files[0] : null;

    const fileNameElement = document.getElementById("imageFileName");

    const previewWrap = document.getElementById("imagePreviewWrap");

    const previewImage = document.getElementById("imagePreview");

    if (file) {
        const imageCategory = suggestCategoryFromFile(file.name);
        const categorySelect = document.getElementById("productCategory");
        if (categorySelect) delete categorySelect.dataset.categoryManuallyChanged;
        if (imageCategory && categorySelect && productCategories.includes(imageCategory)) {
            categorySelect.value = imageCategory;
        }
    }

    if (!file) {

        if (fileNameElement) fileNameElement.textContent = "";

        if (previewWrap) previewWrap.classList.remove("is-visible");

        if (previewImage) previewImage.src = "";

        return;

    }

    if (fileNameElement) {

        fileNameElement.textContent = "تم اختيار الصورة: " + file.name;

    }

    if (previewImage) {

        const reader = new FileReader();

        reader.onload = event => {

            previewImage.src = event.target.result;

            if (previewWrap) previewWrap.classList.add("is-visible");

        };

        reader.readAsDataURL(file);

    } else if (previewWrap) {

        previewWrap.classList.add("is-visible");

    }

    showToast("تم اختيار الصورة");

}

function setBarcodeLookupStatus(message, type = "") {
    const el = document.getElementById("barcodeLookupStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = "barcode-lookup-status" + (type ? ` is-${type}` : "");
}

function normalizeBarcode(value) {
    return String(value || "").replace(/\s+/g, "").trim();
}

function isLookupBarcode(value) {
    const code = normalizeBarcode(value);
    if (!code || code === "بدون باركود") return false;
    return /^\d{8,14}$/.test(code);
}

function findLocalProductByBarcode(barcode) {
    const code = normalizeBarcode(barcode);
    if (!code) return null;
    return allProductsCache.find(product => normalizeBarcode(product.barcode) === code) || null;
}

function pickOpenFoodFactsName(product) {
    return String(
        product.product_name_ar ||
        product.product_name_en ||
        product.product_name ||
        product.generic_name_ar ||
        product.generic_name ||
        ""
    ).trim();
}

async function fetchOpenFoodFactsProduct(barcode) {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_ar,product_name_en,generic_name,generic_name_ar,brands,image_url,image_front_url,quantity`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("OFF_HTTP");
    const data = await response.json();
    if (Number(data.status) !== 1 || !data.product) return null;
    const product = data.product;
    const name = pickOpenFoodFactsName(product);
    const brand = String(product.brands || "").split(",")[0].trim();
    const quantity = String(product.quantity || "").trim();
    let displayName = name;
    if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) {
        displayName = `${brand} ${name}`;
    } else if (!displayName && brand) {
        displayName = brand;
    }
    if (quantity && displayName && !displayName.includes(quantity)) {
        displayName = `${displayName} ${quantity}`.trim();
    }
    return {
        name: displayName,
        image: product.image_front_url || product.image_url || ""
    };
}

async function fetchSuggestedEgpPrice(barcode) {
    const url = `https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(barcode)}&size=50`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const egp = items
        .map(item => ({
            price: Number(item.price),
            currency: String(item.currency || "").toUpperCase(),
            country: String(item.country || item.location_osm_country_code || "").toUpperCase()
        }))
        .filter(item => Number.isFinite(item.price) && item.price > 0 && (item.currency === "EGP" || item.country === "EG"));
    if (!egp.length) return null;
    const prices = egp.map(item => item.price).sort((a, b) => a - b);
    return Number(prices[Math.floor(prices.length / 2)].toFixed(2));
}

async function lookupAndFillProductFromBarcode(barcode, options = {}) {
    const code = normalizeBarcode(barcode);
    const forceName = Boolean(options.forceName);
    const nameInput = document.getElementById("productName");
    const priceInput = document.getElementById("productPrice");
    const imageName = document.getElementById("imageFileName");
    const imageUrlField = document.getElementById("productImageUrl");
    const editingId = document.getElementById("editingId")?.value.trim();

    if (!isLookupBarcode(code)) {
        setBarcodeLookupStatus("");
        return;
    }

    const local = findLocalProductByBarcode(code);
    if (local && local.id !== editingId) {
        if (nameInput && (!nameInput.value.trim() || forceName)) nameInput.value = local.name || "";
        if (priceInput && (!priceInput.value.trim() || forceName)) priceInput.value = local.price ?? "";
        if (imageUrlField) {
            imageUrlField.value = local.image && !String(local.image).startsWith("data:") ? local.image : "";
        }
        if (imageName && local.image) imageName.textContent = "الصورة موجودة";
        setBarcodeLookupStatus("هذا المنتج موجود", "warn");
        showToast("هذا المنتج موجود", false);
        return;
    }

    setBarcodeLookupStatus("جاري البحث عن بيانات المنتج...", "loading");

    try {
        const [offResult, suggestedPrice] = await Promise.all([
            fetchOpenFoodFactsProduct(code).catch(() => null),
            fetchSuggestedEgpPrice(code).catch(() => null)
        ]);

        if (!offResult && suggestedPrice == null) {
            setBarcodeLookupStatus("لا توجد بيانات", "error");
            return;
        }

        if (offResult?.name && nameInput && (!nameInput.value.trim() || forceName)) {
            nameInput.value = offResult.name;
            applySuggestedCategory(offResult.name);
        }
        if (offResult?.image && imageUrlField) {
            imageUrlField.value = offResult.image;
            if (imageName) imageName.textContent = "تم جلب الصورة";
        }
        if (suggestedPrice != null && priceInput && !priceInput.value.trim()) {
            priceInput.value = String(suggestedPrice);
            setBarcodeLookupStatus(`السعر المقترح: ${suggestedPrice} ج.م`, "success");
            return;
        }

        if (offResult?.name) {
            setBarcodeLookupStatus("تم جلب الاسم", "success");
        } else {
            setBarcodeLookupStatus("اكتب الاسم والسعر", "warn");
        }
    } catch (error) {
        console.error("Barcode lookup error:", error);
        setBarcodeLookupStatus("تعذر الجلب", "error");
    }
}

function setupBarcodeLookupOnAddForm() {
    const input = document.getElementById("productBarcode");
    if (!input || input.dataset.lookupReady === "1") return;
    input.dataset.lookupReady = "1";
    let timer = null;
    const runLookup = () => {
        const code = normalizeBarcode(input.value);
        if (!isLookupBarcode(code)) {
            setBarcodeLookupStatus("");
            return;
        }
        lookupAndFillProductFromBarcode(code, { forceName: false });
    };
    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(runLookup, 700);
    });
    input.addEventListener("change", runLookup);
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            clearTimeout(timer);
            runLookup();
        }
    });
}

async function toggleScanner(elementId, inputTargetId, isSearch = false) {

    const viewport = document.getElementById(elementId);

    if (!viewport) return;

    if (typeof Html5Qrcode === "undefined") {

        showToast("قارئ QR غير متاح", false);

        return;

    }

    if (activeScanner) {

        await stopCurrentScanner();

        return;

    }

    viewport.style.display = "block";

    try {

        activeScanner = new Html5Qrcode(elementId);

        activeScannerElementId = elementId;
        let scanHandled = false;

        const config = {

            fps: 10,

            qrbox: {

                width: 250,

                height: 150

            },

            aspectRatio: 1.777778

        };

        if (typeof Html5QrcodeSupportedFormats !== "undefined") {
            config.formatsToSupport = [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.QR_CODE
            ];
        }

        await activeScanner.start(

            { facingMode: "environment" },

            config,

            async decodedText => {

                if (scanHandled) return;
                scanHandled = true;

                const scannedCode = String(decodedText || "").trim();
                const targetInput = document.getElementById(inputTargetId);

                await stopCurrentScanner();

                if (targetInput) {

                    targetInput.value = scannedCode;

                }

                if (inputTargetId === "shakakSearchInput") {
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    if (decodedProduct) {
                        vibrateAfterScan();
                        addProductToShakakCart(decodedProduct);
                        targetInput.value = "";
                    } else {
                        showToast("المنتج غير مسجل", false);
                    }
                    return;
                }

                if (inputTargetId === "posSearchInput") {
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    if (decodedProduct) {
                        vibrateAfterScan();
                        addProductToPosCart(decodedProduct);
                        if (targetInput) targetInput.value = "";
                        showToast("تمت القراءة");
                    } else {
                        if (targetInput) targetInput.value = "";
                        showToast("هذا المنتج غير متوفر", false);
                    }
                    return;
                }

                if (inputTargetId === "productBarcode") {
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    if (decodedProduct || isLookupBarcode(scannedCode)) {
                        vibrateAfterScan();
                        showToast("تمت القراءة");
                    } else {
                        if (targetInput) targetInput.value = "";
                        showToast("هذا المنتج غير متوفر", false);
                    }
                    await lookupAndFillProductFromBarcode(scannedCode, { forceName: false });
                    return;
                }

                if (isSearch) {

                    if (scannedCode) vibrateAfterScan();
                    if (targetInput) targetInput.value = scannedCode;
                    filterProductSearch();

                }

                showToast("تمت القراءة");

            },

            () => {

            }

        );

    } catch (error) {

        console.error("Scanner start error:", error);

        showToast("تعذر تشغيل الكاميرا", false);

        await stopCurrentScanner();

    }

}

async function stopCurrentScanner() {

    const scanner = activeScanner;

    const activeElementId = activeScannerElementId;

    activeScanner = null;

    activeScannerElementId = null;

    if (scanner) {

        try {

            await scanner.stop();

        } catch (error) {

            console.warn("Scanner stop warning:", error);

        }

        try {

            scanner.clear();

        } catch (error) {

        }

    }

    const reader = document.getElementById("reader");

    const searchReader = document.getElementById("searchReader");
    const shakakReader = document.getElementById("shakak-reader");
    const posReader = document.getElementById("pos-reader");

    [reader, searchReader, shakakReader, posReader].forEach(el => {
        if (!el) return;
        el.style.display = "none";
    });

    void activeElementId;

}

function openMonthlyReportModal() {
    const modal = document.getElementById('monthlyReportModal');
    const input = document.getElementById('monthlyReportMonthInput');
    if (input && !input.value) {
        input.value = getCurrentMonthValue();
    }
    syncMonthlyReportMonthDisplay();
    if (modal) {
        modal.style.display = 'flex';
        lockBodyScrollForModal();
    }
    loadMonthlyReport();
}

function closeMonthlyReportModal() {
    const modal = document.getElementById('monthlyReportModal');
    if (modal) {
        modal.style.display = 'none';
    }
    unlockBodyScrollForModal();
}

function openPriceUpdatesModal() {
    const modal = document.getElementById('priceUpdatesModal');
    if (modal) {
        modal.style.display = 'flex';
        lockBodyScrollForModal();
    }
    const list = document.getElementById('priceUpdatesModalList');
    if (list && list.innerHTML.trim() === '') {
        displayPriceUpdates(allPriceUpdatesCache || []);
    }
}

function closePriceUpdatesModal() {
    const modal = document.getElementById('priceUpdatesModal');
    if (modal) {
        modal.style.display = 'none';
    }
    unlockBodyScrollForModal();
}

function getCurrentMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatArabicMonth(monthValue) {
    const match = String(monthValue || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return 'الشهر';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12);
    return new Intl.DateTimeFormat('ar-EG', { month: 'long' }).format(date);
}

function syncMonthlyReportMonthDisplay() {
    const input = document.getElementById('monthlyReportMonthInput');
    const display = document.getElementById('monthlyReportMonthDisplay');
    if (input && display) display.textContent = formatArabicMonth(input.value);
}

function formatCurrency(value) {
    const num = Number(value || 0);
    return Number.isFinite(num)
        ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00';
}

function formatNumber(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : "0";
}

function normalizeDateValue(value) {
    if (!value) return null;

    if (value.toDate) {
        return value.toDate();
    }

    if (value.seconds) {
        return new Date(value.seconds * 1000);
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const [year, month, day] = value.trim().split('-').map(Number);
        return new Date(year, month - 1, day, 12);
    }

    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

function getRecordTotal(record) {
    if (!record || typeof record !== 'object') return 0;

    const possibleKeys = [
        'total', 'grandTotal', 'amount', 'paidAmount', 'finalTotal', 'saleTotal',
        'totalPrice', 'orderTotal', 'sum', 'value'
    ];

    for (const key of possibleKeys) {
        if (record[key] !== undefined && record[key] !== null && !isNaN(Number(record[key]))) {
            return Number(record[key]);
        }
    }

    if (Array.isArray(record.items)) {
        return record.items.reduce((sum, item) => {
            const itemTotal = Number(item.total || item.amount || item.price || 0);
            return sum + (isNaN(itemTotal) ? 0 : itemTotal);
        }, 0);
    }

    return 0;
}

function getRecordType(record) {
    if (!record || typeof record !== 'object') return 'cash';

    const type = String(record.saleType || record.type || record.paymentType || record.mode || '').trim().toLowerCase();
    const remaining = Number(record.remaining || record.debtAdded || record.balance || 0);
    const total = getRecordTotal(record);
    const paid = Number(record.paidAmount || record.paid || record.cash || record.received || 0);
    const hasCustomer = Boolean(record.customerName || record.customerKey || record.customerId);

    if (type.includes('credit') || type.includes('شقق') || type.includes('آجل') || type.includes('debt')) return 'credit';
    if (type.includes('cash') || type.includes('نقد') || type.includes('كاش')) return 'cash';

    if (hasCustomer && (remaining > 0 || (paid > 0 && total > 0 && paid < total))) return 'credit';
    if (typeof record.collectionName === 'string' && /shakak|credit|debt/.test(record.collectionName.toLowerCase())) return 'credit';

    if (paid > 0 && total > 0 && paid >= total) return 'cash';
    if (paid > 0 && total > 0 && paid < total) return 'credit';
    if (remaining > 0 && total > 0) return 'credit';

    return 'cash';
}

function getReportRowQuantity(record) {
    const items = Array.isArray(record.items) ? record.items : [];
    const quantityFromItems = items.reduce((sum, item) => {
        const qty = Number(item.quantity || item.qty || item.count || 0);
        return sum + (isNaN(qty) ? 0 : qty);
    }, 0);

    if (quantityFromItems > 0) return quantityFromItems;

    const fallback = Number(record.quantity || record.qty || record.count || 1);
    return isNaN(fallback) ? 0 : fallback;
}

function getMonthRowsFromSnapshot(snapshot, monthValue) {
    const rows = [];
    if (!snapshot || !snapshot.docs) return rows;

    snapshot.docs.forEach((doc) => {
        const record = doc.data ? doc.data() : {};
        const date = normalizeDateValue(record.date || record.saleDate || record.createdAt || record.timestamp || record.created_on || record.updatedAt || doc.createTime || doc.updateTime);
        if (!date) return;

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (month !== monthValue) return;

        const total = getRecordTotal(record);
        if (!total || total <= 0) return;

        const items = Array.isArray(record.items) ? record.items : [];
        const productName = record.productName || record.name || record.product || (items[0] && (items[0].name || items[0].productName)) || 'منتج';

        rows.push({
            name: productName,
            quantity: getReportRowQuantity(record),
            total,
            type: getRecordType(record),
            date,
            items
        });
    });

    return rows;
}

function getMonthDateRange(monthValue) {
    const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;

    const lastDay = new Date(year, month, 0).getDate();
    return {
        startDate: `${match[1]}-${match[2]}-01`,
        endDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`
    };
}

function safeQuery(db, collectionName, monthValue) {
    if (!db || !db.collection) return Promise.resolve([]);

    const range = getMonthDateRange(monthValue);
    if (!range) return Promise.resolve([]);

    return db.collection(collectionName)
        .where("date", ">=", range.startDate)
        .where("date", "<=", range.endDate)
        .get()
        .then((snapshot) => getMonthRowsFromSnapshot(snapshot, monthValue))
        .catch(() => []);
}

function resetMonthlyReportCards() {
    const empty = document.getElementById('monthlyReportEmpty');
    const tbody = document.getElementById('monthlyReportTableBody');

    if (tbody) tbody.innerHTML = '';
    if (empty) empty.hidden = false;

    ['monthlyReportTotal', 'monthlyReportCash', 'monthlyReportCredit']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '0.00';
            }
        });
}

function buildMonthlyReportSummary(rows) {
    let total = 0;
    let cash = 0;
    let credit = 0;
    let salesCount = 0;
    let productsSold = 0;
    const productMap = {};

    rows.forEach((row) => {
        salesCount += 1;
        total += Number(row.total || 0);

        if (row.type === 'cash') {
            cash += Number(row.total || 0);
        } else {
            credit += Number(row.total || 0);
        }

        const items = Array.isArray(row.items) && row.items.length ? row.items : [{ name: row.name || 'منتج', quantity: row.quantity || 1 }];
        items.forEach((item) => {
            const itemName = String(item.name || 'منتج').trim() || 'منتج';
            const itemQty = Number(item.quantity || item.qty || item.count || 0);
            const safeQty = isNaN(itemQty) ? 0 : itemQty;
            if (safeQty > 0) {
                productsSold += safeQty;
                productMap[itemName] = (productMap[itemName] || 0) + safeQty;
            }
        });
    });

    const topProduct = Object.entries(productMap).sort((a, b) => b[1] - a[1])[0];

    return {
        total,
        cash,
        credit,
        salesCount,
        productsSold,
        topProduct: topProduct ? `${topProduct[0]} (${topProduct[1]})` : '-'
    };
}

async function loadMonthlyReport() {
    const monthValueInput = document.getElementById('monthlyReportMonthInput');
    const monthValue = monthValueInput && monthValueInput.value ? monthValueInput.value : getCurrentMonthValue();

    if (monthValueInput) {
        monthValueInput.value = monthValue;
    }

    if (!window.firebase || !firebase.firestore) {
        resetMonthlyReportCards();
        return;
    }

    const db = firebase.firestore();
    const collections = ['daily_sales', 'shakak_records'];

    try {
        const results = await Promise.all(collections.map((name) => safeQuery(db, name, monthValue)));
        const rows = results.flat();
        const tbody = document.getElementById('monthlyReportTableBody');
        const empty = document.getElementById('monthlyReportEmpty');
        let productRows = [];

        if (!rows.length) {
            resetMonthlyReportCards();
            return;
        }

        const summary = buildMonthlyReportSummary(rows);

            const monthlyTopProduct = document.getElementById('monthlyReportTopProduct');
            if (monthlyTopProduct) monthlyTopProduct.textContent = summary.topProduct;

        if (tbody) {
            const productSummaryMap = {};

            rows.forEach((row) => {
                const rowType = row.type === 'credit' ? 'شكك' : 'كاش';
                const items = Array.isArray(row.items) && row.items.length ? row.items : [{ name: row.name || 'منتج', quantity: row.quantity || 1, total: row.total || 0 }];
                items.forEach((item) => {
                    const name = String(item.name || 'منتج').trim() || 'منتج';
                    const quantity = Number(item.quantity || item.qty || item.count || 0);
                    const safeQty = isNaN(quantity) ? 0 : quantity;
                    if (safeQty <= 0) return;
                    const itemTotal = Number(item.total || item.amount || 0);
                    const summaryKey = `${name}::${rowType}`;
                    if (!productSummaryMap[summaryKey]) {
                        productSummaryMap[summaryKey] = { name, quantity: 0, total: 0, type: rowType };
                    }
                    productSummaryMap[summaryKey].quantity += safeQty;
                    productSummaryMap[summaryKey].total += isNaN(itemTotal) ? 0 : itemTotal;
                });
            });

            Object.entries(productSummaryMap)
                .sort((a, b) => b[1].quantity - a[1].quantity)
                .forEach(([, stats]) => {
                    const isCash = String(stats.type || 'كاش') === 'كاش';
                    const typeClass = isCash ? 'report-type-badge report-type-cash' : 'report-type-badge report-type-credit';
                    const typeText = isCash ? 'كاش' : 'شكك';
                    productRows.push(`<tr><td>${escapeHtml(stats.name)}</td><td>${stats.quantity}</td><td>${formatCurrency(stats.total)}</td><td><span class="${typeClass}">${escapeHtml(typeText)}</span></td></tr>`);
                });

            tbody.innerHTML = productRows.join('');
        }

        if (empty) empty.hidden = productRows.length > 0;

        document.getElementById('monthlyReportTotal').textContent = formatCurrency(summary.total);
        document.getElementById('monthlyReportCash').textContent = formatCurrency(summary.cash);
        document.getElementById('monthlyReportCredit').textContent = formatCurrency(summary.credit);
    } catch (error) {
        console.error('Monthly report error:', error);
        showToast('تعذر تحميل التقرير الشهري', false);
        resetMonthlyReportCards();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    try {
        const savedTheme = localStorage.getItem("theme") || "light";
        const isDark = savedTheme === "dark";
        document.body.classList.toggle("dark-mode", isDark);
        setThemeIcon(isDark);
    } catch(error) {
        document.body.classList.remove("dark-mode");
        setThemeIcon(false);
        console.warn("Theme storage unavailable:", error);
    }

    const monthlyMonthInput = document.getElementById('monthlyReportMonthInput');
    if (monthlyMonthInput) {
        monthlyMonthInput.value = getCurrentMonthValue();
        monthlyMonthInput.addEventListener('change', () => {
            syncMonthlyReportMonthDisplay();
            loadMonthlyReport();
        });
        const monthlyMonthPicker = document.getElementById('monthlyReportMonthPicker');
        const openMonthPicker = () => {
            monthlyMonthInput.focus();
            monthlyMonthInput.showPicker?.();
        };
        monthlyMonthPicker?.addEventListener('click', openMonthPicker);
        monthlyMonthPicker?.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openMonthPicker();
            }
        });
        syncMonthlyReportMonthDisplay();
    }

    switchTab("pos");

    const confirmYesBtn = document.getElementById("confirmYesBtn");

    if (confirmYesBtn) {

        confirmYesBtn.addEventListener("click", runConfirmCallback);

    }

    if (initializeFirebase()) {

        initRealtimeListeners();

    }

});

let posCart = [];

let currentSelectedIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
    setupScrollTopButton();
    setupFullscreenImage();
    setupBarcodeLookupOnAddForm();
    setupShakakAutocomplete();
    setupShakakCustomerAutocomplete();
    initializeShakakDateTime();
    initializeDailyReport();
    renderPosTable();
    renderShakakTable();

    document.getElementById("productCategoryFilter")?.addEventListener("change", () => {
        displayProducts(allProductsCache);
    });

    const productNameInput = document.getElementById("productName");
    const productCategoryInput = document.getElementById("productCategory");
    productNameInput?.addEventListener("input", event => applySuggestedCategory(event.target.value));
    productCategoryInput?.addEventListener("change", event => {
        event.target.dataset.categoryManuallyChanged = "1";
    });

    const posInput = document.getElementById("posSearchInput");

    const resultsContainer = document.getElementById("posAutocompleteResults");

    if (posInput && resultsContainer) {

        posInput.addEventListener("input", function() {

            const query = posInput.value.trim().toLowerCase();

            resultsContainer.innerHTML = "";

            currentSelectedIndex = -1;

            if (!query) {

                resultsContainer.style.display = "none";

                return;

            }

            const matchedProducts = sortProductsByCategory(allProductsCache.filter(p =>

                (p.name && p.name.toLowerCase().includes(query)) ||

                (p.barcode && p.barcode.toLowerCase().includes(query))

            ));

            if (matchedProducts.length === 0) {

                resultsContainer.style.display = "none";

                return;

            }

            resultsContainer.style.display = "block";

            matchedProducts.forEach((product) => {

                const itemDiv = document.createElement("div");

                itemDiv.className = "pos-suggestion-item";

                itemDiv.innerHTML = `

                    <span class="inline-style-25">${escapeHtml(product.name)}</span>

                    <span class="inline-style-26">${escapeHtml(formatCurrency(product.price))} جنيه</span>

                `;

                itemDiv.addEventListener("click", () => {

                    addProductToPosCart(product);

                    posInput.value = "";

                    resultsContainer.style.display = "none";

                    currentSelectedIndex = -1;

                });

                resultsContainer.appendChild(itemDiv);

            });

        });

        posInput.addEventListener("keydown", function(e) {

            const items = resultsContainer.querySelectorAll(".pos-suggestion-item");

            if (items.length === 0) return;

            if (e.key === "ArrowDown") {

                e.preventDefault();

                currentSelectedIndex++;

                if (currentSelectedIndex >= items.length) {

                    currentSelectedIndex = 0;

                }

                updateActiveSuggestion(items);

            }

            else if (e.key === "ArrowUp") {

                e.preventDefault();

                currentSelectedIndex--;

                if (currentSelectedIndex < 0) {

                    currentSelectedIndex = items.length - 1;

                }

                updateActiveSuggestion(items);

            }

            else if (e.key === "Enter") {

                e.preventDefault();

                if (currentSelectedIndex >= 0 && currentSelectedIndex < items.length) {

                    items[currentSelectedIndex].click();

                } else if (items.length === 1) {

                    items[0].click();

                }

            }

        });

        document.addEventListener("click", function(e) {

            if (!posInput.contains(e.target) && !resultsContainer.contains(e.target)) {

                resultsContainer.style.display = "none";

                currentSelectedIndex = -1;

            }

        });

    }

});

function updateActiveSuggestion(items) {

    items.forEach((item, index) => {

        if (index === currentSelectedIndex) {

            item.classList.add("active-suggestion");

            item.scrollIntoView({ block: "nearest" });

        } else {

            item.classList.remove("active-suggestion");

        }

    });

}

function addProductToPosCart(foundProduct) {

    playBeepSound();

    const existingCartItem = posCart.find(item => item.id === foundProduct.id);

    if (existingCartItem) {

        existingCartItem.quantity += 1;

    } else {

        posCart.push({

            id: foundProduct.id,

            name: foundProduct.name,

            price: Number(foundProduct.price) || 0,

            quantity: 1

        });

    }

    renderPosTable();

}

function renderCartRow(item, itemTotal, qtyHandler, removeHandler) {
    const id = escapeHtml(item.id);
    return `
        <tr>
            <td class="lux-name">${productNameMarkup(item.name)}</td>
            <td>
                <div class="quantity-controls">
                    <button type="button" class="pos-qty-btn" onclick="${qtyHandler}('${id}', -1)">−</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button type="button" class="pos-qty-btn" onclick="${qtyHandler}('${id}', 1)">+</button>
                </div>
            </td>
            <td class="lux-price">${formatCurrency(item.price)}</td>
            <td class="lux-total">${formatCurrency(itemTotal)}</td>
            <td>
                <button type="button" class="pos-remove-btn" aria-label="حذف المنتج" onclick="${removeHandler}('${id}')">×</button>
            </td>
        </tr>`;
}

function renderPosTable() {
    const list = document.getElementById("posTableBody");
    const countSpan = document.getElementById("posItemCount");
    const grandTotalSpan = document.getElementById("posGrandTotal");
    if (!list) return;

    let grandTotal = 0;
    if (!posCart.length) {
        list.innerHTML = '<tr class="lux-empty-row"><td colspan="5">أضف منتجاً للبدء</td></tr>';
    } else {
        list.innerHTML = posCart.map(item => {
            const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
            grandTotal += itemTotal;
            return renderCartRow(item, itemTotal, "updatePosQty", "removePosItem");
        }).join("");
    }

    if (countSpan) countSpan.textContent = posCart.length;
    if (grandTotalSpan) grandTotalSpan.textContent = formatCurrency(grandTotal);
}

function updatePosQty(id, change) {

    const item = posCart.find(i => i.id === id);

    if (item) {

        item.quantity += change;

        if (item.quantity <= 0) {

            posCart = posCart.filter(i => i.id !== id);

        }

        renderPosTable();

    }

}

function removePosItem(id) {

    posCart = posCart.filter(i => i.id !== id);

    renderPosTable();

}

function movePosCartToShakak() {
    if (!posCart.length) {
        showToast("الفاتورة فارغة", false);
        return;
    }

    const customerInput = document.getElementById("shakakCustomerName");
    const paidInput = document.getElementById("shakakPaidAmount");

    posCart.forEach(item => {
        const existing = shakakCart.find(product => product.id === item.id);
        if (existing) {
            existing.quantity += Number(item.quantity) || 0;
        } else {
            shakakCart.push({
                id: item.id,
                name: item.name,
                price: Number(item.price) || 0,
                quantity: Number(item.quantity) || 0
            });
        }
    });

    posCart = [];
    renderPosTable();
    renderShakakTable();
    initializeShakakDateTime(true);

    if (paidInput) paidInput.value = "0";
    if (customerInput) {
        customerInput.focus();
        customerInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    switchTab("shakak");
    showToast("تم نقل المنتجات إلى الشكك");
}

let shakakCart = [];
let shakakSelectedIndex = -1;

function getLocalDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getLocalTimeValue(date = new Date()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initializeShakakDateTime(force = false) {
    const dateInput = document.getElementById("shakakDate");
    const timeInput = document.getElementById("shakakTime");
    if (dateInput && (force || !dateInput.value)) dateInput.value = getLocalDateValue();
    if (timeInput && (force || !timeInput.value)) timeInput.value = getLocalTimeValue();
}

function getShakakGrandTotal() {
    return shakakCart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
}

function updateShakakPaymentSummary() {
    const total = getShakakGrandTotal();
    const paidInput = document.getElementById("shakakPaidAmount");
    const remainingInput = document.getElementById("shakakRemainingAmount");
    const summaryTotal = document.getElementById("shakakSummaryTotal");
    const summaryPaid = document.getElementById("shakakSummaryPaid");
    const summaryDebt = document.getElementById("shakakSummaryDebt");

    let paid = Number(paidInput ? paidInput.value : 0);
    if (!Number.isFinite(paid) || paid < 0) paid = 0;
    if (paid > total) paid = total;
    const remaining = Math.max(0, total - paid);

    if (paidInput && Number(paidInput.value) !== paid) paidInput.value = paid.toFixed(2);
    if (remainingInput) remainingInput.value = remaining.toFixed(2);
    if (summaryTotal) summaryTotal.textContent = formatCurrency(total);
    if (summaryPaid) summaryPaid.textContent = formatCurrency(paid);
    if (summaryDebt) summaryDebt.textContent = formatCurrency(remaining);
}

function setupShakakCustomerAutocomplete() {
    const input = document.getElementById("shakakCustomerName");
    const results = document.getElementById("shakakCustomerAutocompleteResults");
    if (!input || !results || input.dataset.initialized === "true") return;

    input.dataset.initialized = "true";
    let selectedIndex = -1;

    input.addEventListener("input", () => {
        selectedShakakCustomerId = null;
        selectedIndex = -1;
        renderShakakCustomerSuggestions(input.value);
    });

    input.addEventListener("keydown", event => {
        const items = results.querySelectorAll(".shakak-customer-suggestion-item");

        if (event.key === "ArrowDown") {
            if (!items.length) return;
            event.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateShakakCustomerActiveSuggestion(items, selectedIndex);
        } else if (event.key === "ArrowUp") {
            if (!items.length) return;
            event.preventDefault();
            selectedIndex = selectedIndex - 1;
            if (selectedIndex < 0) selectedIndex = items.length - 1;
            updateShakakCustomerActiveSuggestion(items, selectedIndex);
        } else if (event.key === "Enter") {
            if (!items.length) return;
            event.preventDefault();
            const index = selectedIndex >= 0 && selectedIndex < items.length ? selectedIndex : 0;
            items[index].click();
            selectedIndex = -1;
        } else if (event.key === "Escape") {
            results.style.display = "none";
            selectedIndex = -1;
        }
    });

    document.addEventListener("click", event => {
        if (!input.contains(event.target) && !results.contains(event.target)) {
            results.style.display = "none";
            selectedIndex = -1;
        }
    });

    input.addEventListener("focus", () => {
        if (input.value.trim()) renderShakakCustomerSuggestions(input.value);
    });
}

function renderShakakCustomerSuggestions(query) {
    const input = document.getElementById("shakakCustomerName");
    const results = document.getElementById("shakakCustomerAutocompleteResults");
    if (!input || !results) return;

    const q = String(query || "").trim().toLowerCase();
    results.innerHTML = "";

    if (!q) {
        results.style.display = "none";
        return;
    }

    const matched = allCustomersCache
        .filter(customer => String(customer.customerName || "").toLowerCase().includes(q))
        .sort((a, b) => {
            const aName = String(a.customerName || "").toLowerCase();
            const bName = String(b.customerName || "").toLowerCase();
            const aStarts = aName.startsWith(q) ? 0 : 1;
            const bStarts = bName.startsWith(q) ? 0 : 1;
            return aStarts - bStarts || aName.localeCompare(bName, "ar");
        })
        .slice(0, 20);

    if (!matched.length) {
        results.style.display = "none";
        return;
    }

    results.style.display = "block";
    matched.forEach(customer => {
        const item = document.createElement("div");
        item.className = "shakak-customer-suggestion-item";
        const debtText = Number(customer.totalDebt || 0) > 0.000001
            ? `عليه ${formatCurrency(customer.totalDebt)} جنيه`
            : "بدون دين";

        item.innerHTML = `
            <span>${escapeHtml(customer.customerName)}</span>
            <span class="shakak-customer-debt">${escapeHtml(debtText)}</span>`;

        item.addEventListener("click", () => {
            input.value = customer.customerName;
            selectedShakakCustomerId = customer.id;
            results.style.display = "none";
            const currentDebt = Number(customer.totalDebt || 0);
            input.title = currentDebt > 0 ? `الدين الحالي: ${formatCurrency(currentDebt)} جنيه` : "لا يوجد دين حالي";
        });

        results.appendChild(item);
    });
}

function updateShakakCustomerActiveSuggestion(items, index) {
    items.forEach((item, itemIndex) => {
        item.classList.toggle("active-suggestion", itemIndex === index);
        if (itemIndex === index) item.scrollIntoView({ block: "nearest" });
    });
}

function setupShakakAutocomplete() {
    const input = document.getElementById("shakakSearchInput");
    const results = document.getElementById("shakakAutocompleteResults");
    if (!input || !results || input.dataset.initialized === "true") return;
    input.dataset.initialized = "true";

    input.addEventListener("input", () => renderShakakSuggestions(input.value));
    input.addEventListener("keydown", event => {
        const items = results.querySelectorAll(".shakak-suggestion-item");
        if (event.key === "ArrowDown") {
            if (!items.length) return;
            event.preventDefault();
            shakakSelectedIndex = (shakakSelectedIndex + 1) % items.length;
            updateShakakActiveSuggestion(items);
        } else if (event.key === "ArrowUp") {
            if (!items.length) return;
            event.preventDefault();
            shakakSelectedIndex = shakakSelectedIndex - 1;
            if (shakakSelectedIndex < 0) shakakSelectedIndex = items.length - 1;
            updateShakakActiveSuggestion(items);
        } else if (event.key === "Enter") {
            if (!items.length) return;
            event.preventDefault();
            if (shakakSelectedIndex >= 0 && shakakSelectedIndex < items.length) {
                items[shakakSelectedIndex].click();
            } else {
                items[0].click();
            }
        }
    });
    document.addEventListener("click", event => {
        if (!input.contains(event.target) && !results.contains(event.target)) {
            results.style.display = "none";
            shakakSelectedIndex = -1;
        }
    });
}

function renderShakakSuggestions(query) {
    const input = document.getElementById("shakakSearchInput");
    const results = document.getElementById("shakakAutocompleteResults");
    if (!input || !results) return;
    const q = String(query || "").trim().toLowerCase();
    results.innerHTML = "";
    shakakSelectedIndex = -1;
    if (!q) { results.style.display = "none"; return; }

    const matched = sortProductsByCategory(allProductsCache.filter(product =>
        String(product.name || "").toLowerCase().includes(q) ||
        String(product.barcode || "").toLowerCase().includes(q)
    )).slice(0, 30);

    if (!matched.length) { results.style.display = "none"; return; }
    results.style.display = "block";

    matched.forEach(product => {
        const item = document.createElement("div");
        item.className = "shakak-suggestion-item";
        item.innerHTML = `<span>${escapeHtml(product.name || "بدون اسم")}</span><span class="suggestion-price">${escapeHtml(formatCurrency(product.price ?? 0))} جنيه</span>`;
        item.addEventListener("click", () => {
            addProductToShakakCart(product);
            input.value = "";
            results.style.display = "none";
            shakakSelectedIndex = -1;
        });
        results.appendChild(item);
    });
}

function updateShakakActiveSuggestion(items) {
    items.forEach((item, index) => {
        item.classList.toggle("active-suggestion", index === shakakSelectedIndex);
        if (index === shakakSelectedIndex) item.scrollIntoView({ block: "nearest" });
    });
}

function addProductToShakakCart(foundProduct) {
    playBeepSound();
    const existing = shakakCart.find(item => item.id === foundProduct.id);
    if (existing) existing.quantity += 1;
    else shakakCart.push({ id: foundProduct.id, name: foundProduct.name, price: Number(foundProduct.price) || 0, quantity: 1 });
    renderShakakTable();
}

function renderShakakTable() {
    const list = document.getElementById("shakakTableBody");
    const count = document.getElementById("shakakItemCount");
    const total = document.getElementById("shakakGrandTotal");
    if (!list) return;

    let grandTotal = 0;
    if (!shakakCart.length) {
        list.innerHTML = '<tr class="lux-empty-row"><td colspan="5">أضف منتجاً للفاتورة</td></tr>';
    } else {
        list.innerHTML = shakakCart.map(item => {
            const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
            grandTotal += itemTotal;
            return renderCartRow(item, itemTotal, "updateShakakQty", "removeShakakItem");
        }).join("");
    }

    if (count) count.textContent = shakakCart.length;
    if (total) total.textContent = formatCurrency(grandTotal);
    updateShakakPaymentSummary();
}

function updateShakakQty(id, change) {
    const item = shakakCart.find(product => product.id === id);
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) shakakCart = shakakCart.filter(product => product.id !== id);
    renderShakakTable();
}

function removeShakakItem(id) {
    shakakCart = shakakCart.filter(product => product.id !== id);
    renderShakakTable();
}

function normalizeCustomerName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatArabicTime12(value) {
    if (!value) return "-";
    const match = String(value).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(value);
    let hours = Number(match[1]);
    const minutes = match[2];
    const period = hours >= 12 ? "مساءً" : "صباحاً";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
}

function formatArabicDate(value) {
    if (!value) return "-";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value);
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
}

function formatPriceUpdateDateTime(update) {
    const date = normalizeDateValue(update?.timestamp || update?.updatedAt || update?.updateId);
    if (!date) return "تاريخ التعديل: غير متوفر";
    return `آخر تعديل: ${formatArabicDate(getLocalDateValue(date))} - ${formatArabicTime12(getLocalTimeValue(date))}`;
}

async function saveShakakRecord() {
    if (!firebaseReady || !db) { showToast("تعذر الحفظ", false); return; }
    const customerInput = document.getElementById("shakakCustomerName");
    const dateInput = document.getElementById("shakakDate");
    const timeInput = document.getElementById("shakakTime");
    const paidInput = document.getElementById("shakakPaidAmount");
    const saveButton = document.getElementById("saveShakakBtn");
    const customerName = customerInput ? customerInput.value.trim() : "";
    const date = dateInput ? dateInput.value : "";
    const time = timeInput ? timeInput.value : "";
    const total = Number(getShakakGrandTotal().toFixed(2));
    const paid = Number(paidInput ? paidInput.value : 0);

    if (!customerName) { showToast("اسم العميل مطلوب", false); customerInput?.focus(); return; }
    if (!date || !time) { showToast("تأكد من التاريخ والوقت", false); return; }
    if (!shakakCart.length || total <= 0) { showToast("أضف منتجاً", false); return; }
    if (!Number.isFinite(paid) || paid < 0 || paid > total) { showToast("قيمة الدفع غير صحيحة", false); return; }
    if (saveButton?.disabled) return;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add("is-saving");
        saveButton.textContent = "جاري الحفظ...";
    }

    const remaining = Number((total - paid).toFixed(2));
    const selectedCustomer = selectedShakakCustomerId
        ? allCustomersCache.find(customer => customer.id === selectedShakakCustomerId)
        : null;
    const existingCustomer = selectedCustomer || allCustomersCache.find(
        customer => customer.customerKey === normalizeCustomerName(customerName)
    );
    const customerId = existingCustomer
        ? existingCustomer.id
        : db.collection("debt_customers").doc().id;
    const customerRef = db.collection("debt_customers").doc(customerId);
    const saleRef = db.collection("shakak_records").doc();
    const items = shakakCart.map(item => ({
        productId: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        total: Number(((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(2))
    }));
    const saleEntry = { type: "sale", recordId: saleRef.id, date, time, items, total, paid, debtAdded: remaining };
    const transactionRef = customerRef.collection("transactions").doc(saleRef.id);

    try {
        await db.runTransaction(async transaction => {
            const customerSnapshot = await transaction.get(customerRef);
            const oldData = customerSnapshot.exists ? (customerSnapshot.data() || {}) : {};
            const oldDebt = Number(oldData.totalDebt || 0);
            const newDebt = Number((oldDebt + remaining).toFixed(2));

            transaction.set(saleRef, {
                customerId,
                customerName,
                customerKey: normalizeCustomerName(customerName),
                date, time, items, total, paid, remaining,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            transaction.set(transactionRef, saleEntry);

            transaction.set(customerRef, {
                customerName,
                customerKey: normalizeCustomerName(customerName),
                totalDebt: newDebt,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastDate: date,
                lastTime: time
            }, { merge: true });
        });

        shakakCart = [];
        selectedShakakCustomerId = null;
        if (customerInput) {
            customerInput.value = "";
            customerInput.title = "";
        }
        if (paidInput) paidInput.value = "0";
        const searchInput = document.getElementById("shakakSearchInput");
        if (searchInput) searchInput.value = "";
        initializeShakakDateTime(true);
        renderShakakTable();
        showToast("تم حفظ Note");
    } catch (error) {
        console.error("Save shakak error:", error);
        showToast("تعذر الحفظ", false);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.classList.remove("is-saving");
            saveButton.textContent = "حفظ";
        }
    }
}

function filterDebtCustomers() { renderDebtCustomers(); }

async function loadCustomerTransactions(customer) {
    if (!db || !customer?.id) return Array.isArray(customer?.transactions) ? customer.transactions : [];

    try {
        const snapshot = await db.collection("debt_customers")
            .doc(customer.id)
            .collection("transactions")
            .get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (transactions.length) {
            customerTransactionsCache.set(customer.id, transactions);
            return transactions;
        }
    } catch (error) {
        console.error("Load customer transactions error:", error);
    }

    const legacyTransactions = Array.isArray(customer.transactions) ? customer.transactions : [];
    customerTransactionsCache.set(customer.id, legacyTransactions);
    return legacyTransactions;
}

async function renderDebtCustomers() {
    const list = document.getElementById("debtCustomersList");
    if (!list) return;
    const searchInput = document.getElementById("debtsSearchInput");
    const q = String(searchInput ? searchInput.value : "").trim().toLowerCase();
    const customers = allDebtCustomersCache.filter(customer => !q || String(customer.customerName || "").toLowerCase().includes(q));

    if (!customers.length) { list.innerHTML = '<div class="empty-debts">لا يوجد عملاء مديونين حالياً.</div>'; return; }
    const customersWithTransactions = await Promise.all(customers.map(async customer => ({
        customer,
        transactions: await loadCustomerTransactions(customer)
    })));
    list.innerHTML = customersWithTransactions.map(({ customer, transactions }) => `
        <div class="debt-customer-card">
            <div class="debt-customer-info">
                <h4>${escapeHtml(customer.customerName || "بدون اسم")}</h4>
                <div id="debt-payment-${escapeHtml(customer.id)}" class="debt-payment-panel" hidden>
                    <div class="debt-selected-name">العميل: <strong>${escapeHtml(customer.customerName || "")}</strong></div>
                    <div class="debt-current-line">المبلغ الإجمالي: <strong>${formatCurrency(customer.totalDebt)}</strong> جنيه</div>
                    <div class="form-group">
                        <label for="debt-payment-input-${escapeHtml(customer.id)}">المبلغ المسدد</label>
                        <input type="number" id="debt-payment-input-${escapeHtml(customer.id)}" min="0" step="0.01" placeholder="اكتب المبلغ..." inputmode="decimal">
                    </div>
                    <div class="debt-payment-actions">
                        <button type="button" onclick="cancelDebtPayment('${escapeHtml(customer.id)}')" class="btn-cancel-debt">إلغاء</button>
                        <button type="button" onclick="payDebt('${escapeHtml(customer.id)}')" class="btn-pay-debt">تسجيل الدفع</button>
                    </div>
                </div>
                <div class="debt-amount">${formatCurrency(customer.totalDebt)} جنيه</div>
                <div class="debt-card-actions">
                    <button type="button" class="btn-open-debt-details" aria-expanded="false" onclick="toggleDebtDetails('${escapeHtml(customer.id)}')">السجل</button>
                    <button type="button" class="btn-open-debt-payment" onclick="openDebtPayment('${escapeHtml(customer.id)}')">سداد</button>
                </div>
                <div id="debt-details-${escapeHtml(customer.id)}" class="debt-details" aria-hidden="true">${renderDebtTransactionDetails(transactions)}</div>
            </div>
        </div>`).join("");
}

function getTransactionTimestamp(transaction) {
    const date = String(transaction.date || "");
    const time = String(transaction.time || "00:00");
    const timestamp = Date.parse(`${date}T${time}`);
    if (Number.isFinite(timestamp)) return timestamp;
    const createdAt = normalizeDateValue(transaction.createdAt);
    if (createdAt) return createdAt.getTime();
    return Number(date.replace(/\D/g, "") + time.replace(/\D/g, "")) || 0;
}

function renderDebtTransactionDetails(customerTransactions) {
    const transactions = Array.isArray(customerTransactions)
        ? customerTransactions
            .map((transaction, index) => ({ transaction, index }))
            .sort((a, b) => getTransactionTimestamp(a.transaction) - getTransactionTimestamp(b.transaction) || a.index - b.index)
            .map(entry => entry.transaction)
        : [];
    if (!transactions.length) return '<div class="debt-no-details">لا توجد تفاصيل مسجلة.</div>';

    let runningDebt = 0;
    const calculatedTransactions = transactions.map(transaction => {
        const oldDebt = Number(runningDebt.toFixed(2));
        if (transaction.type === "payment") {
            const amount = Math.max(0, Number(transaction.amount) || 0);
            runningDebt = Math.max(0, Number((oldDebt - amount).toFixed(2)));
            return { transaction, oldDebt, newDebt: runningDebt };
        }

        const total = Math.max(0, Number(transaction.total) || 0);
        const paid = Math.min(total, Math.max(0, Number(transaction.paid) || 0));
        runningDebt = Number((oldDebt + total - paid).toFixed(2));
        return { transaction, oldDebt, newDebt: runningDebt, total, paid };
    });

    return calculatedTransactions.reverse().map(({ transaction, oldDebt, newDebt, total, paid }) => {
        const dateTime = `${escapeHtml(transaction.date || "-")} - ${escapeHtml(formatArabicTime12(transaction.time))}`;
        if (transaction.type === "payment") {
            return `<div class="debt-transaction payment-transaction">
                <div class="debt-transaction-header"><span class="debt-transaction-label debt-payment-label">سداد</span><span class="debt-transaction-date-time">${dateTime}</span></div>
                <div class="debt-amount-summary payment-summary">
                    <div class="debt-amount-box">القديم<strong class="amount-old">${formatCurrency(oldDebt)}</strong></div>
                    <div class="debt-amount-box">المدفوع<strong class="amount-paid">${formatCurrency(transaction.amount)}</strong></div>
                    <div class="debt-amount-box">الباقي<strong class="amount-remain">${formatCurrency(newDebt)}</strong></div>
                </div>
            </div>`;
        }
        const items = Array.isArray(transaction.items) ? transaction.items : [];
        const itemsHtml = items.map(item => {
            const quantity = Math.round(Number(item.quantity || 0));
            const price = Number(item.price || 0);
            return `<li class="debt-item-row"><span class="debt-item-name">${escapeHtml(item.name || "بدون اسم")}</span><span class="debt-item-math">${formatNumber(quantity)} × ${formatCurrency(price)}</span><span class="debt-item-total">${formatCurrency(quantity * price)} جنيه</span></li>`;
        }).join("");
        const oldDebtHtml = oldDebt > 0.000001
            ? `<div class="debt-amount-box">القديم<strong class="amount-old">${formatCurrency(oldDebt)}</strong></div>`
            : "";
        return `<div class="debt-transaction sale-transaction">
            <div class="debt-transaction-header"><span class="debt-transaction-label debt-sale-label">شكك</span><span class="debt-transaction-date-time">${dateTime}</span></div>
            <div class="debt-amount-summary">
                ${oldDebtHtml}
                <div class="debt-amount-box">الإجمالي<strong class="amount-total">${formatCurrency(total)}</strong></div>
                <div class="debt-amount-box">المدفوع<strong class="amount-paid">${formatCurrency(paid)}</strong></div>
                <div class="debt-amount-box">الباقي<strong class="amount-remain">${formatCurrency(newDebt)}</strong></div>
            </div>
            ${itemsHtml ? `<ul class="debt-items-list">${itemsHtml}</ul>` : ""}
        </div>`;
    }).join("");
}

function toggleDebtDetails(customerId) {
    const details = document.getElementById(`debt-details-${customerId}`);
    if (!details) return;
    const button = document.querySelector(`.btn-open-debt-details[onclick*="${customerId}"]`);
    const isOpen = details.classList.toggle("is-open");
    details.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (button) {
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.textContent = isOpen ? "إخفاء السجل" : "السجل";
    }
}

function openDebtPayment(customerId) {
    const customer = allDebtCustomersCache.find(item => item.id === customerId);
    if (!customer) return;
    selectedDebtCustomerId = customer.id;
    selectedDebtCustomerData = customer;
    const panel = document.getElementById(`debt-payment-${customer.id}`);
    const payment = document.getElementById(`debt-payment-input-${customer.id}`);
    if (panel) panel.hidden = false;
    if (payment) { payment.value = ""; payment.max = Number(customer.totalDebt).toFixed(2); payment.focus(); }
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelDebtPayment(customerId = selectedDebtCustomerId) {
    const panel = customerId ? document.getElementById(`debt-payment-${customerId}`) : null;
    if (panel) panel.hidden = true;
    if (customerId === selectedDebtCustomerId) {
        selectedDebtCustomerId = null;
        selectedDebtCustomerData = null;
    }
}

async function payDebt(customerId = selectedDebtCustomerId) {
    if (!firebaseReady || !db || !customerId) return;
    selectedDebtCustomerId = customerId;
    const payment = Number(document.getElementById(`debt-payment-input-${customerId}`)?.value || 0);
    if (!Number.isFinite(payment) || payment <= 0) { showToast("أدخل مبلغاً صحيحاً", false); return; }
    const paymentPanel = document.getElementById(`debt-payment-${customerId}`);
    const paymentButton = paymentPanel?.querySelector(".btn-pay-debt");
    if (paymentButton?.disabled) return;
    if (paymentButton) {
        paymentButton.disabled = true;
        paymentButton.classList.add("is-saving");
        paymentButton.textContent = "جاري السداد...";
    }
    const paymentDate = getLocalDateValue();
    const paymentTime = getLocalTimeValue();
    let closedCustomerName = "";
    try {
        const customerRef = db.collection("debt_customers").doc(customerId);
        const paymentRef = customerRef.collection("transactions").doc();
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(customerRef);
            if (!snapshot.exists) throw new Error("CUSTOMER_NOT_FOUND");
            const data = snapshot.data() || {};
            const currentDebt = Number(data.totalDebt || 0);
            if (!Number.isFinite(currentDebt) || currentDebt <= 0) throw new Error("NO_DEBT");
            if (payment > currentDebt + 0.000001) throw new Error("PAYMENT_TOO_HIGH");
            const newDebt = Number(Math.max(0, currentDebt - payment).toFixed(2));
            transaction.set(paymentRef, {
                type: "payment",
                date: paymentDate,
                time: paymentTime,
                amount: Number(payment.toFixed(2)),
                remainingDebt: newDebt,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (newDebt <= 0.000001) {
                closedCustomerName = String(data.customerName || "").trim();
                transaction.delete(customerRef);
            } else {
                transaction.update(customerRef, {
                    totalDebt: newDebt,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastDate: paymentDate,
                    lastTime: paymentTime
                });
            }
        });
        if (closedCustomerName) {
            customerTransactionsCache.delete(customerId);
            allDebtCustomersCache = allDebtCustomersCache.filter(customer => customer.id !== selectedDebtCustomerId);
            allCustomersCache = allCustomersCache.filter(customer => customer.id !== selectedDebtCustomerId);
            renderDebtCustomers();
            renderShakakCustomerSuggestions(document.getElementById("shakakCustomerName")?.value || "");
            const shakakCustomerInput = document.getElementById("shakakCustomerName");
            if (shakakCustomerInput && normalizeCustomerName(shakakCustomerInput.value) === normalizeCustomerName(closedCustomerName)) {
                shakakCustomerInput.value = "";
                shakakCustomerInput.title = "";
                selectedShakakCustomerId = null;
            }
        } else {
            const customer = allDebtCustomersCache.find(item => item.id === customerId);
            if (customer) {
                const newDebt = Number((Number(customer.totalDebt || 0) - payment).toFixed(2));
                customer.totalDebt = Math.max(0, newDebt);
                customer.lastDate = paymentDate;
                customer.lastTime = paymentTime;
                const paymentEntry = {
                    id: `payment-${paymentDate}-${paymentTime}`,
                    type: "payment",
                    date: paymentDate,
                    time: paymentTime,
                    amount: Number(payment.toFixed(2)),
                    remainingDebt: customer.totalDebt
                };
                const transactions = customerTransactionsCache.get(customer.id) || [];
                customerTransactionsCache.set(customer.id, [...transactions, paymentEntry]);
                renderDebtCustomers();
                renderShakakCustomerSuggestions(document.getElementById("shakakCustomerName")?.value || "");
            }
        }
        cancelDebtPayment(customerId);
        showToast(closedCustomerName ? "تم السداد بالكامل" : "تم السداد الجزئي");
    } catch (error) {
        console.error("Debt payment error:", error);
        if (error.message === "PAYMENT_TOO_HIGH") showToast("المبلغ أكبر من الدين", false);
        else if (error.message === "NO_DEBT") showToast("لا يوجد دين حالي", false);
        else if (error.message === "CUSTOMER_NOT_FOUND") showToast("العميل غير موجود", false);
        else showToast("تعذر السداد", false);
    } finally {
        if (paymentButton) {
            paymentButton.disabled = false;
            paymentButton.classList.remove("is-saving");
            paymentButton.textContent = "تسجيل الدفع";
        }
    }
}

async function completePosSale() {
    if (!firebaseReady || !db) {
        showToast("غير متصل", false);
        return;
    }

    if (posCart.length === 0) {
        showToast("الفاتورة فارغة", false);
        return;
    }

    const saleButton = document.querySelector('#pos-section button[onclick="completePosSale()"]');
    if (saleButton?.disabled) return;
    if (saleButton) {
        saleButton.disabled = true;
        saleButton.classList.add("is-saving");
        saleButton.textContent = "جاري الحفظ...";
    }
    const saleDate = getLocalDateValue();
    const saleTime = getLocalTimeValue();
    const items = posCart.map(item => ({
        productId: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        total: Number(((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(2))
    }));
    const total = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));

    try {
        await db.collection("daily_sales").add({
            type: "cash",
            date: saleDate,
            time: saleTime,
            items,
            total,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        posCart = [];
        renderPosTable();
        showToast("تم البيع");
    } catch (error) {
        console.error("Complete POS sale error:", error);
        showToast("تعذر البيع", false);
    } finally {
        if (saleButton) {
            saleButton.disabled = false;
            saleButton.classList.remove("is-saving");
            saleButton.textContent = "بيع 💸";
        }
    }
}

let dailyReportDateManuallyChanged=false;
let reportCalendarMonth=null;
function formatDateDisplay(v){const p=String(v||"").split("-");return p.length===3&&p.every(Boolean)?`${p[2]}/${p[1]}/${p[0]}`:formatDateDisplayFallback();}
function formatDateDisplayFallback(){const d=new Date();return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;}
function parseDateValue(v){const [y,m,d]=String(v||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d,12):new Date();}
function syncReportDateDisplay(){const h=document.getElementById("reportDate"),d=document.getElementById("reportDateDisplay");if(h&&d)d.value=formatDateDisplay(h.value);}
function setReportDate(v,manual=true){const h=document.getElementById("reportDate");if(!h)return;h.value=v;dailyReportDateManuallyChanged=manual;syncReportDateDisplay();loadDailyReport();}
function shiftReportDay(delta){const h=document.getElementById("reportDate"),d=parseDateValue(h?.value||getLocalDateValue());d.setDate(d.getDate()+delta);setReportDate(getLocalDateValue(d),true);}
function openReportCalendar(){const c=document.getElementById("reportCalendar"),h=document.getElementById("reportDate");if(!c||!h)return;reportCalendarMonth=parseDateValue(h.value||getLocalDateValue());reportCalendarMonth.setDate(1);c.hidden=false;renderReportCalendar();}
function closeReportCalendar(){const c=document.getElementById("reportCalendar");if(c)c.hidden=true;}
function renderReportCalendar(){const c=document.getElementById("reportCalendar"),h=document.getElementById("reportDate");if(!c||!reportCalendarMonth)return;const mo=reportCalendarMonth.getMonth(),yr=reportCalendarMonth.getFullYear(),sel=h?.value||"",title=new Intl.DateTimeFormat("ar-EG",{month:"long",year:"numeric"}).format(reportCalendarMonth),first=new Date(yr,mo,1,12).getDay(),days=new Date(yr,mo+1,0,12).getDate();const names=["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"];let cells=names.map(x=>`<span class="calendar-weekday">${x}</span>`).join("");for(let i=0;i<first;i++)cells+=`<span class="calendar-day empty"></span>`;for(let day=1;day<=days;day++){const v=`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;cells+=`<button type="button" class="calendar-day${v===sel?" active":""}" data-date="${v}">${day}</button>`;}c.innerHTML=`<div class="calendar-topbar"><button type="button" class="calendar-month-nav" data-month="-1">→</button><strong>${title}</strong><button type="button" class="calendar-month-nav" data-month="1">←</button></div><div class="calendar-grid">${cells}</div><button type="button" class="calendar-today-btn" id="reportCalendarToday">اليوم</button>`;c.querySelectorAll("[data-month]").forEach(b=>b.addEventListener("click",()=>{reportCalendarMonth.setMonth(reportCalendarMonth.getMonth()+Number(b.dataset.month));renderReportCalendar();}));c.querySelectorAll("[data-date]").forEach(b=>b.addEventListener("click",()=>{setReportDate(b.dataset.date,true);closeReportCalendar();}));document.getElementById("reportCalendarToday")?.addEventListener("click",()=>{setReportDate(getLocalDateValue(),true);closeReportCalendar();});}
function initializeDailyReport(){const h=document.getElementById("reportDate"),d=document.getElementById("reportDateDisplay");if(!h||!d)return;h.value=getLocalDateValue();dailyReportDateManuallyChanged=false;syncReportDateDisplay();d.addEventListener("click",openReportCalendar);d.addEventListener("focus",openReportCalendar);document.getElementById("reportPrevDay")?.addEventListener("click",()=>shiftReportDay(-1));document.getElementById("reportNextDay")?.addEventListener("click",()=>shiftReportDay(1));document.addEventListener("click",e=>{const control=document.querySelector(".report-date-control"),c=document.getElementById("reportCalendar");if(control&&c&&!control.contains(e.target))closeReportCalendar();});loadDailyReport();}
function formatArabicReportDate(v){return new Intl.DateTimeFormat("ar-EG",{weekday:"long"}).format(parseDateValue(v));}
function formatReportTime(v){const m=String(v||"").match(/^(\d{1,2}):(\d{2})/);if(!m)return String(v||"-");let h=Number(m[1]);const period=h>=12?"مساءً":"صباحاً";h=h%12||12;return `${h}:${m[2]} ${period}`;}
function renderDailyReportCards(sales) {
    const list = document.getElementById("dailyReportCards");
    const empty = document.getElementById("dailyReportEmpty");
    if (!list) return;
    list.innerHTML = sales.map(sale => {
        const items = Array.isArray(sale.items) ? sale.items : [];
        const customer = sale.reportType === "شكك" ? String(sale.customerName || "").trim() : "";
        const typeClass = sale.reportType === "كاش" ? "report-type-cash" : "report-type-credit";
        const rows = items.map(item => `<div class="daily-report-card-item">
            <span class="daily-report-item-name">${escapeHtml(item.name || "بدون اسم")}</span>
            <span class="daily-report-item-qty">${formatNumber(item.quantity || 0)} × ${formatCurrency(item.price || 0)}</span>
            <strong class="daily-report-item-total">${formatCurrency(item.total || (Number(item.quantity || 0) * Number(item.price || 0)))} جنيه</strong>
        </div>`).join("");
        const headerClass = sale.reportType === "شكك" ? " daily-report-card-header-credit" : "";
        return `<article class="daily-report-card">
            <header class="daily-report-card-header${headerClass}">
                <span class="daily-report-card-time">${escapeHtml(formatReportTime(sale.time))}</span>
                <span class="report-type-badge ${typeClass}">${escapeHtml(sale.reportType || "-")}</span>
                ${customer ? `<span class="daily-report-card-customer">${escapeHtml(customer)}</span>` : ""}
            </header>
            <div class="daily-report-card-items">${rows || '<div class="daily-report-card-empty">لا توجد منتجات</div>'}</div>
            <footer class="daily-report-card-footer">إجمالي الفاتورة <strong>${formatCurrency(sale.total)} جنيه</strong></footer>
        </article>`;
    }).join("");
    if (empty) empty.style.display = sales.length ? "none" : "block";
}
async function loadDailyReport(){const h=document.getElementById("reportDate"),date=(h?.value||getLocalDateValue());if(h&&!/^\d{4}-\d{2}-\d{2}$/.test(h.value))h.value=getLocalDateValue();const safeDate=h?.value||date,w=document.getElementById("reportWeekday");if(w)w.textContent=formatArabicReportDate(safeDate);syncReportDateDisplay();if(!firebaseReady||!db){renderDailyReport([],[]);return;}try{const [cs,ks]=await Promise.all([db.collection("daily_sales").where("date","==",safeDate).get(),db.collection("shakak_records").where("date","==",safeDate).get()]);const cash=[],credit=[];cs.forEach(doc=>cash.push({id:doc.id,...doc.data(),reportType:"كاش"}));ks.forEach(doc=>credit.push({id:doc.id,...doc.data(),reportType:"شكك"}));renderDailyReport(cash,credit);}catch(error){console.error("Daily report error:",error);showToast("تعذر تحميل التقرير",false);renderDailyReport([],[]);}}
function setReportText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderDailyReport(cashSales, creditSales) {
    const cashTotal = cashSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const creditTotal = creditSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const sales = [...cashSales, ...creditSales].sort((a, b) => {
        const timeA = String(a.time || "");
        const timeB = String(b.time || "");
        return timeB.localeCompare(timeA);
    });
    const quantities = {};
    sales.forEach(sale => (Array.isArray(sale.items) ? sale.items : []).forEach(item => {
        const key = String(item.productId || item.name || "");
        quantities[key] = quantities[key] || { name: item.name || "بدون اسم", quantity: 0 };
        quantities[key].quantity += Number(item.quantity || 0);
    }));
    setReportText("reportTotalSales", formatCurrency(cashTotal + creditTotal));
    setReportText("reportCashSales", formatCurrency(cashTotal));
    setReportText("reportCreditSales", formatCurrency(creditTotal));
    renderDailyReportCards(sales);
}405