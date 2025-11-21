from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import json
import os
import sys
import random

# WEAO API domains (with fallback support)
WEAO_DOMAINS = [
    'weao.xyz',
    'whatexpsare.online',
    'whatexploitsaretra.sh',
    'weao.gg'
]

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Принудительный вывод в консоль
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))
        sys.stderr.flush()
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        SimpleHTTPRequestHandler.end_headers(self)
    
    def fetch_with_fallback(self, endpoint):
        """
        Попытка запроса с автоматическим переключением на альтернативные домены
        при ошибках или rate limit
        """
        # Рандомизируем порядок доменов для распределения нагрузки
        domains = WEAO_DOMAINS.copy()
        random.shuffle(domains)
        
        last_error = None
        
        for domain in domains:
            try:
                url = f'https://{domain}{endpoint}'
                sys.stderr.write(f'Trying domain: {domain}\n')
                sys.stderr.flush()
                
                req = urllib.request.Request(
                    url,
                    headers={'User-Agent': 'WEAO-3PService'}
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = response.read()
                    sys.stderr.write(f'✅ Success from {domain}: {len(data)} bytes\n')
                    sys.stderr.flush()
                    return data
                    
            except urllib.error.HTTPError as e:
                if e.code == 429:  # Rate limit
                    sys.stderr.write(f'⚠️ Rate limit on {domain}, trying next...\n')
                    sys.stderr.flush()
                    last_error = e
                    continue
                else:
                    sys.stderr.write(f'❌ HTTP Error {e.code} on {domain}: {e.reason}\n')
                    sys.stderr.flush()
                    last_error = e
                    continue
                    
            except Exception as e:
                sys.stderr.write(f'❌ Error on {domain}: {e}\n')
                sys.stderr.flush()
                last_error = e
                continue
        
        # Все домены не работают
        raise last_error if last_error else Exception("All WEAO domains failed")
    
    def do_GET(self):
        sys.stderr.write(f'GET request for: {self.path}\n')
        sys.stderr.flush()
        
        if self.path == '/api/roblox':
            try:
                sys.stderr.write('Fetching Roblox version from WEAO API with fallback...\n')
                sys.stderr.flush()
                
                data = self.fetch_with_fallback('/api/versions/current')
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
                
            except Exception as e:
                sys.stderr.write(f'All domains failed for Roblox API: {e}\n')
                sys.stderr.flush()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_data = json.dumps({'error': str(e)}).encode()
                self.wfile.write(error_data)
                
        elif self.path == '/api/wave':
            try:
                sys.stderr.write('Fetching Wave status from WEAO API with fallback...\n')
                sys.stderr.flush()
                
                data = self.fetch_with_fallback('/api/status/exploits/wave')
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
                
            except Exception as e:
                sys.stderr.write(f'All domains failed for Wave API: {e}\n')
                sys.stderr.flush()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_data = json.dumps({'error': str(e)}).encode()
                self.wfile.write(error_data)
                
        else:
            # Обслуживаем статические файлы
            super().do_GET()

if __name__ == '__main__':
    port = 8000
    sys.stderr.write(f'Starting server on http://localhost:{port}\n')
    sys.stderr.write(f'Open http://localhost:{port} in your browser\n')
    sys.stderr.flush()
    server = HTTPServer(('', port), CORSRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write('\nServer stopped.\n')
        sys.stderr.flush()
