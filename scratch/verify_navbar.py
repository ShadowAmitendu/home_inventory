import json, time, subprocess, base64, shutil, os, socket, urllib.request, threading, sys

repo_dir = r"c:\Users\amite\Development\Experiments\home_inventory"
sys.path.insert(0, repo_dir)
os.chdir(repo_dir)

from app import app, init_db
init_db()

PORT = 5035
srv = threading.Thread(target=lambda: app.run(port=PORT, debug=False), daemon=True)
srv.start()
time.sleep(2)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
tmp_profile = os.path.abspath("tmp_chrome_nav_verify")
if os.path.exists(tmp_profile):
    shutil.rmtree(tmp_profile, ignore_errors=True)
os.makedirs(tmp_profile, exist_ok=True)

proc = subprocess.Popen([
    chrome_path,
    "--headless=new",
    f"--user-data-dir={tmp_profile}",
    "--remote-debugging-port=9260",
    "--disable-gpu",
    "--window-size=1280,900",
    f"http://127.0.0.1:{PORT}"
])
time.sleep(3)

try:
    tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9260/json").read().decode("utf-8"))
    tab = [t for t in tabs if t.get("type") == "page"][0]
    ws_url = tab["webSocketDebuggerUrl"]
    path = "/" + ws_url.split("/", 3)[3]

    s = socket.create_connection(("127.0.0.1", 9260))
    s.settimeout(10)
    key = base64.b64encode(b"0123456789abcdef").decode()
    req = f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:9260\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
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

    # 1. Desktop Check: Verify Navlinks & Dropdowns
    res_nav = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const navlinks = Array.from(document.querySelectorAll('.navbar-nav .nav-link')).map(l => l.innerText.trim().replace(/\\s+/g, ' '));
                const dropdowns = Array.from(document.querySelectorAll('.navbar-nav .dropdown-menu')).map(m => {
                    return Array.from(m.querySelectorAll('.dropdown-item')).map(item => item.innerText.trim().replace(/\\s+/g, ' '));
                });
                const btns = Array.from(document.querySelectorAll('#navbarContent .btn')).map(b => b.innerText.trim().replace(/\\s+/g, ' ') || b.getAttribute('title') || b.id);

                return JSON.stringify({ navlinks, dropdowns, btns });
            })()
        """,
        "returnByValue": True
    }, msg_id=1)
    nav_info = json.loads(res_nav.get("result", {}).get("result", {}).get("value"))
    print("Desktop Navbar Elements:")
    print(" - Navlinks:", nav_info["navlinks"])
    print(" - Dropdown 1 (Inventory) items:", nav_info["dropdowns"][0] if len(nav_info["dropdowns"]) > 0 else [])
    print(" - Dropdown 2 (Tools) items:", nav_info["dropdowns"][1] if len(nav_info["dropdowns"]) > 1 else [])
    print(" - Navbar Action Buttons:", nav_info["btns"])

    # 2. Test Dropdown Open on Click
    res_open = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const invLink = document.querySelector('#inventoryDropdown');
                invLink.click();
                const menu = document.querySelector('[aria-labelledby="inventoryDropdown"]');
                const isOpen = menu ? menu.classList.contains('show') : false;
                return JSON.stringify({ isOpen });
            })()
        """,
        "returnByValue": True
    }, msg_id=2)
    print("\nDropdown Open Check:", res_open.get("result", {}).get("result", {}).get("value"))

    # 3. Mobile Viewport Check (390px)
    send_cmd("Emulation.setDeviceMetricsOverride", {
        "width": 390,
        "height": 844,
        "deviceScaleFactor": 2,
        "mobile": True
    }, msg_id=3)
    time.sleep(1)

    res_mob = send_cmd("Runtime.evaluate", {
        "expression": """
            (() => {
                const toggler = document.querySelector('.navbar-toggler');
                const isTogglerVisible = window.getComputedStyle(toggler).display !== 'none';
                
                // Click toggler to expand
                toggler.click();
                const collapse = document.querySelector('#navbarContent');
                const isExpanded = collapse.classList.contains('show');

                const bodyWidth = document.body.clientWidth;
                const scrollWidth = document.documentElement.scrollWidth;

                return JSON.stringify({
                    isTogglerVisible,
                    isExpanded,
                    bodyWidth,
                    scrollWidth,
                    noOverflow: scrollWidth <= bodyWidth + 2
                });
            })()
        """,
        "returnByValue": True
    }, msg_id=4)
    print("\nMobile Navbar Check (390px):", res_mob.get("result", {}).get("result", {}).get("value"))

finally:
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except:
        proc.kill()
    if os.path.exists(tmp_profile):
        shutil.rmtree(tmp_profile, ignore_errors=True)
