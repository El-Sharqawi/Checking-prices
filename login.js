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
let selectedShakakCustomerId = null;
let selectedDebtCustomerId = null;
let selectedDebtCustomerData = null;

let confirmCallback = null;

let activeScanner = null;

let activeScannerElementId = null;

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
        
        osc.frequency.setValueAtTime(2000, now); 
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08); // مدة قصيرة جداً وحادة
        
        osc.start(now);
        osc.stop(now + 0.08);
        
        osc.addEventListener("ended", () => {
            try { audioCtx.close(); } catch (e) {}
        });
    } catch (e) {
    }
}

function playBeepSound() {
    playBeep();
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

function normalizeProductName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
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

        reader.onload = event => resolve(event.target.result);

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

function switchTab(tab) {

    stopCurrentScanner();

    const mainContainer = document.querySelector(".container");
    const priceUpdatesSection = document.getElementById("priceUpdatesSection");

    // شاشة الأسعار الجديدة مستقلة بالكامل عن لوحة التحكم.
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

    if (tab === "search" && typeof searchProducts === "function") {
        searchProducts();
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

            allProductsCache.sort((a,b) => { const t=p=>{const v=p.createdAt;if(v&&typeof v.toMillis==="function")return v.toMillis();if(v&&typeof v.seconds==="number")return v.seconds*1000;const n=Number(v);return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};return t(a)-t(b); });

            updateStats(allProductsCache);

            searchProducts();

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

                if (customer.customerName) {
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

        statMax.textContent = `${max} ج.م`;

    }

}

async function saveProduct() {

    if (!firebaseReady || !db) {

        showToast("تعذر الحفظ", false);

        return;

    }

    const editingId = document.getElementById("editingId").value.trim();
    const saveButton = document.getElementById("saveProductBtn");

    const name = document.getElementById("productName").value.trim();

    const priceRaw = document.getElementById("productPrice").value.trim();

    const barcode =

        document.getElementById("productBarcode").value.trim() || "بدون باركود";

    const imageInput = document.getElementById("productImage");

    if (!name || !priceRaw) {

        showToast("أدخل الاسم والسعر", false);

        return;

    }

    const priceNumber = Number(priceRaw);

    if (!Number.isFinite(priceNumber) || priceNumber < 0) {

        showToast("أدخل سعراً صحيحاً", false);

        return;

    }

    if (isDuplicateProductName(name, editingId)) {
        showToast("هذا المنتج موجود", false);
        return;
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
            await updateExistingProduct(editingId, name, priceRaw, barcode, newImage);
            document.getElementById("editingId").value = "";
            resetFormFields();
            if (saveButton) saveButton.textContent = "حفظ المنتج";
            showToast("تم التعديل");
        } else {

            const newProduct = {

                name,

                price: priceRaw,

                barcode,

                image: newImage || "",

                createdAt: Date.now()

            };

            resetFormFields();

            showToast("تم الحفظ");

            db.collection("products").add(newProduct).catch(err => {

                console.error("Background save error:", err);

                showToast("تعذر الحفظ", false);

            });

        }

    } catch (error) {

        console.error("Save product error:", error);

        if (error && error.message === "DUPLICATE_PRODUCT_NAME") {
            showToast("هذا المنتج موجود", false);
        } else {
            showToast("تعذر الحفظ", false);
        }

    }

}

async function updateExistingProduct(id, name, price, barcode, newImage) {

    const productRef = db.collection("products").doc(id);

    const oldSnapshot = await productRef.get();

    if (!oldSnapshot.exists) {

        throw new Error("المنتج المطلوب تعديله غير موجود.");

    }

    const old = oldSnapshot.data() || {};

    if (isDuplicateProductName(name, id)) {
        throw new Error("DUPLICATE_PRODUCT_NAME");
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

        barcode,

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

        if (latestProductUpdate && latestProductUpdate.id) {

            const updateRef = db.collection("price_updates_list").doc(latestProductUpdate.id);

            batch.update(updateRef, {

                name,

                image: updatedData.image,

                oldPrice: String(old.price ?? ""),

                price,

                barcode,

                timestamp: firebase.firestore.FieldValue.serverTimestamp()

            });

        } else {

            const updateRef = db.collection("price_updates_list").doc();

            batch.set(updateRef, {

                updateId: Date.now(),

                productId: id,

                name,

                image: updatedData.image,

                oldPrice: String(old.price ?? ""),

                price,

                barcode,

                timestamp: firebase.firestore.FieldValue.serverTimestamp()

            });
        }

        await batch.commit();

    } else {

        await productRef.update(updatedData);

    }

}

function resetFormFields() {

    const name = document.getElementById("productName");

    const price = document.getElementById("productPrice");

    const barcode = document.getElementById("productBarcode");

    const image = document.getElementById("productImage");

    const imageName = document.getElementById("imageFileName");

    if (name) name.value = "";

    if (price) price.value = "";

    if (barcode) barcode.value = "";

    if (image) image.value = "";

    if (imageName) imageName.textContent = "";

    const imageUrl = document.getElementById("productImageUrl");
    if (imageUrl) imageUrl.value = "";

    setBarcodeLookupStatus("");

}

function displayProducts(products) {

    const list = document.getElementById("resultsList");

    if (!list) return;

    const selectAllBtn = document.getElementById("selectAllBtn");

    if (products.length === 0) {

        list.innerHTML =

            '<p class="inline-style-20">لا توجد منتجات.</p>';

        if (selectAllBtn) {

            selectAllBtn.style.display = "none";

        }

        toggleDeleteSelectedBtn();

        return;

    }

    let html = "";

    products.forEach(product => {

        const id = escapeHtml(product.id);

        const name = escapeHtml(product.name || "بدون اسم");

        const price = escapeHtml(product.price ?? "0");

        const barcode = escapeHtml(product.barcode || "بدون باركود");

        const image = product.image

            ? escapeHtml(product.image)

            : "https://via.placeholder.com/60?text=No+Img";

        html += `

            <div class="product-card" onclick="openProductModal('${id}')">

                <input

                    type="checkbox"

                    class="product-checkbox"

                    data-id="${id}"

                    onclick="event.stopPropagation()"

                    onchange="toggleDeleteSelectedBtn()"

                    aria-label="تحديد ${name}"

                >

                <img

                    src="${image}"

                    class="product-thumb"

                    alt="${name}"

                    loading="lazy"

                    onerror="this.src='https://via.placeholder.com/60?text=No+Img'"

                >

                <div class="product-info">

                    <h4>${name}</h4>

                    <p class="product-price-txt">

                        السعر: <strong>${price} ج.م</strong>

                    </p>

                    <p class="product-barcode-txt">

                        الباركود: ${barcode}

                    </p>

                </div>

                <div class="actions-group" onclick="event.stopPropagation()">

                    <button type="button" class="btn-edit" onclick="editProduct('${id}')">

                        تعديل

                    </button>

                    <button type="button" class="btn-delete" onclick="deleteProduct('${id}')">

                        حذف

                    </button>

                </div>

            </div>

        `;

    });

    list.innerHTML = html;

    toggleDeleteSelectedBtn();

}

function searchProducts() {

    const input = document.getElementById("searchInput");

    const q = input ? input.value.trim().toLowerCase() : "";

    if (!q) {

        displayProducts(allProductsCache);

        return;

    }

    const filtered = allProductsCache.filter(product => {

        const name = String(product.name ?? "").toLowerCase();

        const price = String(product.price ?? "").toLowerCase();

        const barcode = String(product.barcode ?? "").toLowerCase();

        return (

            name.includes(q) ||

            price.includes(q) ||

            barcode.includes(q)

        );

    });

    displayProducts(filtered);

}

function setupAutoSelectProductFields() {
    ["productName", "productPrice", "productBarcode"].forEach(id => {
        const input = document.getElementById(id);
        if (!input || input.dataset.autoSelectReady === "1") return;
        input.dataset.autoSelectReady = "1";
        input.addEventListener("focus", () => {
            requestAnimationFrame(() => {
                try { input.select(); } catch (error) {}
            });
        });
    });
}

function editProduct(id) {

    const product = getProductById(id);

    if (!product) {

        showToast("المنتج غير موجود", false);

        return;

    }

    document.getElementById("editingId").value = id;

    document.getElementById("productName").value = product.name || "";

    document.getElementById("productPrice").value = product.price ?? "";

    document.getElementById("productBarcode").value =

        product.barcode === "بدون باركود" ? "" : (product.barcode || "");

    const saveBtn = document.getElementById("saveProductBtn");
    if (saveBtn) saveBtn.textContent = "حفظ التعديل";

    const imageName = document.getElementById("imageFileName");

    if (imageName) {

        imageName.textContent = product.image

            ? "الصورة الحالية محفوظة  اختر صورة جديدة لاستبدالها."

            : "";

    }

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

function toggleSelectAll() {

    const checkboxes = document.querySelectorAll(".product-checkbox");

    if (!checkboxes.length) return;

    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {

        cb.checked = !allChecked;

    });

    toggleDeleteSelectedBtn();

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

                if (checked.length > 500) {

                    showToast("الحد الأقصى 500", false);

                    return;

                }

                const productIds = checked

                    .map(cb => cb.getAttribute("data-id"))

                    .filter(Boolean);

                const batch = db.batch();

                productIds.forEach(id => {

                    batch.delete(db.collection("products").doc(id));

                });

                await batch.commit();

                const updateRefs = [];

                for (const id of productIds) {

                    const snapshot = await db

                        .collection("price_updates_list")

                        .where("productId", "==", id)

                        .get();

                    snapshot.forEach(doc => updateRefs.push(doc.ref));

                }

                if (updateRefs.length > 0) {

                    if (updateRefs.length > 500) {

                        console.warn(

                            "Some price update records were not deleted because they exceed the 500-operation batch limit."

                        );

                    } else {

                        const updateBatch = db.batch();

                        updateRefs.forEach(ref => updateBatch.delete(ref));

                        await updateBatch.commit();

                    }

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
    const product=getProductById(id); if(!product){showToast("المنتج غير موجود.",false);return;}
    const image=document.getElementById("modalImg"),name=document.getElementById("modalName"),price=document.getElementById("modalPrice"),barcode=document.getElementById("modalBarcode"),modal=document.getElementById("productModal");
    if(image){image.src=product.image||"https://via.placeholder.com/130?text=No+Img";image.onerror=()=>{image.src="https://via.placeholder.com/130?text=No+Img";};}
    if(name)name.textContent=product.name||"بدون اسم"; if(barcode)barcode.textContent="الباركود: "+(product.barcode||"بدون باركود");
    const updates=allPriceUpdatesCache.filter(u=>u.productId===id).sort((a,b)=>{const t=x=>x.timestamp&&typeof x.timestamp.toMillis==="function"?x.timestamp.toMillis():Number(x.updateId||0);return t(b)-t(a);});
    const latest=updates[0];
    if(price){if(latest&&String(latest.price)===String(product.price))price.innerHTML=`<span class="modal-old-price">${escapeHtml(latest.oldPrice??"")} ج.م</span><span class="modal-new-price">${escapeHtml(product.price??"")} ج.م</span>`;else price.textContent=`${product.price??0} ج.م`;}
    if(modal)modal.style.display="flex";
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

    const modal = document.getElementById("productModal");

    if (image) {

        image.src =

            update.image ||

            "https://via.placeholder.com/130?text=No+Img";

        image.onerror = () => {

            image.src = "https://via.placeholder.com/130?text=No+Img";

        };

    }

    if (name) {

        name.textContent = update.name || "بدون اسم";

    }

    if (price) {

        price.innerHTML = "";

        const oldSpan = document.createElement("span");

        oldSpan.textContent = `${update.oldPrice ?? ""} ج.م`;

        oldSpan.style.textDecoration = "line-through";

        oldSpan.style.color = "#ef4444";

        oldSpan.style.marginLeft = "10px";

        const newSpan = document.createElement("span");

        newSpan.textContent = `${update.price ?? ""} ج.م`;

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

    if (modal) modal.style.display = "flex";

}

function closeProductModal() {

    const modal = document.getElementById("productModal");

    if (modal) modal.style.display = "none";

}

function displayPriceUpdates(updates) {

    const list = document.getElementById("priceUpdatesModalList") || document.getElementById("updatesList");

    if (!list) return;

    if (updates.length === 0) {

        list.innerHTML =

            '<p class="inline-style-21">لا توجد تعديلات على الأسعار حتى الآن.</p>';

        return;

    }

    let html = "";

    updates.forEach(update => {

        const id = escapeHtml(update.id);

        const name = escapeHtml(update.name || "بدون اسم");

        const oldPrice = escapeHtml(update.oldPrice ?? "");

        const price = escapeHtml(update.price ?? "");

        const image = update.image

            ? escapeHtml(update.image)

            : "https://via.placeholder.com/50?text=No+Img";

        html += `

            <div class="product-card" onclick="openUpdateModal('${id}')">

                <img

                    src="${image}"

                    class="product-thumb"

                    alt="${name}"

                    loading="lazy"

                    onerror="this.src='https://via.placeholder.com/50?text=No+Img'"

                >

                <div class="product-info">
                    <h4>${name}</h4>
                    <p class="price-update-line">
                        <span class="price-update-old">${oldPrice} ج.م</span>
                        <span class="price-update-arrow">←</span>
                        <strong class="price-update-new">${price} ج.م</strong>
                    </p>
                    <p class="product-barcode-txt price-update-barcode">الباركود: ${escapeHtml(update.barcode || "بدون باركود")}</p>
                </div>
                <div class="actions-group" onclick="event.stopPropagation()">
                    <button type="button" class="pos-remove-btn" aria-label="حذف سجل السعر" onclick="deleteSingleUpdate('${id}')">×</button>
                </div>

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

    if (!input || !input.files || !input.files[0]) return;

    const file = input.files[0];

    const fileNameElement = document.getElementById("imageFileName");

    if (fileNameElement) {

        fileNameElement.textContent = "تم اختيار الصورة: " + file.name;

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

                const scannedCode = String(decodedText || "").trim();
                const targetInput = document.getElementById(inputTargetId);

                if (targetInput) {

                    targetInput.value = scannedCode;

                }

                if (inputTargetId === "shakakSearchInput") {
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    if (decodedProduct) {
                        addProductToShakakCart(decodedProduct);
                        targetInput.value = "";
                    } else {
                        showToast("المنتج غير مسجل", false);
                    }
                }

                if (inputTargetId === "posSearchInput") {
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    await stopCurrentScanner();
                    if (decodedProduct) {
                        addProductToPosCart(decodedProduct);
                        if (targetInput) targetInput.value = "";
                        showToast("تمت القراءة");
                    } else {
                        switchTab("add");
                        const barcodeInput = document.getElementById("productBarcode");
                        if (barcodeInput) barcodeInput.value = scannedCode;
                        showToast("عفوًا، هذا المنتج غير مسجل", false);
                        await lookupAndFillProductFromBarcode(scannedCode, { forceName: true });
                    }
                    return;
                }

                if (inputTargetId === "productBarcode") {
                    await stopCurrentScanner();
                    const decodedProduct = findLocalProductByBarcode(scannedCode);
                    if (decodedProduct) {
                        showToast("تمت القراءة");
                    } else {
                        showToast("المنتج غير مسجل", false);
                    }
                    await lookupAndFillProductFromBarcode(scannedCode, { forceName: false });
                    return;
                }

                if (isSearch) {

                    searchProducts();

                }

                showToast("تمت القراءة");

                await stopCurrentScanner();

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

    if (reader) reader.style.display = "none";

    if (searchReader) searchReader.style.display = "none";
    if (shakakReader) shakakReader.style.display = "none";
    if (posReader) posReader.style.display = "none";

    void activeElementId;

}

function openMonthlyReportModal() {
    const modal = document.getElementById('monthlyReportModal');
    const input = document.getElementById('monthlyReportMonthInput');
    if (input && !input.value) {
        input.value = getCurrentMonthValue();
    }
    if (modal) {
        modal.style.display = 'flex';
    }
    loadMonthlyReport();
}

function closeMonthlyReportModal() {
    const modal = document.getElementById('monthlyReportModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openPriceUpdatesModal() {
    const modal = document.getElementById('priceUpdatesModal');
    if (modal) {
        modal.style.display = 'flex';
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
}

function getCurrentMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(value) {
    const num = Number(value || 0);
    return isNaN(num) ? '0.00' : num.toFixed(2);
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

function safeQuery(db, collectionName, monthValue) {
    if (!db || !db.collection) return Promise.resolve([]);

    return db.collection(collectionName).get()
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
    const collections = ['daily_sales', 'shakak_records', 'sales', 'saleRecords', 'transactions', 'orders', 'records'];

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
                    const typeClass = isCash ? 'monthly-report-type-cash' : 'monthly-report-type-credit';
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
        monthlyMonthInput.addEventListener('change', loadMonthlyReport);
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

function playBeepSound() {

    try {

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const oscillator = audioCtx.createOscillator();

        const gainNode = audioCtx.createGain();

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        oscillator.connect(gainNode);

        gainNode.connect(audioCtx.destination);

        oscillator.start();

        oscillator.stop(audioCtx.currentTime + 0.15);

    } catch (e) {

        console.log("AudioContext blocked or not supported", e);

    }

}

let currentSelectedIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
    setupAutoSelectProductFields();
    setupBarcodeLookupOnAddForm();
    setupShakakAutocomplete();
    setupShakakCustomerAutocomplete();
    initializeShakakDateTime();
    initializeDailyReport();
    renderPosTable();
    renderShakakTable();

    ["shakakPaidAmount", "shakakRemainingAmount"].forEach(id => {
        const input=document.getElementById(id);
        if(input){input.addEventListener("focus",()=>requestAnimationFrame(()=>input.select()));input.addEventListener("click",()=>input.select());}
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

            const matchedProducts = allProductsCache.filter(p =>

                (p.name && p.name.toLowerCase().includes(query)) ||

                (p.barcode && p.barcode.toLowerCase().includes(query))

            );

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

                    <span class="inline-style-26">${escapeHtml(product.price)} جنيه</span>

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
            <td class="lux-name">${escapeHtml(item.name)}</td>
            <td>
                <div class="quantity-controls">
                    <button type="button" class="pos-qty-btn" onclick="${qtyHandler}('${id}', -1)">−</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button type="button" class="pos-qty-btn" onclick="${qtyHandler}('${id}', 1)">+</button>
                </div>
            </td>
            <td class="lux-price">${(Number(item.price) || 0).toFixed(2)}</td>
            <td class="lux-total">${itemTotal.toFixed(2)}</td>
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
    if (grandTotalSpan) grandTotalSpan.textContent = grandTotal.toFixed(2);
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
    if (summaryTotal) summaryTotal.textContent = total.toFixed(2);
    if (summaryPaid) summaryPaid.textContent = paid.toFixed(2);
    if (summaryDebt) summaryDebt.textContent = remaining.toFixed(2);
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
            ? `عليه ${Number(customer.totalDebt).toFixed(2)} جنيه`
            : "بدون دين";

        item.innerHTML = `
            <span>${escapeHtml(customer.customerName)}</span>
            <span class="shakak-customer-debt">${escapeHtml(debtText)}</span>`;

        item.addEventListener("click", () => {
            input.value = customer.customerName;
            selectedShakakCustomerId = customer.id;
            results.style.display = "none";
            const currentDebt = Number(customer.totalDebt || 0);
            input.title = currentDebt > 0 ? `الدين الحالي: ${currentDebt.toFixed(2)} جنيه` : "لا يوجد دين حالي";
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

    const matched = allProductsCache.filter(product =>
        String(product.name || "").toLowerCase().includes(q) ||
        String(product.barcode || "").toLowerCase().includes(q)
    ).slice(0, 30);

    if (!matched.length) { results.style.display = "none"; return; }
    results.style.display = "block";

    matched.forEach(product => {
        const item = document.createElement("div");
        item.className = "shakak-suggestion-item";
        item.innerHTML = `<span>${escapeHtml(product.name || "بدون اسم")}</span><span class="suggestion-price">${escapeHtml(product.price ?? 0)} جنيه</span>`;
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
    if (total) total.textContent = grandTotal.toFixed(2);
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

function getCustomerDocId(name) {
    const value = normalizeCustomerName(name);
    let hash1 = 2166136261;
    let hash2 = 16777619;
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        hash1 ^= code;
        hash1 = Math.imul(hash1, 16777619);
        hash2 ^= code + i;
        hash2 = Math.imul(hash2, 2246822519);
    }
    return `customer_${(hash1 >>> 0).toString(36)}_${(hash2 >>> 0).toString(36)}`;
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

    const remaining = Number((total - paid).toFixed(2));
    const selectedCustomer = selectedShakakCustomerId
        ? allCustomersCache.find(customer => customer.id === selectedShakakCustomerId)
        : null;
    const customerId = selectedCustomer ? selectedCustomer.id : getCustomerDocId(customerName);
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

    try {
        await db.runTransaction(async transaction => {
            const customerSnapshot = await transaction.get(customerRef);
            const oldData = customerSnapshot.exists ? (customerSnapshot.data() || {}) : {};
            const oldDebt = Number(oldData.totalDebt || 0);
            const newDebt = Number((oldDebt + remaining).toFixed(2));

            transaction.set(saleRef, {
                customerName,
                customerKey: normalizeCustomerName(customerName),
                date, time, items, total, paid, remaining,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            transaction.set(customerRef, {
                customerName,
                customerKey: normalizeCustomerName(customerName),
                totalDebt: newDebt,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastDate: date,
                lastTime: time,
                transactions: firebase.firestore.FieldValue.arrayUnion(saleEntry)
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
    }
}

function filterDebtCustomers() { renderDebtCustomers(); }

function renderDebtCustomers() {
    const list = document.getElementById("debtCustomersList");
    if (!list) return;
    const searchInput = document.getElementById("debtsSearchInput");
    const q = String(searchInput ? searchInput.value : "").trim().toLowerCase();
    const customers = allDebtCustomersCache.filter(customer => !q || String(customer.customerName || "").toLowerCase().includes(q));

    if (!customers.length) { list.innerHTML = '<div class="empty-debts">لا يوجد عملاء مديونين حالياً.</div>'; return; }
    list.innerHTML = customers.map(customer => `
        <div class="debt-customer-card debt-customer-card-wrap">
            <div class="debt-customer-info">
                <h4>${escapeHtml(customer.customerName || "بدون اسم")}</h4>
                <div class="debt-amount">${Number(customer.totalDebt || 0).toFixed(2)} جنيه</div>
                <div class="debt-meta">آخر تحديث: ${escapeHtml(customer.lastDate || "-")} ${escapeHtml(customer.lastTime || "")}</div>
                <div class="debt-card-actions">
                    <button type="button" class="btn-open-debt-details" aria-expanded="false" onclick="toggleDebtDetails('${escapeHtml(customer.id)}')">التفاصيل</button>
                    <button type="button" class="btn-open-debt-payment" onclick="openDebtPayment('${escapeHtml(customer.id)}')"> سداد</button>
                </div>
                <div id="debt-details-${escapeHtml(customer.id)}" class="debt-details inline-style-19" aria-hidden="true">${renderDebtTransactionDetails(customer)}</div>
            </div>
        </div>`).join("");
}

function renderDebtTransactionDetails(customer) {
    const transactions = Array.isArray(customer.transactions) ? [...customer.transactions].reverse() : [];
    if (!transactions.length) return '<div class="debt-no-details">لا توجد تفاصيل مسجلة.</div>';

    return transactions.map(transaction => {
        if (transaction.type === "payment") {
            return `<div class="debt-transaction payment-transaction">
                <strong>سداد</strong>
                <span>${escapeHtml(transaction.date || "-")} ${escapeHtml(transaction.time || "")}</span>
                <span>المبلغ: <strong class="amount-paid">${Number(transaction.amount || 0).toFixed(2)}</strong> جنيه</span>
                <span>المتبقي: <strong class="amount-remain">${Number(transaction.remainingDebt || 0).toFixed(2)}</strong> جنيه</span>
            </div>`;
        }

        const items = Array.isArray(transaction.items) ? transaction.items : [];
        const itemsHtml = items.map(item =>
            `<li>${escapeHtml(item.name || "بدون اسم")} × ${Number(item.quantity || 0)} = ${Number(item.total || 0).toFixed(2)} جنيه</li>`
        ).join("");

        return `<div class="debt-transaction sale-transaction">
            <strong>شكك</strong>
            <span>${escapeHtml(transaction.date || "-")} ${escapeHtml(transaction.time || "")}</span>
            <span>الإجمالي: <strong class="amount-total">${Number(transaction.total || 0).toFixed(2)}</strong> جنيه</span>
            <span>المدفوع: <strong class="amount-paid">${Number(transaction.paid || 0).toFixed(2)}</strong> جنيه</span>
            <span>الباقي: <strong class="amount-remain">${Number(transaction.debtAdded || 0).toFixed(2)}</strong> جنيه</span>
            ${itemsHtml ? `<ul>${itemsHtml}</ul>` : ""}
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
        button.textContent = isOpen ? "إخفاء التفاصيل" : "التفاصيل";
    }
}

function openDebtPayment(customerId) {
    const customer = allDebtCustomersCache.find(item => item.id === customerId);
    if (!customer) { showToast("العميل غير موجود", false); return; }
    selectedDebtCustomerId = customer.id;
    selectedDebtCustomerData = customer;
    const panel = document.getElementById("debtPaymentPanel");
    const name = document.getElementById("selectedDebtCustomerName");
    const amount = document.getElementById("selectedDebtCurrentAmount");
    const payment = document.getElementById("debtPaymentAmount");
    if (panel) panel.style.display = "block";
    if (name) name.textContent = customer.customerName || "";
    if (amount) amount.textContent = Number(customer.totalDebt || 0).toFixed(2);
    if (payment) { payment.value = ""; payment.max = Number(customer.totalDebt || 0).toFixed(2); payment.focus(); }
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelDebtPayment() {
    selectedDebtCustomerId = null;
    selectedDebtCustomerData = null;
    const panel = document.getElementById("debtPaymentPanel");
    const payment = document.getElementById("debtPaymentAmount");
    if (panel) panel.style.display = "none";
    if (payment) payment.value = "";
}

async function payDebt() {
    if (!firebaseReady || !db) { showToast("غير متصل", false); return; }
    if (!selectedDebtCustomerId) { showToast("اختر عميلاً", false); return; }
    const paymentInput = document.getElementById("debtPaymentAmount");
    const payment = Number(paymentInput ? paymentInput.value : 0);
    if (!Number.isFinite(payment) || payment <= 0) { showToast("أدخل مبلغاً صحيحاً", false); return; }

    const customerRef = db.collection("debt_customers").doc(selectedDebtCustomerId);
    const paymentDate = getLocalDateValue();
    const paymentTime = getLocalTimeValue();
    let oldDebtForMessage = Number(selectedDebtCustomerData?.totalDebt || 0);

    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(customerRef);
            if (!snapshot.exists) throw new Error("CUSTOMER_NOT_FOUND");
            const data = snapshot.data() || {};
            const currentDebt = Number(data.totalDebt || 0);
            oldDebtForMessage = currentDebt;
            if (currentDebt <= 0) throw new Error("NO_DEBT");
            if (payment > currentDebt + 0.000001) throw new Error("PAYMENT_TOO_HIGH");
            const newDebt = Number(Math.max(0, currentDebt - payment).toFixed(2));
            transaction.set(customerRef, {
                totalDebt: newDebt,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastDate: paymentDate,
                lastTime: paymentTime,
                transactions: firebase.firestore.FieldValue.arrayUnion({
                    type: "payment", date: paymentDate, time: paymentTime,
                    amount: Number(payment.toFixed(2)), remainingDebt: newDebt
                })
            }, { merge: true });
        });

        cancelDebtPayment();
        showToast(payment >= oldDebtForMessage ? "تم السداد" : "تم السداد");
    } catch (error) {
        console.error("Debt payment error:", error);
        if (error.message === "PAYMENT_TOO_HIGH") showToast("المبلغ أكبر من الدين", false);
        else if (error.message === "NO_DEBT") showToast("لا يوجد دين", false);
        else if (error.message === "CUSTOMER_NOT_FOUND") showToast("العميل غير موجود", false);
        else showToast("تعذر السداد", false);
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
function formatReportMoney(v){return Number(v||0).toFixed(2);}
function formatReportTime(v){const m=String(v||"").match(/^(\d{1,2}):(\d{2})/);if(!m)return String(v||"-");let h=Number(m[1]);const ap=h>=12?"م":"ص";h=h%12||12;return `${h}:${m[2]} ${ap}`;}
async function loadDailyReport(){const h=document.getElementById("reportDate"),date=(h?.value||getLocalDateValue());if(h&&!/^\d{4}-\d{2}-\d{2}$/.test(h.value))h.value=getLocalDateValue();const safeDate=h?.value||date,w=document.getElementById("reportWeekday");if(w)w.textContent=formatArabicReportDate(safeDate);syncReportDateDisplay();if(!firebaseReady||!db){renderDailyReport([],[]);return;}try{const [cs,ks]=await Promise.all([db.collection("daily_sales").where("date","==",safeDate).get(),db.collection("shakak_records").where("date","==",safeDate).get()]);const cash=[],credit=[];cs.forEach(doc=>cash.push({id:doc.id,...doc.data(),reportType:"كاش"}));ks.forEach(doc=>credit.push({id:doc.id,...doc.data(),reportType:"شكك"}));renderDailyReport(cash,credit);}catch(error){console.error("Daily report error:",error);showToast("تعذر تحميل التقرير",false);renderDailyReport([],[]);}}
function renderDailyReport(cashSales,creditSales){const cashTotal=cashSales.reduce((s,x)=>s+Number(x.total||0),0),creditTotal=creditSales.reduce((s,x)=>s+Number(x.total||0),0),totalSales=cashTotal+creditTotal,allSales=[...cashSales,...creditSales].sort((a,b)=>String(a.time||"").localeCompare(String(b.time||""))),stats={};allSales.forEach(s=>(Array.isArray(s.items)?s.items:[]).forEach(i=>{const k=String(i.productId||i.name||"");if(!stats[k])stats[k]={name:i.name||"بدون اسم",quantity:0};stats[k].quantity+=Number(i.quantity||0);}));const vals=Object.values(stats).sort((a,b)=>b.quantity-a.quantity);setReportText("reportTotalSales",totalSales.toFixed(2));setReportText("reportCashSales",cashTotal.toFixed(2));setReportText("reportCreditSales",creditTotal.toFixed(2));setReportText("reportTopProduct",vals.length?`${vals[0].name} (${vals[0].quantity})`:"-");const list=document.getElementById("dailyReportTableBody"),empty=document.getElementById("dailyReportEmpty");if(!list)return;list.innerHTML="";allSales.forEach(s=>(Array.isArray(s.items)?s.items:[]).forEach(i=>{const customer=s.reportType==="شكك"?(s.customerName||""):"",cls=s.reportType==="كاش"?"report-type-cash":"report-type-credit";list.insertAdjacentHTML("beforeend",`<tr><td class="lux-name">${escapeHtml(i.name||"بدون اسم")}<small>${escapeHtml(formatReportTime(s.time))}${customer?" · "+escapeHtml(customer):""}</small></td><td>${Number(i.quantity||0)}</td><td class="lux-total">${Number(i.total||0).toFixed(2)}</td><td><span class="report-type-badge ${cls}">${escapeHtml(s.reportType||"-")}</span></td></tr>`);}));if(empty)empty.style.display=allSales.length?"none":"block";}
function setReportText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}