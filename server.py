#!/usr/bin/env python3
"""
macOS Siri High-Fidelity Audio Relay Service for IELTS Vocab Fantasia Assistant
Serves on http://127.0.0.1:8777/ with:
- macOS Siri High-Fidelity Speech Engine (/api/siri_speak)
- Real-Time Word Highlight & Event Stream (/api/siri_events)
- Translation Fallback Proxy (/api/translate)
- Full CORS Support (Access-Control-Allow-Origin: *)
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
import struct
import fcntl
import termios
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = 8777

# ==============================================================================
# 语音配置 (Voice Settings)
# ==============================================================================
# 中文声音设置：默认留空 "" 即直接调用 macOS 系统默认声音（若在系统辅助功能中设置为 Siri 中文，则自动调用 Siri 中文）；
# 找到特定声音名称后（如 "Voice 3" 或 "Tingting" 等），可直接修改此配置或设置环境变量 SIRI_CHINESE_VOICE
DEFAULT_CHINESE_VOICE = os.environ.get("SIRI_CHINESE_VOICE", "").strip()

# 英文声音设置：默认留空 "" 即直接调用 macOS 系统默认声音（如系统设置的 Siri 英文语音）
DEFAULT_ENGLISH_VOICE = os.environ.get("SIRI_ENGLISH_VOICE", "").strip()

class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc_type, exc_val, _ = sys.exc_info()
        if exc_type in (ConnectionResetError, BrokenPipeError):
            return
        if isinstance(exc_val, OSError) and getattr(exc_val, "errno", None) in (54, 32, 104):
            return
        super().handle_error(request, client_address)

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

    @staticmethod
    def _is_chinese(text):
        return any('\u4e00' <= ch <= '\u9fff' for ch in (text or ""))

    def speak(self, text, count=1, voice=None, lang=None):
        self.stop()
        with self._lock:
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run,
                args=(text, int(count), voice, lang),
                daemon=True
            )
            self._thread.start()

    def is_speaking(self):
        with self._lock:
            return self._thread is not None and self._thread.is_alive()

    def _run(self, text, count, voice=None, lang=None):
        clean_text = (text or "").strip()
        if not clean_text:
            return

        is_zh = (lang == "zh") or self._is_chinese(clean_text)
        if not clean_text.endswith(('.', '!', '?', '"', '”', "'", '。', '！', '？', '；', ';')):
            clean_text += ('。' if is_zh else '.')

        def normalize_for_say(t):
            return (t
                .replace('\u2013', '-')   # en-dash (–)
                .replace('\u2014', '-')   # em-dash (—)
                .replace('\u2018', "'")   # left single quote (‘)
                .replace('\u2019', "'")   # right single quote (’)
                .replace('\u201c', '"')   # left double quote (“)
                .replace('\u201d', '"')   # right double quote (”)
                .replace('\u2026', '...') # ellipsis (…)
                .replace('\u00a0', ' ')   # non-breaking space
            )

        spoken_text = normalize_for_say(clean_text)

        # 声音判定：请求显式指定 > 默认中文/英文配置 > 系统默认声音
        selected_voice = voice
        if not selected_voice:
            selected_voice = DEFAULT_CHINESE_VOICE if is_zh else DEFAULT_ENGLISH_VOICE

        pattern = re.compile(rb'\x1b\[1m([^\x1b]+)\x1b\(B\x1b\[m')
        self._broadcast("start", {"total_loops": count, "text": clean_text, "lang": "zh" if is_zh else "en"})

        for loop_idx in range(count):
            if self._stop_event.is_set():
                break

            self._broadcast("loop_start", {"loop_index": loop_idx, "total_loops": count})

            master, slave = pty.openpty()
            with self._lock:
                self._current_master = master

            # Set wide virtual terminal (1000 cols) to prevent say from line-wrapping output
            try:
                winsize = struct.pack('HHHH', 24, 1000, 0, 0)
                fcntl.ioctl(slave, termios.TIOCSWINSZ, winsize)
            except Exception:
                pass

            env = dict(os.environ, TERM="xterm")
            proc = None
            try:
                cmd = ["say"]
                if selected_voice:
                    cmd.extend(["-v", selected_voice])
                cmd.extend(["--interactive=bold", spoken_text])

                # Run say in interactive mode inside PTY to stream spoken words
                proc = subprocess.Popen(
                    cmd,
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
                            if not raw or ' ' in raw or len(raw) > 40:
                                continue
                            idx = clean_text.find(raw, search_pos)
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
                                "char_length": len(raw),
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

class IELTSRequestHandler(BaseHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass
        except OSError as e:
            if getattr(e, "errno", None) in (54, 32, 104):
                pass
            else:
                raise

    def do_GET(self):
        req_path = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/')
        req_name = urllib.parse.unquote(req_path)

        if not req_name or req_name == "health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"IELTS Vocab Fantasia Siri Audio Relay is running.")
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
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, Exception):
                pass
            finally:
                siri_speaker.remove_subscriber(q)
            return

        # Translation proxy fallback API
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
            except Exception:
                pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Translation failed", "translation": ""}).encode('utf-8'))
            return

        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self):
        req_path = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/')

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
                    voice = data.get("voice", None)
                    lang = data.get("lang", None)
                    siri_speaker.speak(text, count, voice=voice, lang=lang)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "ok",
                        "speaking": True,
                        "count": count,
                        "lang": lang or ("zh" if SiriSpeaker._is_chinese(text) else "en"),
                        "voice": voice or (DEFAULT_CHINESE_VOICE if (lang == "zh" or SiriSpeaker._is_chinese(text)) else DEFAULT_ENGLISH_VOICE)
                    }).encode('utf-8'))
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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        pass

def run_server(port=PORT):
    server_address = ('', port)
    httpd = QuietThreadingHTTPServer(server_address, IELTSRequestHandler)
    zh_voice_desc = DEFAULT_CHINESE_VOICE if DEFAULT_CHINESE_VOICE else "macOS 默认声音 (Siri 中文)"
    en_voice_desc = DEFAULT_ENGLISH_VOICE if DEFAULT_ENGLISH_VOICE else "macOS 默认声音 (Siri 英文)"
    print("============================================================")
    print(f"🍎 IELTS Vocab Fantasia Siri 语音服务已启动 (Port {port}):")
    print(f"   🎙️ Siri 语音中继接口:  http://127.0.0.1:{port}/api/siri_speak")
    print(f"   ⚡ 实时音词事件追踪:  http://127.0.0.1:{port}/api/siri_events")
    print(f"   🇨🇳 中文语音配置:      {zh_voice_desc}")
    print(f"   🇬🇧 英文语音配置:      {en_voice_desc}")
    print("   🌐 全域 CORS 支持已启用 (各大网页划词无缝交互)")
    print("============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port)
