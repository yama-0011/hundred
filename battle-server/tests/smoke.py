"""User-run checks only: start server then bash scripts/card-battle-poc.sh test."""
import json
import os
import urllib.request
import urllib.error
import uuid
BASE = os.environ.get('POC_BASE_URL', 'http://127.0.0.1:5080')
def call(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
    try: response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error: response = error
    body = response.read()
    return response.status, json.loads(body) if body and response.headers.get_content_type() == 'application/json' else None

def state(token):
    status, result = call('/api/game', token=token)
    assert status == 200
    return result['state']

def step(token, command=None):
    command = command or {'requestId': str(uuid.uuid4()), 'expectedVersion': state(token)['version']}
    return call('/api/game/next-step', command, token)

def summon(token, **overrides):
    s = state(token)
    command = {'requestId': str(uuid.uuid4()), 'expectedVersion': s['version'], 'cardInstanceId': s['self']['hand'][0]['instanceId'], 'coreCount': 1}
    command.update(overrides)
    return call('/api/game/summon', command, token)

def advance(token, phase):
    status, result = step(token)
    assert status == 200 and result['state']['phase'] == phase, result
    return result['state']

status, created = call('/api/rooms', {})
assert status == 200
a = created['token']
assert created['state']['phase'] == 'WAITING'
assert len(created['state']['self']['hand']) == 4 and created['state']['self']['deckCount'] == 36
assert step(a)[1]['error'] == 'waiting_for_opponent'
status, joined = call('/api/rooms/join', {'roomCode': created['state']['roomCode']})
assert status == 200
b = joined['token']
assert call('/api/game')[0] == 401
assert call('/api/rooms/join', {'roomCode': created['state']['roomCode']})[0] == 409
assert state(a)['isYourTurn'] and not state(b)['isYourTurn']
assert 'hand' not in state(a)['opponent']
assert state(a)['phase'] == 'START'
assert summon(a)[1]['error'] == 'not_main_step'
assert step(b)[1]['error'] == 'not_your_turn'
initial = state(a)
request = {'requestId': str(uuid.uuid4()), 'expectedVersion': initial['version']}
status, result = step(a, request)
assert status == 200 and result['state']['phase'] == 'DRAW'
assert step(a, request)[1]['replayed']
assert len(state(a)['self']['hand']) == 5 and state(a)['self']['deckCount'] == 35
assert state(a)['self']['reserve'] == 4  # First player skips CORE.
assert step(a, dict(request, expectedVersion=99))[1]['error'] == 'request_id_reused'
advance(a, 'REFRESH')
advance(a, 'MAIN')
before = state(a)
for invalid in [{'coreCount': 0}, {'coreCount': 2}, {'cardInstanceId': state(b)['self']['hand'][0]['instanceId']}]:
    assert summon(a, **invalid)[0] == 409
    assert state(a) == before
assert summon(a, cost=0)[0] == 400
assert summon(a)[0] == 200
assert state(a)['self']['reserve'] == 0 and state(a)['self']['trashCores'] == 3
assert len(state(b)['opponent']['field']) == 1
advance(a, 'END')  # First player also skips ATTACK.
s = advance(a, 'START')
assert s['turn'] == 2 and s['activePlayer'] == 2 and not s['isYourTurn']
assert step(a)[1]['error'] == 'not_your_turn'
assert step(a, request)[1]['replayed']  # Old valid request cannot advance a later turn.
assert state(a)['turn'] == 2
s = advance(b, 'CORE'); assert s['self']['reserve'] == 5
s = advance(b, 'DRAW'); assert len(s['self']['hand']) == 5 and s['self']['deckCount'] == 35
advance(b, 'REFRESH'); advance(b, 'MAIN')
assert summon(b)[0] == 200
advance(b, 'ATTACK'); advance(b, 'END'); advance(b, 'START')
assert state(a)['turn'] == 3 and state(a)['isYourTurn']
s = advance(a, 'CORE'); assert s['self']['reserve'] == 1 and s['self']['trashCores'] == 3
s = advance(a, 'DRAW'); assert s['self']['deckCount'] == 34
s = advance(a, 'REFRESH'); assert s['self']['reserve'] == 4 and s['self']['trashCores'] == 0
assert s['self']['field'][0]['cores'] == 1 and not s['self']['field'][0]['exhausted']
assert s['self']['life'] + s['self']['reserve'] + s['self']['trashCores'] + sum(c['cores'] for c in s['self']['field']) == 10
assert state(b)['opponent']['reserve'] == 4
# Stop safely on an empty deck rather than silently inventing a defeat rule.
for _ in range(600):
    s = state(a)
    if s['paused']: break
    assert step(a if s['activePlayer'] == 1 else b)[0] == 200
else: raise AssertionError('Deck did not reach the expected pause')
assert s['pauseReason'] == 'deck_exhausted' and s['phase'] == 'DRAW'
assert step(a if s['activePlayer'] == 1 else b)[1]['error'] == 'deck_exhausted'
print('PASS: private state, turn ownership, 7 steps, first-turn skips, draw, refresh, summon restrictions, idempotency, two-player sync, deck pause')
