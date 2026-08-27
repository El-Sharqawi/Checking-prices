// javascript

/* =========================================================
   1) Firebase Initialization
   ========================================================= */

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

        // ** سطر تفعيل العمل بدون إنترنت **
        db.enablePersistence().catch((err) => {
            if (err.code == 'failed-precondition') {
                console.log("فشل التفعيل: هناك أكثر من تبويب مفتوح.");
            } else if (err.code == 'unimplemented') {
                console.log("المتصفح لا يدعم ميزة التخزين المؤقت.");
            }
        });

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

/* =========================================================
   2) Global State
   ========================================================= */

let allProductsCache = [];
let allPriceUpdatesCache = [];

let isSaving = false;
let confirmCallback = null;

let activeScanner = null;
let activeScannerElementId = null;

/* =========================================================
   3) Helpers
   ========================================================= */

function playBeep() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const audioCtx = new AudioContextClass();
        const now = audioCtx.currentTime;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "sine";
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.start(now);
        osc.stop(now + 0.25);

        osc.addEventListener("ended", () => {
            try { audioCtx.close(); } catch (e) {}
        });
    } catch (e) {
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

function getUpdateById(id) {
    return allPriceUpdatesCache.find(update => update.id === id) || null;
}

function setSaveButtonState(saving) {
    const btn = document.getElementById("saveProductBtn");
    if (!btn) return;

    btn.disabled = saving;
    btn.classList.toggle("is-saving", saving);

    if (saving) {
        btn.dataset.originalText = btn.textContent.trim();
        btn.textContent = "جاري الحفظ...";
    } else {
        btn.textContent = btn.dataset.originalText || "حفظ المنتج";
    }
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

/* =========================================================
   4) Theme
   ========================================================= */

function toggleTheme() {
    document.body.classList.toggle("dark-mode");

    const isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        themeBtn.textContent = isDark ? "☀️" : "🌙";
    }
}

/* =========================================================
   5) Tabs (محدث ليشمل البيع السريع)
   ========================================================= */

function switchTab(tab) {
    stopCurrentScanner();

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    // إخفاء كل الأقسام (سواء بتعتمد على active أو display:none)
    document.querySelectorAll(".tab-content, .section-content").forEach(section => {
        section.style.display = "none";
        section.classList.remove("active");
    });

    const tabMap = {
        pos: { buttonIndex: 0, sectionId: "pos-section" },
        add: { buttonIndex: 1, sectionId: "addSection" },
        search: { buttonIndex: 2, sectionId: "searchSection" },
        updates: { buttonIndex: 3, sectionId: "updatesSection" }
    };

    const selected = tabMap[tab];
    if (!selected) return;

    const buttons = document.querySelectorAll(".tab-btn");
    const section = document.getElementById(selected.sectionId);

    if (buttons[selected.buttonIndex]) {
        buttons[selected.buttonIndex].classList.add("active");
    }

    if (section) {
        section.style.display = "block";
        section.classList.add("active");
    }

    if (tab === "search" && typeof searchProducts === "function") {
        searchProducts();
    }
}

/* =========================================================
   6) Real-time Firestore Listeners
   ========================================================= */

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
}

/* =========================================================
   7) Statistics
   ========================================================= */

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

/* =========================================================
   8) Save / Update Product (فوري بدون انتظار)
   ========================================================= */

async function saveProduct() {
    if (!firebaseReady || !db) {
        showToast("Firebase غير متصل. لا يمكن الحفظ الآن.", false);
        return;
    }
    const editingId = document.getElementById("editingId").value.trim();
    const name = document.getElementById("productName").value.trim();
    const priceRaw = document.getElementById("productPrice").value.trim();
    const barcode =
        document.getElementById("productBarcode").value.trim() || "بدون باركود";
    const imageInput = document.getElementById("productImage");

    if (!name || !priceRaw) {
        showToast("من فضلك أدخل اسم المنتج والسعر!", false);
        return;
    }

    const priceNumber = Number(priceRaw);

    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
        showToast("من فضلك أدخل سعراً صحيحاً.", false);
        return;
    }

    try {
        const imageFile =
            imageInput && imageInput.files && imageInput.files[0]
                ? imageInput.files[0]
                : null;

        const newImage = await getImageAsDataUrl(imageFile);

        if (editingId) {
            document.getElementById("editingId").value = "";
            resetFormFields();
            showToast("تم تعديل المنتج بنجاح!");
            
            updateExistingProduct(editingId, name, priceRaw, barcode, newImage).catch(err => {
                console.error("Background update error:", err);
            });
        } else {
            const newProduct = {
                name,
                price: priceRaw,
                barcode,
                image: newImage || "",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            resetFormFields();
            showToast("تم حفظ المنتج بنجاح!");

            db.collection("products").add(newProduct).catch(err => {
                console.error("Background save error:", err);
                showToast("حدث خطأ أثناء الحفظ بالسحاب.", false);
            });
        }
    } catch (error) {
        console.error("Save product error:", error);
        showToast("حدث خطأ أثناء معالجة البيانات.", false);
    }
}

async function updateExistingProduct(id, name, price, barcode, newImage) {
    const productRef = db.collection("products").doc(id);
    const oldSnapshot = await productRef.get();

    if (!oldSnapshot.exists) {
        throw new Error("المنتج المطلوب تعديله غير موجود.");
    }

    const old = oldSnapshot.data() || {};

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
}

/* =========================================================
   9) Display / Search Products
   ========================================================= */

function displayProducts(products) {
    const list = document.getElementById("resultsList");
    if (!list) return;

    const selectAllBtn = document.getElementById("selectAllBtn");

    if (products.length === 0) {
        list.innerHTML =
            '<p style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد منتجات.</p>';

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

/* =========================================================
   10) Edit Product
   ========================================================= */

function editProduct(id) {
    const product = getProductById(id);

    if (!product) {
        showToast("المنتج غير موجود أو لم يتم تحميله بعد.", false);
        return;
    }

    document.getElementById("editingId").value = id;
    document.getElementById("productName").value = product.name || "";
    document.getElementById("productPrice").value = product.price ?? "";
    document.getElementById("productBarcode").value =
        product.barcode === "بدون باركود" ? "" : (product.barcode || "");

    const imageName = document.getElementById("imageFileName");
    if (imageName) {
        imageName.textContent = product.image
            ? "الصورة الحالية محفوظة — اختر صورة جديدة لاستبدالها."
            : "";
    }

    switchTab("add");
    showToast("تم تحميل المنتج للتعديل.");
}

/* =========================================================
   11) Confirm Modal
   ========================================================= */

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
            showToast("حدث خطأ أثناء تنفيذ العملية.", false);
        });
    }
}

/* =========================================================
   12) Delete Product
   ========================================================= */

function deleteProduct(id) {
    if (!firebaseReady || !db) {
        showToast("Firebase غير متصل.", false);
        return;
    }

    showConfirm(
        "هل أنت متأكد من حذف هذا المنتج؟ سيتم إزالته نهائياً.",
        async () => {
            try {
                await db.collection("products").doc(id).delete();

                // حذف سجل تغييرات السعر المرتبط بالمنتج أيضاً.
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

                showToast("تم الحذف بنجاح!", false);
            } catch (error) {
                console.error("Delete product error:", error);
                showToast("تعذر حذف المنتج. راجع Firestore Rules.", false);
            }
        }
    );
}

/* =========================================================
   13) Select / Delete Multiple
   ========================================================= */

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

    if (deleteBtn) {
        deleteBtn.style.display = checked.length > 0 ? "block" : "none";
    }

    if (selectBtn) {
        if (total.length > 2) {
            selectBtn.style.display = "block";
            selectBtn.textContent =
                checked.length === total.length
                    ? "إلغاء الكل"
                    : "تحديد الكل";
        } else {
            selectBtn.style.display = "none";
        }
    }
}

async function deleteSelectedProducts() {
    if (!firebaseReady || !db) {
        showToast("Firebase غير متصل.", false);
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
                // Firestore batch يدعم حتى 500 عملية.
                if (checked.length > 500) {
                    showToast("لا يمكن حذف أكثر من 500 منتج في العملية الواحدة.", false);
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

                showToast("تم حذف المنتجات المحددة بنجاح!", false);
            } catch (error) {
                console.error("Bulk delete error:", error);
                showToast("تعذر حذف المنتجات المحددة.", false);
            }
        }
    );
}

/* =========================================================
   14) Product Modal
   ========================================================= */

function openProductModal(id) {
    const product = getProductById(id);

    if (!product) {
        showToast("المنتج غير موجود.", false);
        return;
    }

    const image = document.getElementById("modalImg");
    const name = document.getElementById("modalName");
    const price = document.getElementById("modalPrice");
    const barcode = document.getElementById("modalBarcode");
    const modal = document.getElementById("productModal");

    if (image) {
        image.src =
            product.image ||
            "https://via.placeholder.com/130?text=No+Img";

        image.onerror = () => {
            image.src = "https://via.placeholder.com/130?text=No+Img";
        };
    }

    if (name) name.textContent = product.name || "بدون اسم";
    if (price) price.textContent = `${product.price ?? 0} جنيه`;
    if (barcode) {
        barcode.textContent =
            "الباركود: " + (product.barcode || "بدون باركود");
    }

    if (modal) modal.style.display = "flex";
}

function openUpdateModal(docId) {
    const update = getUpdateById(docId);

    if (!update) {
        showToast("سجل تعديل السعر غير موجود.", false);
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

/* =========================================================
   15) Price Updates
   ========================================================= */

function displayPriceUpdates(updates) {
    const list = document.getElementById("updatesList");
    if (!list) return;

    if (updates.length === 0) {
        list.innerHTML =
            '<p style="color:var(--text-muted);padding:20px;text-align:center;">لا توجد تعديلات على الأسعار حتى الآن.</p>';
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
                    <p style="margin:0;font-size:14px;">
                        السابق:
                        <span style="text-decoration:line-through;color:#ef4444;">
                            ${oldPrice} ج.م
                        </span>
                        ⬅️ الجديد:
                        <strong style="color:#10b981;">
                            ${price} ج.م
                        </strong>
                    </p>
                </div>

                <div class="actions-group" onclick="event.stopPropagation()">
                    <button
                        type="button"
                        class="btn-delete"
                        onclick="deleteSingleUpdate('${id}')">
                        حذف
                    </button>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function deleteSingleUpdate(docId) {
    if (!firebaseReady || !db) {
        showToast("Firebase غير متصل.", false);
        return;
    }

    showConfirm(
        "هل أنت متأكد من حذف هذا السجل؟",
        async () => {
            try {
                await db.collection("price_updates_list").doc(docId).delete();
                showToast("تم حذف سجل التعديل بنجاح!", false);
            } catch (error) {
                console.error("Delete update error:", error);
                showToast("تعذر حذف سجل التعديل.", false);
            }
        }
    );
}

/* =========================================================
   16) Image Picker
   ========================================================= */

function updateImageFileName(input) {
    if (!input || !input.files || !input.files[0]) return;

    const file = input.files[0];
    const fileNameElement = document.getElementById("imageFileName");

    if (fileNameElement) {
        fileNameElement.textContent = "تم اختيار الصورة: " + file.name;
    }

    showToast("تم اختيار الصورة بنجاح!");
}

/* =========================================================
   17) Barcode / QR Scanner
   ========================================================= */

async function toggleScanner(elementId, inputTargetId, isSearch = false) {
    const viewport = document.getElementById(elementId);

    if (!viewport) return;

    if (typeof Html5Qrcode === "undefined") {
        showToast("مكتبة قراءة الباركود لم يتم تحميلها.", false);
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

        await activeScanner.start(
            { facingMode: "environment" },
            config,
            async decodedText => {
                const targetInput = document.getElementById(inputTargetId);

                if (targetInput) {
                    targetInput.value = decodedText;
                }

                if (isSearch) {
                    searchProducts();
                }

                showToast("تم قراءة الرمز بنجاح!");
                await stopCurrentScanner();
            },
            () => {
            }
        );
    } catch (error) {
        console.error("Scanner start error:", error);

        showToast(
            "تعذر تشغيل الكاميرا، تأكد من HTTPS ومنح صلاحية الكاميرا.",
            false
        );

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

    if (reader) reader.style.display = "none";
    if (searchReader) searchReader.style.display = "none";
    void activeElementId;
}

/* =========================================================
   18) Startup
   ========================================================= */

window.addEventListener("DOMContentLoaded", () => {
    try {
        if (localStorage.getItem("theme") === "dark") {
            document.body.classList.add("dark-mode");

            const themeBtn = document.getElementById("themeToggleBtn");
            if (themeBtn) themeBtn.textContent = "☀️";
        }
    } catch (error) {
        console.warn("Theme storage unavailable:", error);
    }

    const confirmYesBtn = document.getElementById("confirmYesBtn");

    if (confirmYesBtn) {
        confirmYesBtn.addEventListener("click", runConfirmCallback);
    }
    // Firebase
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
                    <span style="color: var(--text-main); font-weight: 500;">${escapeHtml(product.name)}</span>
                    <span style="color: #dc2626; font-weight: bold;">${escapeHtml(product.price)} جنيه</span>
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

function clearPosInvoice() {
    posCart = [];
    renderPosTable();
    showToast("تم تفريغ الفاتورة بنجاح");
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

function renderPosTable() {
    const tbody = document.getElementById("posTableBody");
    const countSpan = document.getElementById("posItemCount");
    const grandTotalSpan = document.getElementById("posGrandTotal");

    if (!tbody) return;

    tbody.innerHTML = "";
    let grandTotal = 0;

    if (countSpan) {
        countSpan.textContent = posCart.length;
    }

    posCart.call ? null : null;

    posCart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        grandTotal += itemTotal;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td style="padding: 10px; border: 1px solid var(--border-color);">${index + 1}</td>
            <td style="padding: 10px; border: 1px solid var(--border-color); text-align: right;">${escapeHtml(item.name)}</td>
            <td style="padding: 10px; border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button type="button" onclick="updatePosQty('${item.id}', -1)" style="padding: 2px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">-</button>
                    <span style="font-weight: bold; min-width: 20px;">${item.quantity}</span>
                    <button type="button" onclick="updatePosQty('${item.id}', 1)" style="padding: 2px 8px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer;">+</button>
                </div>
            </td>
            <td style="padding: 10px; border: 1px solid var(--border-color);">${item.price.toFixed(2)}</td>
            <td style="padding: 10px; border: 1px solid var(--border-color); font-weight: bold;">${itemTotal.toFixed(2)}</td>
            <td style="padding: 10px; border: 1px solid var(--border-color);">
                <button type="button" onclick="removePosItem('${item.id}')" style="background: #dc2626; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer;">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    if (grandTotalSpan) {
        grandTotalSpan.textContent = grandTotal.toFixed(2);
    }
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

function printPosInvoice() {
    if (posCart.length === 0) {
        showToast("الفاتورة فارغة!", false);
        return;
    }
    window.print();
}