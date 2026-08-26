// دوال تشغيل الصوت (Beep مؤثرات صوتية حقيقية عبر Web Audio API)
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
            oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.2);
        }
    } catch (e) {}
}

// تبديل الثيم المظلم والفاتح
window.toggleTheme = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('themeToggleBtn').textContent = isDark ? '☀️' : '🌙';
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
    }
});

// تحديث الإحصائيات
function updateStats(products) {
    const totalCount = products.length;
    let maxPrice = 0;
    let totalPrice = 0;

    products.forEach(p => {
        const price = parseFloat(p.price) || 0;
        totalPrice += price;
        if (price > maxPrice) maxPrice = price;
    });

    const avgPrice = totalCount > 0 ? (totalPrice / totalCount).toFixed(1) : 0;

    document.getElementById('statTotal').textContent = totalCount;
    document.getElementById('statMax').textContent = maxPrice + ' ج.م';
    document.getElementById('statAvg').textContent = avgPrice + ' ج.م';
}

// دالة عرض رسالة الـ Toast
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isSuccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f43f5e, #e11d48)';
    toast.className = "show";
    
    if (isSuccess) playBeep('success');
    else playBeep('error');

    setTimeout(() => {
        toast.className = toast.className.replace("show", "");
    }, 3000);
}

// التبديل بين التبويبات
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active'));

    if (tabName === 'add') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('addSection').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('searchSection').classList.add('active');
        loadProducts();
    }
};

function getProductsFromStorage() {
    return JSON.parse(localStorage.getItem('smart_products') || '[]');
}

function saveProductsToStorage(products) {
    localStorage.setItem('smart_products', JSON.stringify(products));
    updateStats(products);
}

// حفظ أو تعديل منتج (مع معالجة رفع الصورة)
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
            products = products.map(p => {
                if (p.id == id) {
                    return { 
                        id, 
                        name, 
                        price, 
                        barcode: barcode || 'بدون باركود', 
                        image: imageUrl || p.image || '' 
                    };
                }
                return p;
            });
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
}

window.loadProducts = function() {
    const products = getProductsFromStorage();
    updateStats(products);
    displayProducts(products);
};

function displayProducts(products) {
    const resultsList = document.getElementById('resultsList');
    document.getElementById('productCounter').textContent = `المنتجات المعروضة: ${products.length}`;

    // إظهار أو إخفاء زر تحديد الكل بناءً على وجود منتجات
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (products.length > 0) {
        selectAllBtn.style.display = 'block';
    } else {
        selectAllBtn.style.display = 'none';
    }

    if (products.length === 0) {
        resultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد منتجات مطابقة.</p>';
        return;
    }

    let html = '';
    products.forEach(p => {
        const imgSrc = p.image ? p.image : 'https://via.placeholder.com/50?text=No+Img';
        html += `
            <div class="product-card" onclick="openProductModal(${p.id}, event)">
                <input type="checkbox" class="product-checkbox" data-id="${p.id}" onclick="event.stopPropagation()" onchange="toggleDeleteSelectedBtn()">
                <img src="${imgSrc}" class="product-thumb" alt="صورة">
                <div class="product-info">
                    <h4>${p.name}</h4>
                    <p>السعر: <strong>${p.price} ج.م</strong></p>
                    <p>الباركود: ${p.barcode}</p>
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
    const query = document.getElementById('searchInput').value.toLowerCase();
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

// حذف منتج واحد
window.deleteProduct = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    let products = getProductsFromStorage();
    products = products.filter(p => p.id != id);
    saveProductsToStorage(products);
    loadProducts();
    showToast('تم حذف المنتج بنجاح!', false);
};

// تفعيل وتحديث أزرار الحذف الجماعي والتحديد
window.toggleDeleteSelectedBtn = function() {
    const checkedBoxes = document.querySelectorAll('.product-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const totalBoxes = document.querySelectorAll('.product-checkbox');

    // إظهار زر الحذف وزر تحديد الكل فقط إذا كان عدد المحددين أكبر من 2
    if (checkedBoxes.length > 2) {
        deleteBtn.style.display = 'block';
        selectAllBtn.style.display = 'block';
    } else {
        deleteBtn.style.display = 'none';
        // إذا كنت تريد إخفاء زر تحديد الكل بناءً على الشرط الجديد:
        selectAllBtn.style.display = 'none'; 
    }

    if (checkedBoxes.length === totalBoxes.length && totalBoxes.length > 0) {
        selectAllBtn.textContent = 'إلغاء الكل';
    } else {
        selectAllBtn.textContent = 'تحديد الكل';
    }
};

// زر تحديد الكل / إلغاء الكل
window.toggleSelectAll = function() {
    const checkboxes = document.querySelectorAll('.product-checkbox');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    toggleDeleteSelectedBtn();
};

// حذف العناصر المحددة
window.deleteSelectedProducts = function() {
    const checkedBoxes = document.querySelectorAll('.product-checkbox:checked');
    if (checkedBoxes.length === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${checkedBoxes.length} منتجات المحددة؟`)) return;

    let idsToDelete = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-id'));
    let products = getProductsFromStorage();
    products = products.filter(p => !idsToDelete.includes(p.id.toString()));

    saveProductsToStorage(products);
    loadProducts();
    document.getElementById('deleteSelectedBtn').style.display = 'none';
    showToast('تم حذف المنتجات المحددة بنجاح!', false);
};

// نافذة Modal عرض المنتج عند النقر عليه
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

// إغلاق المودال عند النقر خارج المحتوى
window.addEventListener('click', (e) => {
    const modal = document.getElementById('productModal');
    if (e.target === modal) {
        closeProductModal();
    }
});

// تشغيل كاميرا الباركود (QuaggaJS)
let scannerActive = false;
window.toggleScanner = function() {
    const viewport = document.getElementById('interactive');
    if (scannerActive) {
        Quagga.stop();
        viewport.style.display = 'none';
        scannerActive = false;
        return;
    }

    viewport.style.display = 'block';
    scannerActive = true;
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: viewport
        },
        decoder: {
            readers: ["code_128_reader", "ean_reader", "qr_reader"]
        }
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
    if (searchScannerActive) {
        Quagga.stop();
        viewport.style.display = 'none';
        searchScannerActive = false;
        return;
    }

    viewport.style.display = 'block';
    searchScannerActive = true;
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: viewport
        },
        decoder: {
            readers: ["code_128_reader", "ean_reader"]
        }
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
};                                                                                                                                                                                                                                                                                                                                                    