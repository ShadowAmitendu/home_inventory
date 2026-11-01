import json, time, subprocess, base64, shutil, os, socket, urllib.request, threading, sys

repo_dir = r"c:\Users\amite\Development\Experiments\home_inventory"
sys.path.insert(0, repo_dir)
os.chdir(repo_dir)

from app import app, init_db
init_db()

PORT = 5032
srv = threading.Thread(target=lambda: app.run(port=PORT, debug=False), daemon=True)
srv.start()
time.sleep(2)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
tmp_profile = os.path.abspath("tmp_chrome_grid_verify")
if os.path.exists(tmp_profile):
    shutil.rmtree(tmp_profile, ignore_errors=True)
os.makedirs(tmp_profile, exist_ok=True)

proc = subprocess.Popen([
    chrome_path,
    "--headless=new",
    f"--user-data-dir={tmp_profile}",
    "--remote-debugging-port=9257",
    "--disable-gpu",
    "--window-size=1280,900",
    f"http://127.0.0.1:{PORT}"
])
time.sleep(3)

try:
    tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9257/json").read().decode("utf-8"))
    tab = [t for t in tabs if t.get("type") == "page"][0]
    ws_url = tab["webSocketDebuggerUrl"]
    path = "/" + ws_url.split("/", 3)[3]

    s = socket.create_connection(("127.0.0.1", 9257))
    s.settimeout(10)
    key = base64.b64encode(b"0123456789abcdef").decode()
    req = f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:9257\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    s.sendall(req.encode())
    res = s.recv(4096)
    assert b"101 " in res

    def read_frame():
        header = s.recv(2)
        if not header:
            return None
        length = header[1] & 0x7F
        if length == 126:
            length = int.from_bytes(s.recv(2), "big")
        elif length == 127:
            length = int.from_bytes(s.recv(8), "big")
        data = b""
        while len(data) < length:
            chunk = s.recv(min(length - len(data), 65536))
            if not chunk:
                break
            data += chunk
        return data

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

        while True:
            frame_data = read_frame()
            if not frame_data:
                return None
            try:
                obj = json.loads(frame_data.decode("utf-8", errors="ignore"))
                if obj.get("id") == msg_id:
                    return obj
            except Exception:
                pass

    # 1. Desktop 1280px: Switch to Grid View and measure
    res_grid = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const btn = document.querySelector('button[name="toggle"]');
                btn.click();
                
                const tbody = document.querySelector('#tbl tbody');
                const tbodyStyle = window.getComputedStyle(tbody);
                const display = tbodyStyle.display;
                const gridCols = tbodyStyle.gridTemplateColumns;

                const rows = Array.from(tbody.querySelectorAll('tr:not(.no-records-found)'));
                const cardRects = rows.map((tr, i) => {
                    const r = tr.getBoundingClientRect();
                    return { i, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
                });

                const top0 = cardRects.length ? cardRects[0].top : 0;
                const row1Cards = cardRects.filter(r => Math.abs(r.top - top0) < 5);

                const icon = btn.querySelector('i').className;
                const title = btn.getAttribute('title');

                return JSON.stringify({
                    display,
                    gridCols,
                    totalCards: cardRects.length,
                    columnsInRow1: row1Cards.length,
                    row1Cards,
                    icon,
                    title,
                    sampleCardHeight: cardRects[0].height,
                    sampleCardWidth: cardRects[0].width
                });
            })()
        """,
        "returnByValue": True
    }, msg_id=1)
    grid_data = json.loads(res_grid.get("result", {}).get("result", {}).get("value"))
    print("Desktop 1280px Grid Check:")
    print(" - Display:", grid_data["display"])
    print(" - Columns in Row 1:", grid_data["columnsInRow1"])
    print(" - Card Dimensions (W x H):", f"{grid_data['sampleCardWidth']}px x {grid_data['sampleCardHeight']}px")
    print(" - Toggle Button Icon:", grid_data["icon"])
    print(" - Toggle Button Title:", grid_data["title"])

    # 2. Toggle back to Table View: Check compact row height
    res_table = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const btn = document.querySelector('button[name="toggle"]');
                btn.click();
                
                const tbody = document.querySelector('#tbl tbody');
                const display = window.getComputedStyle(tbody).display;
                const row0 = tbody.querySelector('tr');
                const row0Height = row0 ? Math.round(row0.getBoundingClientRect().height) : 0;
                const icon = btn.querySelector('i').className;
                const title = btn.getAttribute('title');

                return JSON.stringify({ display, row0Height, icon, title });
            })()
        """,
        "returnByValue": True
    }, msg_id=2)
    tbl_data = json.loads(res_table.get("result", {}).get("result", {}).get("value"))
    print("\nTable View Toggle-Back Check:")
    print(" - Display:", tbl_data["display"])
    print(" - Compact Row Height:", tbl_data["row0Height"], "px")
    print(" - Toggle Button Icon:", tbl_data["icon"])
    print(" - Toggle Button Title:", tbl_data["title"])

    # 3. Tablet Viewport (820px) Check
    send_cmd("Emulation.setDeviceMetricsOverride", {
        "width": 820,
        "height": 1180,
        "deviceScaleFactor": 2,
        "mobile": False
    }, msg_id=3)
    time.sleep(1)

    res_tablet = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const btn = document.querySelector('button[name="toggle"]');
                btn.click(); // switch to grid view
                
                const tbody = document.querySelector('#tbl tbody');
                const tbodyStyle = window.getComputedStyle(tbody);
                const display = tbodyStyle.display;

                const rows = Array.from(tbody.querySelectorAll('tr:not(.no-records-found)'));
                const cardRects = rows.map((tr, i) => {
                    const r = tr.getBoundingClientRect();
                    return { i, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
                });

                const top0 = cardRects.length ? cardRects[0].top : 0;
                const row1Cards = cardRects.filter(r => Math.abs(r.top - top0) < 5);

                return JSON.stringify({
                    display,
                    columnsInRow1: row1Cards.length,
                    cardWidth: cardRects[0].width,
                    cardHeight: cardRects[0].height
                });
            })()
        """,
        "returnByValue": True
    }, msg_id=4)
    tablet_data = json.loads(res_tablet.get("result", {}).get("result", {}).get("value"))
    print("\nTablet 820px Grid Check:")
    print(" - Display:", tablet_data["display"])
    print(" - Columns in Row 1:", tablet_data["columnsInRow1"])
    print(" - Card Dimensions (W x H):", f"{tablet_data['cardWidth']}px x {tablet_data['cardHeight']}px")

    # 4. Mobile Viewport (390px) Check
    send_cmd("Emulation.setDeviceMetricsOverride", {
        "width": 390,
        "height": 844,
        "deviceScaleFactor": 2,
        "mobile": True
    }, msg_id=5)
    time.sleep(1)

    res_mobile = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const tbody = document.querySelector('#tbl tbody');
                const tbodyStyle = window.getComputedStyle(tbody);
                const display = tbodyStyle.display;

                const rows = Array.from(tbody.querySelectorAll('tr:not(.no-records-found)'));
                const cardRects = rows.map((tr, i) => {
                    const r = tr.getBoundingClientRect();
                    return { i, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
                });

                const top0 = cardRects.length ? cardRects[0].top : 0;
                const row1Cards = cardRects.filter(r => Math.abs(r.top - top0) < 5);

                const bodyWidth = document.body.clientWidth;
                const scrollWidth = document.documentElement.scrollWidth;

                return JSON.stringify({
                    display,
                    columnsInRow1: row1Cards.length,
                    cardWidth: cardRects[0].width,
                    cardHeight: cardRects[0].height,
                    bodyWidth,
                    scrollWidth,
                    noHorizontalBlowout: scrollWidth <= bodyWidth + 2
                });
            })()
        """,
        "returnByValue": True
    }, msg_id=6)
    mobile_data = json.loads(res_mobile.get("result", {}).get("result", {}).get("value"))
    print("\nMobile 390px Grid Check:")
    print(" - Display:", mobile_data["display"])
    print(" - Columns in Row 1:", mobile_data["columnsInRow1"])
    print(" - Card Dimensions (W x H):", f"{mobile_data['cardWidth']}px x {mobile_data['cardHeight']}px")
    print(" - No Horizontal Blowout:", mobile_data["noHorizontalBlowout"])

finally:
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except:
        proc.kill()
    if os.path.exists(tmp_profile):
        shutil.rmtree(tmp_profile, ignore_errors=True)
