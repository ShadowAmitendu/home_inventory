import json, time, subprocess, base64, shutil, os, socket, urllib.request

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
tmp_profile = os.path.abspath("tmp_chrome_card_test")
if os.path.exists(tmp_profile):
    shutil.rmtree(tmp_profile, ignore_errors=True)
os.makedirs(tmp_profile, exist_ok=True)

proc = subprocess.Popen([
    chrome_path,
    "--headless=new",
    f"--user-data-dir={tmp_profile}",
    "--remote-debugging-port=9244",
    "--disable-gpu",
    "--window-size=1200,900",
    "http://127.0.0.1:5000"
])
time.sleep(3)

try:
    tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9244/json").read().decode("utf-8"))
    tab = [t for t in tabs if t.get("type") == "page"][0]
    ws_url = tab["webSocketDebuggerUrl"]
    path = "/" + ws_url.split("/", 3)[3]

    s = socket.create_connection(("127.0.0.1", 9244))
    s.settimeout(10)
    key = base64.b64encode(b"0123456789abcdef").decode()
    req = f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:9244\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    s.sendall(req.encode())
    res = s.recv(4096)
    assert b"101 " in res

    def send_cmd(method, params=None, msg_id=1):
        payload = json.dumps({"id": msg_id, "method": method, "params": params or {}}).encode("utf-8")
        frame = bytearray([0x81])
        length = len(payload)
        if length < 126:
            frame.append(0x80 | length)
        elif length < 65536:
            frame.append(0x80 | 126)
            frame.extend(length.to_bytes(2, "big"))
        else:
            frame.append(0x80 | 127)
            frame.extend(length.to_bytes(8, "big"))
        mask = b"\x12\x34\x56\x78"
        frame.extend(mask)
        frame.extend(bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
        s.sendall(frame)

        resp = b""
        while True:
            chunk = s.recv(65536)
            resp += chunk
            if b'"id":' in resp and (b'"result"' in resp or b'"error"' in resp):
                break
        idx = resp.find(b'{')
        end_idx = resp.rfind(b'}') + 1
        return json.loads(resp[idx:end_idx].decode('utf-8', errors='ignore'))

    eval_res = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                $('[name="toggle"]').click();
                const tr = $('tbody > tr').first();
                const cardViews = tr.find('.card-view');
                const titles = [];
                cardViews.each((i, el) => {
                    titles.push($(el).find('.card-view-title').text().trim() || '[no title / checkbox]');
                });
                return JSON.stringify({
                    trHtml: tr.html(),
                    titles: titles
                });
            })()
        """,
        "returnByValue": True
    }, msg_id=10)
    val = json.loads(eval_res.get("result", {}).get("result", {}).get("value", "{}"))
    print("Titles in card:", val.get("titles"))
    print("\nFull TR HTML:\n", val.get("trHtml"))

finally:
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except:
        proc.kill()
    if os.path.exists(tmp_profile):
        shutil.rmtree(tmp_profile, ignore_errors=True)
