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
HISTORY_FILE = DATA_FOLDER / "history.json" # NUOVO: File per lo storico
SETTINGS_FILE = DATA_FOLDER / "settings.json"

DATA_FOLDER.mkdir(exist_ok=True)

# --- Server Flask ---
app = Flask(__name__, template_folder='templates', static_folder='static')

# --- Funzioni di Gestione Dati ---

def load_data(file_path: Path) -> List[Dict[str, Any]]:
    """Funzione generica per caricare dati da un file JSON."""
    if not file_path.exists(): return []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def save_data(data: List[Dict[str, Any]], file_path: Path) -> None:
    """Funzione generica per salvare dati in un file JSON."""
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def load_settings() -> Dict[str, Any]:
    default_settings = {"width": 950, "height": 700, "x": None, "y": None, "theme": "dark"}
    if not SETTINGS_FILE.exists(): return default_settings
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            settings = json.load(f)
            return {**default_settings, **settings}
    except (json.JSONDecodeError, FileNotFoundError):
        return default_settings

def save_settings(settings: Dict[str, Any]) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f)

# --- Logica di Scraping (invariata) ---
def scrape_amazon_product_page(url: str, headers: Dict) -> Dict[str, Any]:
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, 'html.parser')
    
    title_element = soup.find(id='productTitle')
    title = title_element.get_text(strip=True) if title_element else "Titolo non trovato"

    price = 0.0
    price_container_selectors = ['#corePrice_feature_div', '#price_inside_buybox', '#desktop_buybox', '#tmmSwatches', '.a-section .a-price']
    price_container = None
    for selector in price_container_selectors:
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
def get_settings(): return jsonify(load_settings())

@app.route('/api/wishlist', methods=['GET', 'POST'])
def handle_wishlist():
    if request.method == 'GET': return jsonify(load_data(WISHLIST_FILE))
    if request.method == 'POST':
        save_data(request.json, WISHLIST_FILE)
        return jsonify({"status": "success"}), 200

# NUOVO: Endpoint per lo storico
@app.route('/api/history', methods=['GET', 'POST'])
def handle_history():
    if request.method == 'GET': return jsonify(load_data(HISTORY_FILE))
    if request.method == 'POST':
        save_data(request.json, HISTORY_FILE)
        return jsonify({"status": "success"}), 200

@app.route('/api/search')
def search_product():
    query_url = request.args.get('query', '')
    if not (query_url.startswith('http') and "amazon." in query_url):
        return jsonify({"error": "Per favore, inserisci un link Amazon valido."}), 400
    headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" }
    try:
        product_data = scrape_amazon_product_page(query_url, headers)
        if product_data["price"] == 0.0:
             return jsonify({"error": "Prezzo non trovato. Prodotto non disponibile?"}), 404
        return jsonify(product_data)
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
    window = webview.create_window(APP_NAME, 'http://127.0.0.1:5959', width=settings['width'], height=settings['height'], x=settings['x'], y=settings['y'], resizable=True, min_size=(700, 500), js_api=api)
    def on_window_change():
        current_settings = load_settings()
        current_settings.update({'width': window.width, 'height': window.height, 'x': window.x, 'y': window.y})
        save_settings(current_settings)
    window.events.resized += lambda w, h: on_window_change()
    window.events.moved += lambda x, y: on_window_change()
    webview.start()
