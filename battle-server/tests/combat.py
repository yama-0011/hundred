"""User-run combat checks: python3 battle-server/tests/combat.py (server must be running)."""
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

def state(token): return call('/api/game', token=token)[1]['state']
def send(token, action, **values):
    data = dict(requestId=str(uuid.uuid4()), expectedVersion=state(token)['version'])
    data.update(values)
    return call('/api/game/' + action, data, token)
def ok(result):
    assert result[0] == 200, result
    return result[1]['state']
def go(token, phase):
    for _ in range(8):
        if state(token)['phase'] == phase: return state(token)
        ok(send(token, 'next-step'))
    raise AssertionError('Phase not reached')
def next_turn(token):
    go(token, 'END')
    return ok(send(token, 'next-step'))
def setup():
    _, created = call('/api/rooms', {})
    a = created['token']
    _, joined = call('/api/rooms/join', {'roomCode': created['state']['roomCode']})
    return a, joined['token']
def summon(token):
    go(token, 'MAIN')
    c = state(token)['self']['hand'][0]
    ok(send(token, 'summon', cardInstanceId=c['instanceId'], coreCount=1))
    return state(token)['self']['field'][-1]
def attack(token, card): return send(token, 'attack', cardInstanceId=card['instanceId'])
def defend(token, card=None):
    return send(token, 'defend', battleId=state(token)['battleId'], takeLife=card is None, cardInstanceId='' if card is None else card['instanceId'])

a, b = setup()
blocker = summon(a)
assert attack(a, blocker)[1]['error'] == 'not_attack_step'
next_turn(a)
attacker = summon(b)
go(b, 'ATTACK')
assert attack(b, blocker)[1]['error'] == 'card_not_on_field'
ok(attack(b, attacker))
assert state(a)['canDefend'] and not state(b)['canDefend']
assert state(b)['self']['field'][0]['exhausted']
assert send(b, 'next-step')[1]['error'] == 'battle_in_progress'
assert attack(b, attacker)[1]['error'] == 'battle_in_progress'
assert defend(b)[1]['error'] == 'not_defender'
before = state(a)
assert send(a, 'defend', battleId='wrong', takeLife=True, cardInstanceId='')[1]['error'] == 'stale_battle'
assert state(a) == before
assert defend(a, attacker)[1]['error'] == 'card_not_on_field'
command = dict(requestId=str(uuid.uuid4()), expectedVersion=state(a)['version'], battleId=state(a)['battleId'], takeLife=False, cardInstanceId=blocker['instanceId'])
ok(call('/api/game/defend', command, a))
after_a, after_b = state(a), state(b)
assert not after_a['waitingForDefense']
assert after_a['self']['life'] == after_b['self']['life'] == 5
assert after_a['self']['trashCount'] == int(blocker['bp'] <= attacker['bp'])
assert after_b['self']['trashCount'] == int(attacker['bp'] <= blocker['bp'])
assert after_a['self']['reserve'] == int(blocker['bp'] <= attacker['bp'])
assert after_b['self']['reserve'] == 1 + int(attacker['bp'] <= blocker['bp'])
assert call('/api/game/defend', command, a)[1]['replayed']
assert state(a) == after_a
for token in (a, b):
    for c in state(token)['self']['field']: assert c['exhausted']
if after_b['self']['field']:
    assert attack(b, attacker)[1]['error'] == 'card_exhausted'
next_turn(b)
go(a, 'REFRESH')
for c in state(a)['self']['field']: assert not c['exhausted']
# Separate match: take five single-symbol attacks, retain core totals, then reject new actions.
a, b = setup()
next_turn(a)
attacker = summon(b)
for hit in range(1, 6):
    go(b, 'ATTACK')
    ok(attack(b, attacker))
    pre = state(a)['self']
    result = ok(defend(a))
    assert result['self']['life'] == 5-hit
    assert result['self']['reserve'] == pre['reserve']+1
    assert result['opponent']['field'][0]['exhausted']
    assert state(b)['opponent']['life'] == 5-hit
    if hit == 5:
        assert result['finished'] and result['winner'] == 2
        assert not state(a)['canDefend'] and not state(b)['canAttack']
        assert send(b, 'next-step')[1]['error'] == 'game_finished'
        assert attack(b, attacker)[1]['error'] == 'game_finished'
    else:
        assert attack(b, attacker)[1]['error'] == 'card_exhausted'
        next_turn(b)
        next_turn(a)
        go(b, 'REFRESH')
        assert not state(b)['self']['field'][0]['exhausted']
print('PASS: attack/defense ownership, pending battle, BP destruction, core return, idempotency, exhaustion/refresh, life damage and victory')
