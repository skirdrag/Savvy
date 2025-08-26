/**
 * @file Gestisce la logica del frontend per l'applicazione Savvy.
 * @description Gestisce la wishlist, la ricerca via link e il cambio tema.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Riferimenti DOM ---
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const wishlistItemsContainer = document.getElementById('wishlistItems');
    const totalPriceEl = document.getElementById('totalPrice');
    const totalSavedMoneyEl = document.getElementById('totalSavedMoney');
    const wishlistItemTemplate = document.getElementById('wishlistItemTemplate');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const htmlEl = document.documentElement;
    const originalPlaceholder = searchInput.placeholder;

    // --- Stato Applicazione ---
    let wishlist = [];

    // --- Funzioni Tema ---
    const applyTheme = (theme) => {
        if (theme === 'light') {
            htmlEl.classList.add('light-theme');
        } else {
            htmlEl.classList.remove('light-theme');
        }
    };

    const toggleTheme = () => {
        const newTheme = htmlEl.classList.contains('light-theme') ? 'dark' : 'light';
        applyTheme(newTheme);
        // Salva l'impostazione tramite l'API di Python
        window.pywebview.api.save_settings({ theme: newTheme });
    };

    // --- Funzioni Wishlist ---
    const renderWishlist = () => {
        wishlistItemsContainer.innerHTML = '';
        if (wishlist.length === 0) {
            wishlistItemsContainer.innerHTML = `<div class="item-placeholder"><p>La tua wishlist è vuota.</p><p>Incolla un link Amazon per iniziare.</p></div>`;
        } else {
            wishlist.forEach(item => {
                const node = wishlistItemTemplate.content.cloneNode(true);
                const el = node.querySelector('.wishlist-item');
                el.dataset.id = item.id;
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

    const updateTotals = () => {
        const totalWishlistPrice = wishlist.reduce((sum, item) => sum + item.price, 0);
        const totalSaved = wishlist.reduce((sum, item) => sum + item.savedMoney, 0);
        totalPriceEl.textContent = `€${totalWishlistPrice.toFixed(2)}`;
        totalSavedMoneyEl.textContent = `€${totalSaved.toFixed(2)}`;
    };

    const saveState = async () => {
        try {
            await fetch('/api/wishlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wishlist),
            });
        } catch (error) { console.error("Errore salvataggio:", error); }
    };

    // --- Inizializzazione ---
    const initializeApp = async () => {
        try {
            // Carica sia le impostazioni che la wishlist
            const [settingsRes, wishlistRes] = await Promise.all([
                fetch('/api/settings'),
                fetch('/api/wishlist')
            ]);

            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                applyTheme(settings.theme);
            }

            if (wishlistRes.ok) {
                wishlist = await wishlistRes.json();
                renderWishlist();
            }
        } catch (error) {
            console.error("Errore durante l'inizializzazione:", error);
            // Applica un tema di default in caso di errore
            applyTheme('dark');
        }
    };

    // --- Funzione di Ricerca ---
    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchButton.textContent = '...';
        searchButton.disabled = true;

        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Errore sconosciuto');

            wishlist.push({ id: `item-${Date.now()}`, ...data, savedMoney: 0.0 });
            renderWishlist();
            await saveState();
            searchInput.value = '';
        } catch (error) {
            showSearchError(error.message);
        } finally {
            searchButton.textContent = 'Aggiungi';
            searchButton.disabled = false;
        }
    };
    
    const showSearchError = (message) => {
        searchInput.value = '';
        searchInput.placeholder = message;
        searchInput.classList.add('error');
        setTimeout(() => {
            searchInput.placeholder = originalPlaceholder;
            searchInput.classList.remove('error');
        }, 3000);
    };

    // --- Event Listeners ---
    themeToggleBtn.addEventListener('click', toggleTheme);
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSearch());

    wishlistItemsContainer.addEventListener('click', async (e) => {
        const itemElement = e.target.closest('.wishlist-item');
        if (!itemElement) return;
        const itemId = itemElement.dataset.id;
        const item = wishlist.find(i => i.id === itemId);
        if (!item) return;

        if (e.target.classList.contains('remove-item-btn')) {
            wishlist = wishlist.filter(i => i.id !== itemId);
            renderWishlist();
            await saveState();
        } else if (e.target.classList.contains('money-btn')) {
            let currentSaved = item.savedMoney;
            if (e.target.classList.contains('increase-10')) currentSaved += 10;
            else if (e.target.classList.contains('increase-1')) currentSaved += 1;
            else if (e.target.classList.contains('decrease-1')) currentSaved -= 1;
            else if (e.target.classList.contains('decrease-10')) currentSaved -= 10;
            item.savedMoney = Math.max(0, currentSaved);
            renderWishlist();
            await saveState();
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
            await saveState();
        }
    });

    initializeApp();
});
