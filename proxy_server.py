from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import json
import os
import sys

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
    
    def do_GET(self):
        sys.stderr.write(f'GET request for: {self.path}\n')
        sys.stderr.flush()
        
        if self.path == '/api/roblox':
            try:
                sys.stderr.write('Fetching Roblox version from API...\n')
                sys.stderr.flush()
                
                # Создаем запрос к API с правильным User-Agent
                req = urllib.request.Request(
                    'https://weao.xyz/api/versions/current',
                    headers={'User-Agent': 'WEAO-3PService'}
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = response.read()
                    sys.stderr.write(f'Roblox API Response received: {len(data)} bytes\n')
                    sys.stderr.flush()
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                sys.stderr.write(f'Error fetching Roblox API: {e}\n')
                sys.stderr.flush()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_data = json.dumps({'error': str(e)}).encode()
                self.wfile.write(error_data)
        elif self.path == '/api/wave':
            try:
                sys.stderr.write('Fetching Wave status from API...\n')
                sys.stderr.flush()
                
                # Создаем запрос к API с правильным User-Agent
                req = urllib.request.Request(
                    'https://weao.xyz/api/status/exploits/wave',
                    headers={'User-Agent': 'WEAO-3PService'}
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = response.read()
                    sys.stderr.write(f'API Response received: {len(data)} bytes\n')
                    sys.stderr.flush()
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                sys.stderr.write(f'Error fetching API: {e}\n')
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
