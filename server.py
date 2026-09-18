#!/usr/bin/env python3
"""
Local Image & Telemetry Server for IELTS Vocab Fantasia Assistant
Serves on http://127.0.0.1:8777/ with:
- Static image streaming (auto-discovers images directory)
- Dedicated stats page & data persistence (data/stats.json)
- Google Translate proxy (/api/translate)
- Full CORS support (Access-Control-Allow-Origin: *)
- Case-insensitive filename matching (e.g. travel.jpg -> Travel.jpg)
"""
import json
import os
import sys
import threading
import time
import subprocess
import urllib.parse
import urllib.request
import pty
import re
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

class SiriSpeaker:
    def __init__(self):
        self._lock = threading.Lock()
        self._current_proc = None
        self._current_master = None
        self._stop_event = threading.Event()
        self._thread = None
        self._subscribers = []

    def add_subscriber(self):
        q = queue.Queue(maxsize=300)
        with self._lock:
            self._subscribers.append(q)
        return q

    def remove_subscriber(self, q):
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def _broadcast(self, event_type, data):
        with self._lock:
            dead = []
            for q in self._subscribers:
                try:
                    q.put_nowait({"type": event_type, **data})
                except queue.Full:
                    dead.append(q)
            for d in dead:
                self._subscribers.remove(d)

    def stop(self):
        with self._lock:
            self._stop_event.set()
            if self._current_proc and self._current_proc.poll() is None:
                try:
                    self._current_proc.terminate()
                except Exception:
                    pass
                self._current_proc = None
            if self._current_master is not None:
                try:
                    os.close(self._current_master)
                except OSError:
                    pass
                self._current_master = None
        self._broadcast("stop", {})

    def speak(self, text, count=1):
        self.stop()
        with self._lock:
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, args=(text, int(count)), daemon=True)
            self._thread.start()

    def is_speaking(self):
        with self._lock:
            return self._thread is not None and self._thread.is_alive()

    def _run(self, text, count):
        clean_text = (text or "").strip()
        if not clean_text:
            return
        if not clean_text.endswith(('.', '!', '?', '"', '”', "'")):
            clean_text += '.'

        pattern = re.compile(rb'\x1b\[1m([^\x1b]+)\x1b\(B\x1b\[m')
        self._broadcast("start", {"total_loops": count, "text": clean_text})

        for loop_idx in range(count):
            if self._stop_event.is_set():
                break

            self._broadcast("loop_start", {"loop_index": loop_idx, "total_loops": count})

            master, slave = pty.openpty()
            with self._lock:
                self._current_master = master

            env = dict(os.environ, TERM="xterm")
            proc = None
            try:
                # Run say in interactive mode inside PTY to stream spoken words
                proc = subprocess.Popen(
                    ["say", "--interactive=bold", clean_text],
                    stdin=slave, stdout=slave, stderr=slave,
                    close_fds=True, env=env
                )
                with self._lock:
                    self._current_proc = proc
            except Exception as e:
                print(f"[SiriSpeaker] say PTY error: {e}", file=sys.stderr)
                os.close(slave)
                with self._lock:
                    if self._current_master == master:
                        try:
                            os.close(master)
                        except OSError:
                            pass
                        self._current_master = None
                break
            finally:
                try:
                    os.close(slave)
                except OSError:
                    pass

            buffer = b''
            search_pos = 0

            while True:
                if self._stop_event.is_set():
                    break
                try:
                    chunk = os.read(master, 1024)
                    if not chunk:
                        break
                    buffer += chunk
                    matches = pattern.findall(buffer)
                    if matches:
                        for m in matches:
                            word_str = m.decode("utf-8", errors="ignore")
                            raw = word_str.strip('.,!?:;"\'()[]{}')
                            idx = clean_text.find(raw, search_pos) if raw else -1
                            if idx < 0 and raw:
                                idx = clean_text.lower().find(raw.lower(), search_pos)
                            if idx >= 0:
                                search_pos = idx + len(raw)
                            else:
                                idx = search_pos

                            self._broadcast("word", {
                                "word": word_str,
                                "raw_word": raw,
                                "char_index": idx,
                                "char_length": len(raw) if raw else len(word_str),
                                "loop_index": loop_idx,
                                "total_loops": count
                            })
                        buffer = buffer[buffer.rfind(matches[-1]) + len(matches[-1]):]
                except OSError:
                    break

            with self._lock:
                if self._current_master == master:
                    try:
                        os.close(master)
                    except OSError:
                        pass
                    self._current_master = None

            if proc:
                try:
                    proc.wait(timeout=1.0)
                except Exception:
                    pass

            with self._lock:
                self._current_proc = None

            if self._stop_event.is_set():
                break

            self._broadcast("loop_end", {"loop_index": loop_idx, "total_loops": count})

            if loop_idx < count - 1:
                t_end = time.time() + 0.8
                while time.time() < t_end and not self._stop_event.is_set():
                    time.sleep(0.05)

        self._broadcast("done", {})

siri_speaker = SiriSpeaker()

PROJECT_DIR = Path(__file__).resolve().parent

# ---- Image directory discovery (checked in priority order) ----
_IMAGE_CANDIDATES = [
    PROJECT_DIR.parent / "IELTS-Vacab-Fantasia-Images" / "images",
    PROJECT_DIR.parent / "IELTS-Vacab-Fantasia" / "assets" / "images",
]
IMAGES_DIR = None
for _candidate in _IMAGE_CANDIDATES:
    if _candidate.exists():
        IMAGES_DIR = _candidate
        break

STATS_FILE = PROJECT_DIR / "data" / "stats.json"
PORT = 8777


def sanitize_stats_data(data):
    if not isinstance(data, dict):
        return data
    words = data.get("words", {})
    if isinstance(words, dict):
        total_marks = 0
        total_opens = 0
        total_success = 0
        for w_data in words.values():
            if isinstance(w_data, dict):
                opens = int(w_data.get("modalOpens", 0) or 0)
                succ = int(w_data.get("inputSuccess", 0) or 0)
                marks = int(w_data.get("marks", 0) or 0)
                if opens > 0 and succ > opens:
                    w_data["inputSuccess"] = opens
                    succ = opens
                total_marks += marks
                total_opens += opens
                total_success += succ
        data["summary"] = {
            "marks": total_marks,
            "modalOpens": total_opens,
            "inputSuccess": total_success
        }
    return data

IMAGE_INDEX = {}
if IMAGES_DIR and IMAGES_DIR.exists():
    for fn in os.listdir(IMAGES_DIR):
        IMAGE_INDEX[fn.lower()] = fn
        stem = Path(fn).stem.lower()
        if stem not in IMAGE_INDEX:
            IMAGE_INDEX[stem] = fn

class IELTSRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        req_path = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/')
        req_name = urllib.parse.unquote(req_path)

        if not req_name or req_name == "health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(f"IELTS Assistant Server running ({len(IMAGE_INDEX)} indexed images)".encode('utf-8'))
            return

        # Dedicated stats API
        if req_name == "api/stats":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if STATS_FILE.exists():
                try:
                    raw_data = json.loads(STATS_FILE.read_text(encoding='utf-8'))
                    clean_data = sanitize_stats_data(raw_data)
                    self.wfile.write(json.dumps(clean_data, ensure_ascii=False, indent=2).encode('utf-8'))
                except Exception:
                    self.wfile.write(STATS_FILE.read_bytes())
            else:
                self.wfile.write(b'{"summary":{"marks":0,"modalOpens":0,"inputSuccess":0},"words":{}}')
            return

        # Siri speech status API
        if req_name.startswith("api/siri_speak"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"speaking": siri_speaker.is_speaking()}).encode('utf-8'))
            return

        # Siri real-time speech events (Server-Sent Events)
        if req_name.startswith("api/siri_events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            q = siri_speaker.add_subscriber()
            try:
                # Send initial ping
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()

                while True:
                    try:
                        ev = q.get(timeout=1.0)
                        payload = f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode('utf-8')
                        self.wfile.write(payload)
                        self.wfile.flush()
                        if ev.get("type") in ("done", "stop"):
                            break
                    except queue.Empty:
                        # Heartbeat comment to keep connection alive
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, Exception):
                pass
            finally:
                siri_speaker.remove_subscriber(q)
            return

        # Translation proxy API
        if req_path.startswith("api/translate"):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            query_text = params.get('q', [''])[0]
            if not query_text:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"translation":""}')
                return
            try:
                g_url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + urllib.parse.quote(query_text)
                req = urllib.request.Request(g_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'})
                with urllib.request.urlopen(req, timeout=6) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    translated = "".join(item[0] for item in (data[0] or []) if item and item[0])
                    if translated and translated.strip():
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(json.dumps({"translation": translated.strip()}, ensure_ascii=False).encode('utf-8'))
                        return
            except Exception:
                pass

            # Fallback to MyMemory
            try:
                mm_url = "https://api.mymemory.translated.net/get?q=" + urllib.parse.quote(query_text) + "&langpair=en|zh-CN"
                req2 = urllib.request.Request(mm_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
                with urllib.request.urlopen(req2, timeout=6) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    text = data.get('responseData', {}).get('translatedText', '')
                    if text and text.strip() and "MYMEMORY WARNING" not in text:
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(json.dumps({"translation": text.strip()}, ensure_ascii=False).encode('utf-8'))
                        return
            except Exception as e:
                pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Translation failed", "translation": ""}).encode('utf-8'))
            return

        # Stats HTML page
        if req_name in ("stats", "stats.html"):
            stats_html = PROJECT_DIR / "tampermonkey" / "stats.html"
            if stats_html.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(stats_html.read_bytes())
                return

        # Static Images
        if IMAGES_DIR:
            clean_lower = req_name.lower()
            target_file = None
            if clean_lower in IMAGE_INDEX:
                target_file = IMAGES_DIR / IMAGE_INDEX[clean_lower]
            elif (clean_lower + '.jpg') in IMAGE_INDEX:
                target_file = IMAGES_DIR / IMAGE_INDEX[clean_lower + '.jpg']

            if target_file and target_file.is_file():
                try:
                    data = target_file.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception:
                    pass

        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self):
        req_path = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/')
        if req_path == "api/stats":
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode('utf-8'))
                data = sanitize_stats_data(data)
                STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
                STATS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
                return
            except Exception as e:
                self.send_response(400)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
                return

        if req_path == "api/siri_speak":
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode('utf-8')) if body else {}
                action = data.get("action", "speak")
                if action == "stop":
                    siri_speaker.stop()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(b'{"status":"ok","speaking":false}')
                    return
                else:
                    text = data.get("text", "")
                    count = int(data.get("count", 1))
                    siri_speaker.speak(text, count)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "speaking": True, "count": count}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_HEAD(self):
        if not IMAGES_DIR:
            self.send_response(404)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        req_name = urllib.parse.unquote(self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/'))
        clean_lower = req_name.lower()
        target_file = None
        if clean_lower in IMAGE_INDEX:
            target_file = IMAGES_DIR / IMAGE_INDEX[clean_lower]
        elif (clean_lower + '.jpg') in IMAGE_INDEX:
            target_file = IMAGES_DIR / IMAGE_INDEX[clean_lower + '.jpg']

        if target_file and target_file.is_file():
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(target_file.stat().st_size))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
        else:
            self.send_response(404)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        pass

def run_server(port=PORT):
    server_address = ('', port)
    httpd = HTTPServer(server_address, IELTSRequestHandler)
    img_info = f"{len(IMAGE_INDEX)} indexed images" if IMAGES_DIR else "no local images (CDN only)"
    print(f"============================================================")
    print(f"🖼️  IELTS Vocab Fantasia Assistant Server running at:")
    print(f"   👉 Images API: http://127.0.0.1:{port}/  ({img_info})")
    print(f"   📊 Stats Page: http://127.0.0.1:{port}/stats")
    print(f"   💾 Stats Sync: {STATS_FILE}")
    print(f"   🌐 Full CORS enabled for all webpages")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port)
