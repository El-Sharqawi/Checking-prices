// دالة الصوت الموحدة (نغمة لقط الباركود الناجحة)
function playBeep(type = 'success') {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'success') {
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } else {
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        }
    } catch (e) {}
}

// تبديل الثيم المظلم والفاتح
window.toggleTheme = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
};

// استرجاع الثيم عند التحميل
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.textContent = '☀️';
    }
    loadProducts();
});

// اختصارات لوحة المفاتيح
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('addSection').classList.contains('active')) {
        const activeElem = document.activeElement;
        if (activeElem.tagName === 'INPUT' && activeElem.type !== 'file') {
            saveProduct();
        }
    }
    if (e.key === 'Escape') {
        try {
            Quagga.stop();
            document.getElementById('interactive').style.display = 'none';
            document.getElementById('searchInteractive').style.display = 'none';
        } catch(err) {}
        closeProductModal();
        closeConfirmModal();
    }
});

// تحديث الإحصائيات (إجمالي المنتجات وأعلى سعر والمنتجات المعروضة)
function updateStats(products) {
    const totalCount = products.length;
    let maxPrice = 0;
    let totalPrice = 0;

    products.forEach(p => {
        const price = parseFloat(p.price) || 0;
        totalPrice += price;
        if (price > maxPrice) maxPrice = price;
    });

    const statTotal = document.getElementById('statTotal');
    const statMax = document.getElementById('statMax');
    const statCounter = document.getElementById('statCounter');

    if (statTotal) statTotal.textContent = totalCount;
    if (statMax) statMax.textContent = maxPrice + ' ج.م';
    if (statCounter) statCounter.textContent = totalCount;
}

// دالة عرض رسالة الـ Toast
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isSuccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f43f5e, #e11d48)';
    toast.className = "show";
    
    playBeep('success');

    setTimeout(() => {
        toast.className = toast.className.replace("show", "");
    }, 3000);
}

// التبديل بين التبويبات الثلاثة
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-content').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });

    if (tabName === 'add') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        const addSec = document.getElementById('addSection');
        addSec.classList.add('active');
        addSec.style.display = 'block';
    } else if (tabName === 'search') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        const searchSec = document.getElementById('searchSection');
        searchSec.classList.add('active');
        searchSec.style.display = 'block';
        loadProducts();
    } else if (tabName === 'updates') {
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        const updatesSec = document.getElementById('updatesSection');
        updatesSec.classList.add('active');
        updatesSec.style.display = 'block';
        loadPriceUpdates();
    }
};

function getProductsFromStorage() {
    return JSON.parse(localStorage.getItem('smart_products') || '[]');
}

function saveProductsToStorage(products) {
    localStorage.setItem('smart_products', JSON.stringify(products));
    updateStats(products);
}

// حفظ أو تعديل منتج (مع تسجيل السعر الجديد في السجل التراكمي)
window.saveProduct = function() {
    const id = document.getElementById('editingId').value;
    const name = document.getElementById('productName').value.trim();
    const price = document.getElementById('productPrice').value.trim();
    const barcode = document.getElementById('productBarcode').value.trim();
    const imageInput = document.getElementById('productImage');

    if (!name || !price) {
        showToast('من فضلك ادخل اسم المنتج والسعر!', false);
        return;
    }

    let products = getProductsFromStorage();

    const proceedSave = (imageUrl) => {
        if (id) {
            const oldProduct = products.find(item => item.id == id);
            const isPriceChanged = oldProduct && parseFloat(oldProduct.price) !== parseFloat(price);

            products = products.map(p => {
                if (p.id == id) {
                    return { 
                        id: Number(id), 
                        name, 
                        price, 
                        barcode: barcode || 'بدون باركود', 
                        image: imageUrl || p.image || '' 
                    };
                }
                return p;
            });

            // إضافة التعديل لسجل الأسعار الجديدة بشكل تراكمي
            if (isPriceChanged) {
                let priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
                const newUpdate = {
                    updateId: Date.now() + Math.random(),
                    productId: Number(id),
                    name: name,
                    image: imageUrl || oldProduct.image || '',
                    oldPrice: oldProduct.price,
                    price: price,
                    barcode: barcode || oldProduct.barcode || 'بدون باركود',
                    time: new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})
                };
                priceUpdates.unshift(newUpdate);
                localStorage.setItem('price_updates_list', JSON.stringify(priceUpdates));
            }

            document.getElementById('editingId').value = '';
            showToast('تم تعديل المنتج بنجاح!');
        } else {
            const newProduct = {
                id: Date.now(),
                name,
                price,
                barcode: barcode || 'بدون باركود',
                image: imageUrl || ''
            };
            products.push(newProduct);
            showToast('تم حفظ المنتج بنجاح!');
        }

        document.getElementById('productName').value = '';
        document.getElementById('productPrice').value = '';
        document.getElementById('productBarcode').value = '';
        document.getElementById('productImage').value = '';
        
        const imageFileName = document.getElementById('imageFileName');
        if (imageFileName) imageFileName.textContent = '';
        
        saveProductsToStorage(products);
        loadProducts();
    };

    if (imageInput.files && imageInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            proceedSave(e.target.result);
        };
        reader.readAsDataURL(imageInput.files[0]);
    } else {
        proceedSave(null);
    }
};

window.loadProducts = function() {
    const products = getProductsFromStorage();
    updateStats(products);
    displayProducts(products);
};

// عرض المنتجات بتصميم منسق (صورة، اسم، سعر واضح ملون، باركود)
function displayProducts(products) {
    const resultsList = document.getElementById('resultsList');
    const selectAllBtn = document.getElementById('selectAllBtn');
    
    if (selectAllBtn) {
        selectAllBtn.style.display = products.length > 0 ? 'block' : 'none';
    }

    if (!resultsList) return;

    if (products.length === 0) {
        resultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد منتجات مطابقة.</p>';
        toggleDeleteSelectedBtn();
        return;
    }

    let html = '';
    products.forEach(p => {
        const imgSrc = p.image ? p.image : 'https://via.placeholder.com/60?text=No+Img';
        html += `
            <div class="product-card" onclick="openProductModal(${p.id}, event)">
                <input type="checkbox" class="product-checkbox" data-id="${p.id}" onclick="event.stopPropagation()" onchange="toggleDeleteSelectedBtn()">
                <img src="${imgSrc}" class="product-thumb" alt="صورة">
                <div class="product-info">
                    <h4>${p.name}</h4>
                    <p class="product-price-txt">السعر: <strong>${p.price} ج.م</strong></p>
                    <p class="product-barcode-txt">الباركود: ${p.barcode}</p>
                </div>
                <div class="actions-group" onclick="event.stopPropagation()">
                    <button class="btn-edit" onclick="editProduct(${p.id})">تعديل</button>
                    <button class="btn-delete" onclick="deleteProduct(${p.id})">حذف</button>
                </div>
            </div>
        `;
    });
    resultsList.innerHTML = html;
    toggleDeleteSelectedBtn();
}

// البحث الشامل
window.searchProducts = function() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    const query = searchInput.value.toLowerCase();
    const products = getProductsFromStorage();
    
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.price.toString().includes(query) || 
        p.barcode.toLowerCase().includes(query)
    );

    displayProducts(filtered);
};

// تعديل منتج
window.editProduct = function(id) {
    const products = getProductsFromStorage();
    const p = products.find(item => item.id == id);
    if (!p) return;

    document.getElementById('editingId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productBarcode').value = p.barcode;

    switchTab('add');
    showToast('جاري وضع التعديل للمنتج...');
};

// نافذة التأكيد المركزية (Modal) بدلاً من الـ alert
let deleteActionCallback = null;

function showConfirmModal(message, callback) {
    const msgElem = document.getElementById('confirmMessage');
    if (msgElem) msgElem.innerText = message;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'flex';
    deleteActionCallback = callback;
}

window.closeConfirmModal = function() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'none';
    deleteActionCallback = null;
};

document.addEventListener('DOMContentLoaded', () => {
    const yesBtn = document.getElementById('confirmYesBtn');
    if (yesBtn) {
        yesBtn.onclick = function() {
            if (deleteActionCallback) deleteActionCallback();
            closeConfirmModal();
        };
    }
});

// حذف منتج واحد مع تحديث سجل الأسعار الجديدة
window.deleteProduct = function(id) {
    showConfirmModal("هل أنت متأكد من حذف هذا المنتج؟ سيتم إزالته نهائياً من القائمة والأسعار الجديدة.", function() {
        let products = getProductsFromStorage();
        products = products.filter(p => p.id != id);
        saveProductsToStorage(products);

        // إزالة المرتبط به من سجل الأسعار الجديدة
        let priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
        priceUpdates = priceUpdates.filter(u => u.productId !== Number(id));
        localStorage.setItem('price_updates_list', JSON.stringify(priceUpdates));

        loadProducts();
        loadPriceUpdates();
        showToast("تم الحذف بنجاح!", false);
    });
};

// زر تحديد الكل / إلغاء الكل
window.toggleSelectAll = function() {
    const checkboxes = document.querySelectorAll('.product-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    toggleDeleteSelectedBtn();
};

window.toggleDeleteSelectedBtn = function() {
    const checkedBoxes = document.querySelectorAll('.product-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const totalBoxes = document.querySelectorAll('.product-checkbox');

    if (!deleteBtn || !selectAllBtn) return;

    if (checkedBoxes.length > 0) {
        deleteBtn.style.display = 'block';
    } else {
        deleteBtn.style.display = 'none';
    }

    if (checkedBoxes.length === totalBoxes.length && totalBoxes.length > 0) {
        selectAllBtn.textContent = 'إلغاء الكل';
    } else {
        selectAllBtn.textContent = 'تحديد الكل';
    }
};

// حذف العناصر المحددة
window.deleteSelectedProducts = function() {
    const checkedBoxes = document.querySelectorAll('.product-checkbox:checked');
    if (checkedBoxes.length === 0) return;

    showConfirmModal(`هل أنت متأكد من حذف الـ ${checkedBoxes.length} منتجات المحددة؟`, function() {
        let idsToDelete = Array.from(checkedBoxes).map(cb => Number(cb.getAttribute('data-id')));
        let products = getProductsFromStorage();
        products = products.filter(p => !idsToDelete.includes(Number(p.id)));

        saveProductsToStorage(products);

        let priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
        priceUpdates = priceUpdates.filter(u => !idsToDelete.includes(Number(u.productId)));
        localStorage.setItem('price_updates_list', JSON.stringify(priceUpdates));

        loadProducts();
        loadPriceUpdates();
        showToast("تم حذف المنتجات المحددة بنجاح!", false);
    });
};

// نافذة Modal عرض تفاصيل المنتج في الاستعلام الشامل
window.openProductModal = function(id, event) {
    const products = getProductsFromStorage();
    const p = products.find(item => item.id == id);
    if (!p) return;

    document.getElementById('modalImg').src = p.image ? p.image : 'https://via.placeholder.com/130?text=No+Img';
    document.getElementById('modalName').textContent = p.name;
    document.getElementById('modalPrice').textContent = p.price + ' جنيه';
    document.getElementById('modalBarcode').textContent = 'الباركود: ' + p.barcode;

    document.getElementById('productModal').style.display = 'flex';
};

window.closeProductModal = function() {
    document.getElementById('productModal').style.display = 'none';
};

// نافذة Modal خاصة بسجل الأسعار الجديدة (تعرض السعر القديم مشطوب والجديد بلون عريض)
window.openUpdateModal = function(updateId) {
    const priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
    const update = priceUpdates.find(u => u.updateId == updateId);
    if (!update) return;

    document.getElementById('modalImg').src = update.image ? update.image : 'https://via.placeholder.com/130?text=No+Img';
    document.getElementById('modalName').textContent = update.name;
    
    // تصميم السعر القديم والجديد داخل الـ Modal
    document.getElementById('modalPrice').innerHTML = `
        <span style="text-decoration: line-through; color: #ef4444; font-size: 16px; margin-left: 10px;">${update.oldPrice} ج.م</span>
        <span style="color: #10b981; font-weight: 900; font-size: 22px;">${update.price} ج.م</span>
    `;
    document.getElementById('modalBarcode').textContent = 'الباركود: ' + update.barcode;

    document.getElementById('productModal').style.display = 'flex';
};

window.addEventListener('click', (e) => {
    const modal = document.getElementById('productModal');
    const confirmModal = document.getElementById('confirmModal');
    if (e.target === modal) closeProductModal();
    if (e.target === confirmModal) closeConfirmModal();
});

// تشغيل كاميرا الباركود للإضافة
let scannerActive = false;
window.toggleScanner = function() {
    const viewport = document.getElementById('interactive');
    if (!viewport) return;
    if (scannerActive) {
        Quagga.stop();
        viewport.style.display = 'none';
        scannerActive = false;
        return;
    }

    viewport.style.display = 'block';
    scannerActive = true;
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: viewport },
        decoder: { readers: ["code_128_reader", "ean_reader", "qr_reader"] }
    }, function(err) {
        if (err) return;
        Quagga.start();
    });

    Quagga.onDetected(function(result) {
        const code = result.codeResult.code;
        document.getElementById('productBarcode').value = code;
        Quagga.stop();
        viewport.style.display = 'none';
        scannerActive = false;
        showToast('تم قراءة الرمز بنجاح!');
    });
};

// كاميرا البحث
let searchScannerActive = false;
window.toggleSearchScanner = function() {
    const viewport = document.getElementById('searchInteractive');
    if (!viewport) return;
    if (searchScannerActive) {
        Quagga.stop();
        viewport.style.display = 'none';
        searchScannerActive = false;
        return;
    }

    viewport.style.display = 'block';
    searchScannerActive = true;
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: viewport },
        decoder: { readers: ["code_128_reader", "ean_reader"] }
    }, function(err) {
        if (err) return;
        Quagga.start();
    });

    Quagga.onDetected(function(result) {
        const code = result.codeResult.code;
        document.getElementById('searchInput').value = code;
        searchProducts();
        Quagga.stop();
        viewport.style.display = 'none';
        searchScannerActive = false;
        showToast('تم العثور على الباركود في البحث!');
    });
};

// تحديث اسم الصورة المختارة
window.updateImageFileName = function(input) {
    const fileNameDiv = document.getElementById('imageFileName');
    if (input.files && input.files[0]) {
        fileNameDiv.textContent = "تم اختيار الصورة: " + input.files[0].name;
        showToast('تم اختيار الصورة بنجاح!');
    } else {
        fileNameDiv.textContent = '';
    }
};

// عرض سجل الأسعار الجديدة التراكمي مع تشيك بوكس وزر حذف خاص بكل عنصر
window.loadPriceUpdates = function() {
    const updatesList = document.getElementById('updatesList');
    if (!updatesList) return;

    const priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
    
    if (priceUpdates.length === 0) {
        updatesList.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">لا توجد تعديلات سريعة على الأسعار حتى الآن.</p>';
        return;
    }

    let html = '';
    priceUpdates.forEach(update => {
        const imgSrc = update.image ? update.image : 'https://via.placeholder.com/50?text=No+Img';
        html += `
            <div class="product-card" onclick="openUpdateModal(${update.updateId})">
                <input type="checkbox" class="update-checkbox" data-update-id="${update.updateId}" onclick="event.stopPropagation()">
                <img src="${imgSrc}" class="product-thumb" alt="صورة">
                <div class="product-info">
                    <h4>${update.name}</h4>
                    <p>
                        السعر السابق: <span style="text-decoration: line-through; color: #ef4444;">${update.oldPrice} ج.م</span> 
                        <span style="margin: 0 6px;">⬅️</span>
                        السعر الجديد: <strong style="color: #10b981; font-size: 15px;">${update.price} ج.م</strong>
                    </p>
                </div>
                <div class="actions-group" onclick="event.stopPropagation()">
                    <button class="btn-delete" onclick="deleteSinglePriceUpdate(${update.updateId})">حذف</button>
                </div>
            </div>
        `;
    });
    updatesList.innerHTML = html;
};

// حذف عنصر واحد من سجل الأسعار الجديدة
window.deleteSinglePriceUpdate = function(updateId) {
    showConfirmModal("هل أنت متأكد من حذف هذا السجل من الأسعار الجديدة؟", function() {
        let priceUpdates = JSON.parse(localStorage.getItem('price_updates_list') || '[]');
        priceUpdates = priceUpdates.filter(u => u.updateId !== Number(updateId));
        localStorage.setItem('price_updates_list', JSON.stringify(priceUpdates));
        loadPriceUpdates();
        showToast("تم الحذف بنجاح!", false);
    });
};