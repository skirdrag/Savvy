document.addEventListener('DOMContentLoaded', () => {
    // --- Riferimenti DOM ---
    const wishlistItemsContainer = document.getElementById('wishlistItems');
    // ... (tutti gli altri riferimenti DOM rimangono invariati)
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const totalPriceEl = document.getElementById('totalPrice');
    const totalSavedMoneyEl = document.getElementById('totalSavedMoney');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const historyToggleBtn = document.getElementById('historyToggleBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    const historyItemsGrid = document.getElementById('historyItemsGrid');
    const notificationIndicator = document.getElementById('notificationIndicator');
    const toastContainer = document.getElementById('toastContainer');
    const htmlEl = document.documentElement;
    const wishlistItemTemplate = document.getElementById('wishlistItemTemplate');
    const historyItemTemplate = document.getElementById('historyItemTemplate');
    const originalPlaceholder = searchInput.placeholder;

    // --- Stato Applicazione ---
    let wishlist = [];
    let history = [];
    let newHistoryItems = false;

    // --- Funzioni Tema ---
    const applyTheme = (theme) => htmlEl.classList.toggle('light-theme', theme === 'light');
    const toggleTheme = () => {
        const newTheme = htmlEl.classList.contains('light-theme') ? 'dark' : 'light';
        applyTheme(newTheme);
        window.pywebview.api.save_settings({ theme: newTheme });
    };

    // --- Funzioni Dati (Wishlist e Storico) ---
    const saveWishlist = async () => fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wishlist) });
    const saveHistory = async () => fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(history) });

    // --- Funzioni di Rendering ---
    const renderWishlist = () => {
        wishlistItemsContainer.innerHTML = '';
        if (wishlist.length === 0) {
            wishlistItemsContainer.innerHTML = `<div class="item-placeholder"><p>La tua wishlist è vuota.</p><p>Incolla un link Amazon per iniziare.</p></div>`;
        } else {
            wishlist.forEach(item => {
                const node = wishlistItemTemplate.content.cloneNode(true);
                const el = node.querySelector('.wishlist-item');
                el.dataset.id = item.id;
                // ... (popolamento dati invariato)
                el.querySelector('.product-image').src = item.image || 'https://placehold.co/100x100/e2e8f0/e2e8f0?text=...';
                el.querySelector('.product-title').textContent = item.title;
                el.querySelector('.product-price').textContent = `€${item.price.toFixed(2)}`;
                el.querySelector('.product-link').href = item.link;
                el.querySelector('.saved-money-amount').textContent = item.savedMoney.toFixed(2);
                wishlistItemsContainer.appendChild(node);
            });
        }
        updateTotals();
    };
    // ... (renderHistory e updateTotals invariati)
    const renderHistory = () => {
        historyItemsGrid.innerHTML = '';
        if (history.length === 0) {
            historyItemsGrid.innerHTML = `<p class="item-placeholder" style="border: none;">Lo storico è vuoto.</p>`;
        } else {
            [...history].reverse().forEach(item => {
                const node = historyItemTemplate.content.cloneNode(true);
                const el = node.querySelector('.history-item');
                el.dataset.id = item.id;
                el.querySelector('.product-image').src = item.image;
                el.querySelector('.product-title').textContent = item.title;
                el.querySelector('.product-price').textContent = `Acquistato a €${item.price.toFixed(2)}`;
                historyItemsGrid.appendChild(node);
            });
        }
    };
    const updateTotals = () => {
        const totalWishlistPrice = wishlist.reduce((sum, item) => sum + item.price, 0);
        const totalSaved = wishlist.reduce((sum, item) => sum + item.savedMoney, 0);
        totalPriceEl.textContent = `€${totalWishlistPrice.toFixed(2)}`;
        totalSavedMoneyEl.textContent = `€${totalSaved.toFixed(2)}`;
    };

    // --- Logica Obiettivi e Notifiche (invariata) ---
    const showToast = (item) => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">🎉</span>
            <span class="toast-message">Obiettivo raggiunto per: <strong>${item.title}</strong>!</span>
            <button class="toast-close-btn">&times;</button>
        `;
        toastContainer.appendChild(toast);
        toast.querySelector('.toast-close-btn').addEventListener('click', () => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        });
        setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }, 5000);
    };
    const checkGoals = async () => {
        const completedItems = wishlist.filter(item => item.savedMoney >= item.price);
        if (completedItems.length === 0) return;
        completedItems.forEach(item => {
            showToast(item);
            history.push(item);
        });
        wishlist = wishlist.filter(item => item.savedMoney < item.price);
        newHistoryItems = true;
        notificationIndicator.classList.remove('hidden');
        renderWishlist();
        await Promise.all([saveWishlist(), saveHistory()]);
    };

    // --- Inizializzazione (invariata) ---
    const initializeApp = async () => {
        try {
            const [settingsRes, wishlistRes, historyRes] = await Promise.all([
                fetch('/api/settings'), fetch('/api/wishlist'), fetch('/api/history')
            ]);
            if (settingsRes.ok) applyTheme((await settingsRes.json()).theme);
            if (wishlistRes.ok) wishlist = await wishlistRes.json();
            if (historyRes.ok) history = await historyRes.json();
            renderWishlist();
        } catch (error) {
            console.error("Errore inizializzazione:", error);
            applyTheme('dark');
        }
    };

    // --- Funzione di Ricerca (invariata) ---
    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        searchButton.textContent = '...'; searchButton.disabled = true;
        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Errore');
            wishlist.push({ id: `item-${Date.now()}`, ...data, savedMoney: 0.0 });
            renderWishlist();
            await saveWishlist();
            searchInput.value = '';
        } catch (error) {
            showSearchError(error.message);
        } finally {
            searchButton.textContent = 'Aggiungi'; searchButton.disabled = false;
        }
    };
    const showSearchError = (message) => {
        searchInput.value = ''; searchInput.placeholder = message; searchInput.classList.add('error');
        setTimeout(() => { searchInput.placeholder = originalPlaceholder; searchInput.classList.remove('error'); }, 3000);
    };

    // --- Event Listeners (principali invariati) ---
    themeToggleBtn.addEventListener('click', toggleTheme);
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSearch());
    historyToggleBtn.addEventListener('click', () => {
        renderHistory();
        historyModal.classList.remove('hidden');
        newHistoryItems = false;
        notificationIndicator.classList.add('hidden');
    });
    closeHistoryModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    historyModal.addEventListener('click', (e) => e.target === historyModal && historyModal.classList.add('hidden'));
    historyItemsGrid.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-history-btn')) {
            const itemEl = e.target.closest('.history-item');
            const itemId = itemEl.dataset.id;
            history = history.filter(item => item.id !== itemId);
            renderHistory();
            await saveHistory();
        }
    });
    wishlistItemsContainer.addEventListener('click', async (e) => {
        const itemElement = e.target.closest('.wishlist-item');
        if (!itemElement) return;
        const itemId = itemElement.dataset.id;
        const item = wishlist.find(i => i.id === itemId);
        if (!item) return;
        if (e.target.classList.contains('remove-item-btn')) {
            wishlist = wishlist.filter(i => i.id !== itemId);
            itemElement.classList.add('removing');
            itemElement.addEventListener('animationend', () => {
                renderWishlist();
                saveWishlist();
            });
        }
    });
    wishlistItemsContainer.addEventListener('focusout', async (e) => {
        if (e.target.classList.contains('saved-money-amount')) {
            const itemElement = e.target.closest('.wishlist-item');
            const item = wishlist.find(i => i.id === itemElement.dataset.id);
            let newAmount = parseFloat(e.target.textContent.replace(',', '.'));
            if (isNaN(newAmount) || newAmount < 0) newAmount = item.savedMoney;
            item.savedMoney = newAmount;
            e.target.textContent = newAmount.toFixed(2);
            updateTotals();
            await saveWishlist();
            checkGoals();
        }
    });

    // --- NUOVA: Logica per il Drag and Drop ---
    let draggedElement = null;

    wishlistItemsContainer.addEventListener('mousedown', (e) => {
        // Avvia il trascinamento solo se non si sta interagendo con un pulsante o un campo di testo
        if (e.target.closest('button, a, [contenteditable]')) {
            return;
        }
        
        const targetItem = e.target.closest('.wishlist-item');
        if (!targetItem) return;

        draggedElement = targetItem;
        draggedElement.classList.add('dragging');

        const placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        placeholder.style.height = `${draggedElement.offsetHeight}px`;
        draggedElement.insertAdjacentElement('beforebegin', placeholder);
        draggedElement.style.position = 'absolute'; // Rimuove l'elemento dal flusso per il posizionamento
        draggedElement.style.width = `${draggedElement.offsetWidth}px`;
    });

    wishlistItemsContainer.addEventListener('mousemove', (e) => {
        if (!draggedElement) return;

        // Posiziona l'elemento trascinato seguendo il mouse
        const containerRect = wishlistItemsContainer.getBoundingClientRect();
        draggedElement.style.top = `${e.clientY - containerRect.top - (draggedElement.offsetHeight / 2)}px`;

        const placeholder = wishlistItemsContainer.querySelector('.drag-placeholder');
        const otherItems = [...wishlistItemsContainer.querySelectorAll('.wishlist-item:not(.dragging)')];

        const afterElement = otherItems.find(item => e.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2);
        
        if (afterElement) {
            wishlistItemsContainer.insertBefore(placeholder, afterElement);
        } else {
            wishlistItemsContainer.appendChild(placeholder);
        }
    });

    document.addEventListener('mouseup', async () => {
        if (!draggedElement) return;
        
        const placeholder = wishlistItemsContainer.querySelector('.drag-placeholder');
        if (placeholder) {
            placeholder.replaceWith(draggedElement);
        }
        
        draggedElement.classList.remove('dragging');
        draggedElement.style.position = '';
        draggedElement.style.width = '';
        draggedElement.style.top = '';
        draggedElement = null;

        // Aggiorna l'ordine nell'array di dati
        const newOrderedIds = [...wishlistItemsContainer.querySelectorAll('.wishlist-item')].map(el => el.dataset.id);
        wishlist.sort((a, b) => newOrderedIds.indexOf(a.id) - newOrderedIds.indexOf(b.id));

        await saveWishlist();
    });

    initializeApp();
});
