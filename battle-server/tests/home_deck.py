"""User-run integration verification. Requires local home + battle servers.
Creates one saved test deck and two rooms; does not expose opponent hands.
"""
import collections
import json
import os
import urllib.error
import urllib.request
import uuid
HOME = os.environ.get('POC_HOME_URL', 'http://127.0.0.1:8788')
BATTLE = os.environ.get('POC_BASE_URL', 'http://127.0.0.1:5080')

def call(base, path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + path, headers=headers,
        data=None if data is None else json.dumps(data).encode())
    try:
        response = urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read())

def ok(base, path, data=None, token=None):
    status, body = call(base, path, data, token)
    assert 200 <= status < 300, (status, body)
    return body

def state(token):
    return ok(BATTLE, '/api/game', token=token)['state']

master = ok(HOME, '/api/master')
decks = ok(HOME, '/api/decks')['decks']
original = next(d for d in decks if d['deckId'] == 'deck-poc')
assert original['masterVersion'] == master['masterVersion'], 'Use the initial poc-001 seed for this check.'
entries = [dict(e) for e in original['cards'] if e['cardId'] != 'POC-001']
entries.append({'cardId': 'POC-015', 'count': 3})
saved = ok(HOME, '/api/decks', {'name': 'API検証・紫入り', 'masterVersion': master['masterVersion'], 'cards': entries})
assert saved['cards'] == next(d for d in ok(HOME, '/api/decks')['decks'] if d['deckId'] == saved['deckId'])['cards']
assert next(d for d in ok(HOME, '/api/decks')['decks'] if d['deckId'] == 'deck-poc') == original
for invalid in [entries[:-1], entries + [entries[0]], [{'cardId':'MISSING','count':3}] + entries[1:]]:
    assert call(HOME, '/api/decks', {'name':'invalid', 'masterVersion':master['masterVersion'],'cards':invalid})[0] == 400
assert call(HOME, '/internal/decks/deck-poc')[0] == 401
assert call(BATTLE, '/api/rooms', {'deckId':'missing-deck'})[1]['error'] == 'deck_not_found'
created = ok(BATTLE, '/api/rooms', {'deckId':saved['deckId']})
a = created['token']
assert created['state']['self']['deckId'] == saved['deckId']
assert len(created['state']['self']['hand']) == 4
assert created['state']['self']['deckCount'] == 36
joined = ok(BATTLE, '/api/rooms/join', {'roomCode':created['state']['roomCode'],'deckId':'deck-poc'})
b = joined['token']
assert state(a)['masterHash'] == state(b)['masterHash']
assert state(a)['masterVersion'] == master['masterVersion']
first_draw = {'requestId':str(uuid.uuid4()), 'expectedVersion':state(a)['version']}
ok(BATTLE, '/api/game/next-step', first_draw, a)
after = state(a)
assert len(after['self']['hand']) == 5 and after['self']['deckCount'] == 35
assert ok(BATTLE, '/api/game/next-step', first_draw, a)['replayed']
assert state(a) == after
# No summons: the hand records the draw sequence, so all 40 card instances can be audited.
for _ in range(600):
    s = state(a)
    for token in [a,b]:
        view = state(token)
        assert 'hand' not in view['opponent'] and 'deck' not in view['self']
        assert len(view['self']['hand']) + view['self']['deckCount'] == 40
    if s['paused']:
        break
    active = a if s['activePlayer'] == 1 else b
    ok(BATTLE, '/api/game/next-step', {'requestId':str(uuid.uuid4()),'expectedVersion':s['version']}, active)
else:
    raise AssertionError('Did not reach the expected deck pause')
definitions = {c['cardId']:c for c in master['cards']}
for token, deck in [(a,saved),(b,original)]:
    cards = state(token)['self']['hand']
    assert len(cards) == 40
    assert len({c['instanceId'] for c in cards}) == 40
    assert collections.Counter(c['cardId'] for c in cards) == {e['cardId']:e['count'] for e in deck['cards']}
    for card in cards:
        definition = definitions[card['cardId']]
        assert card['cost'] == definition['cost'] and card['name'] == definition['name']
        assert card['levels'] == definition['levels'] and card['color'] == definition['color']
    print('Draw order:', ', '.join(c['cardId'] for c in cards))
# A second room is independent; randomness does not mathematically guarantee different opening hands.
again = ok(BATTLE, '/api/rooms', {'deckId':saved['deckId']})
assert again['state']['self']['deckCount'] == 36
assert len(again['state']['self']['hand']) == 4
print('Second opening:', [c['cardId'] for c in again['state']['self']['hand']])
print('PASS: D1 saved deck → authenticated master import → 40 unique instances → draw conservation, metadata, privacy, idempotency')
