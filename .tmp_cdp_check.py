import base64
import json
import os
import socket
import struct
import time
import urllib.request
from urllib.parse import urlparse


targets = json.load(urllib.request.urlopen('http://127.0.0.1:9223/json'))
target = next(item for item in targets if item.get('type') == 'page')
url = urlparse(target['webSocketDebuggerUrl'])
sock = socket.create_connection((url.hostname, url.port))
key = base64.b64encode(os.urandom(16)).decode()
request = (
    f'GET {url.path} HTTP/1.1\r\nHost: {url.hostname}:{url.port}\r\n'
    'Upgrade: websocket\r\nConnection: Upgrade\r\n'
    f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
)
sock.sendall(request.encode())
response = b''
while b'\r\n\r\n' not in response:
    response += sock.recv(4096)
if b' 101 ' not in response.split(b'\r\n', 1)[0]:
    raise RuntimeError(response.decode(errors='replace'))


def read_exact(length):
    value = b''
    while len(value) < length:
        value += sock.recv(length - len(value))
    return value


def receive():
    while True:
        first, second = read_exact(2)
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = struct.unpack('!H', read_exact(2))[0]
        elif length == 127:
            length = struct.unpack('!Q', read_exact(8))[0]
        if second & 0x80:
            mask = read_exact(4)
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(read_exact(length)))
        else:
            payload = read_exact(length)
        if opcode == 9:
            send_frame(payload, opcode=10)
            continue
        if opcode == 1:
            return json.loads(payload.decode())


def send_frame(payload, opcode=1):
    if isinstance(payload, str):
        payload = payload.encode()
    mask = os.urandom(4)
    size = len(payload)
    header = bytes([0x80 | opcode])
    if size < 126:
        header += bytes([0x80 | size])
    elif size < 65536:
        header += bytes([0x80 | 126]) + struct.pack('!H', size)
    else:
        header += bytes([0x80 | 127]) + struct.pack('!Q', size)
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    sock.sendall(header + mask + masked)


next_id = 0


def call(method, params=None):
    global next_id
    next_id += 1
    current = next_id
    send_frame(json.dumps({'id': current, 'method': method, 'params': params or {}}))
    while True:
        message = receive()
        if message.get('id') == current:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message.get('result', {})


def evaluate(expression):
    result = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    return result['result'].get('value')


call('Runtime.enable')
call('Page.enable')
call('Emulation.setDeviceMetricsOverride', {'width': 1500, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
time.sleep(1)
evaluate("document.querySelector('.ai-desktop')?.classList.remove('dark')")
evaluate("[...document.querySelectorAll('.ad-desktop-icons > button')].find(e => e.textContent.includes('プロジェクト'))?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))")
time.sleep(1)
evaluate("document.querySelector('.ad-window.active button[aria-label=\"最大化\"]')?.click()")
time.sleep(.5)

styles = evaluate("""(() => {
  const info = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    return {text: element.textContent.trim().replace(/\\s+/g, ' '), color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderColor: style.borderColor};
  };
  const buttons = [...document.querySelectorAll('.ad-app-header button')];
  return {
    dark: document.querySelector('.ai-desktop').classList.contains('dark'),
    header: info(document.querySelector('.ad-app-header')),
    description: info(document.querySelector('.ad-app-header__description')),
    copyContext: info(buttons.find(e => e.textContent.includes('コンテキストをコピー'))),
    masterTemplate: info(buttons.find(e => e.textContent.includes('マスタテンプレート')))
  };
})()""")
print(json.dumps(styles, ensure_ascii=False, indent=2))

shot = call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
with open('/tmp/hundred-light-mode-check.png', 'wb') as file:
    file.write(base64.b64decode(shot['data']))

sock.close()
