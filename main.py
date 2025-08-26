import webview
import threading
import json
import re
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from typing import Dict, Any, List

# --- Librerie per lo Scraping ---
import requests
from bs4 import BeautifulSoup

# --- Configurazione dell'Applicazione ---
APP_NAME = "Savvy"
DATA_FOLDER = Path.home() / f".{APP_NAME.lower()}"
WISHLIST_FILE = DATA_FOLDER / "wishlist.json"
SETTINGS_FILE = DATA_FOLDER / "settings.json"

DATA_FOLDER.mkdir(exist_ok=True)

# --- Server Flask ---
app = Flask(__name__, template_folder='templates', static_folder='static')

# --- Funzioni di Gestione Dati ---

def load_wishlist() -> List[Dict[str, Any]]:
    """Carica la wishlist dal file JSON."""
    if not WISHLIST_FILE.exists(): return []
    try:
        # CORRETTO: Risolto errore di battitura da WISHLIS_FILE a WISHLIST_FILE
        with open(WISHLIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def save_wishlist(data: List[Dict[str, Any]]) -> None:
    """Salva la wishlist nel file JSON."""
    with open(WISHLIST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def load_settings() -> Dict[str, Any]:
    """Carica tutte le impostazioni: finestra e tema."""
    default_settings = {"width": 950, "height": 700, "x": None, "y": None, "theme": "dark"}
    if not SETTINGS_FILE.exists(): return default_settings
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            settings = json.load(f)
            return {**default_settings, **settings}
    except (json.JSONDecodeError, FileNotFoundError):
        return default_settings

def save_settings(settings: Dict[str, Any]) -> None:
    """Salva tutte le impostazioni."""
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f)

# --- Logica di Scraping (AGGIORNATA) ---

def scrape_amazon_product_page(url: str, headers: Dict) -> Dict[str, Any]:
    """
    Esegue lo scraping di una singola pagina prodotto con una logica di ricerca del prezzo più robusta.
    """
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Il titolo viene cercato in modo specifico per evitare confusione
    title_element = soup.find(id='productTitle')
    title = title_element.get_text(strip=True) if title_element else "Titolo non trovato"

    # NUOVA LOGICA: Cerca il prezzo nell'intera pagina, non solo in una colonna
    price = 0.0
    price_container_selectors = [
        '#corePrice_feature_div',
        '#price_inside_buybox',
        '#desktop_buybox',
        '#tmmSwatches',
        '.a-section .a-price' # Selettore generico di backup
    ]

    price_container = None
    for selector in price_container_selectors:
        # Cerca nell'intero documento 'soup', non in 'center_col'
        container = soup.select_one(selector)
        if container and container.select_one('.a-price-whole'):
            price_container = container
            break

    if price_container:
        price_whole = price_container.select_one('.a-price-whole')
        price_fraction = price_container.select_one('.a-price-fraction')
        if price_whole and price_fraction:
            price_str = f"{price_whole.get_text(strip=True).replace('.', '')}{price_fraction.get_text(strip=True)}"
            price_str = re.sub(r'[^\d,]', '', price_str).replace(',', '.')
            price = float(price_str)

    image_element = soup.find(id='landingImage')
    image_url = image_element['src'] if image_element else ""

    return {"title": title, "price": price, "link": url, "image": image_url}

# --- API Endpoints ---

@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(load_settings())

@app.route('/api/wishlist', methods=['GET', 'POST'])
def handle_wishlist():
    if request.method == 'GET': return jsonify(load_wishlist())
    if request.method == 'POST':
        save_wishlist(request.json)
        return jsonify({"status": "success"}), 200

@app.route('/api/search')
def search_product():
    query_url = request.args.get('query', '')
    if not (query_url.startswith('http') and "amazon." in query_url):
        return jsonify({"error": "Per favore, inserisci un link Amazon valido."}), 400

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    try:
        product_data = scrape_amazon_product_page(query_url, headers)
        if product_data["price"] == 0.0:
             return jsonify({"error": "Prezzo non trovato. Prodotto non disponibile?"}), 404
        return jsonify(product_data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except requests.RequestException:
        return jsonify({"error": "Errore di rete. Controlla la connessione."}), 503
    except Exception as e:
        print(f"Errore scraping: {e}")
        return jsonify({"error": "Impossibile recuperare i dati."}), 500

# --- Gestione Finestra WebView ---

class Api:
    def save_settings(self, settings_dict):
        current_settings = load_settings()
        current_settings.update(settings_dict)
        save_settings(current_settings)

def run_server():
    app.run(host='0.0.0.0', port=5959)

if __name__ == '__main__':
    settings = load_settings()
    api = Api()
    
    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()

    window = webview.create_window(
        APP_NAME,
        'http://127.0.0.1:5959',
        width=settings['width'],
        height=settings['height'],
        x=settings['x'],
        y=settings['y'],
        resizable=True,
        min_size=(700, 500),
        js_api=api
    )
    
    def on_window_change():
        """Salva lo stato corrente della finestra senza dipendere dagli argomenti degli eventi."""
        current_settings = load_settings()
        current_settings.update({
            'width': window.width, 'height': window.height,
            'x': window.x, 'y': window.y
        })
        save_settings(current_settings)

    # Usa delle lambda per chiamare la funzione, rendendo il codice più robusto
    window.events.resized += lambda w, h: on_window_change()
    window.events.moved += lambda x, y: on_window_change()

    webview.start()
