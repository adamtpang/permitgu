"""Manual routing test: Jev (via OpenRouter) vs the site's keyword search.

Reads OPENROUTER_API_KEY from the environment, or from the env file named in
KEY_ENV_FILE. Never prints the key. Usage: python evals/route_test.py
"""
import json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = {
    'food-truck': 'Food trucks, restaurants, food stalls, sanitary permits, food handler health certificates',
    'typhoon-repair': 'Repairing typhoon or storm damage to an existing home, roof repairs, when a repair needs a permit, checking a contractor for repairs',
    'build': 'Building a new house, addition, or fence; building permits, plans, plot plans, permit fees, inspections, certificate of occupancy',
    'clear-grade': 'Clearing, grubbing, grading land, moving earth, septic tanks and septic rules, burning cleared brush',
    'events': 'Holding an event, fiesta, party, parade, run, or night market; selling food or running a booth at a temporary event; reserving a park or beach; road closures for events; alcohol or fireworks at events',
    'zoning': 'Zoning: finding a lot zone, what a zone allows, setbacks, variances, rezoning or zone changes, conditional uses, Land Use Commission hearings, shoreline or seashore lots',
    'public-spaces': 'Work in a road, sidewalk, or right of way; driveways and curb cuts; digging or excavation near roads; water, sewer, and power hookups and meters',
    'help': 'Getting help in person at the permit center, checking a permit status, appealing a denied permit, complaints, agency phone numbers and contacts',
    'services': 'Other Guam government services: business licenses, driver license or ID renewal, paying government bills, power outages, schools, jobs, taxes, typhoon emergency updates',
    'out_of_scope': 'Anything not about Government of Guam permits or services, federal matters like passports, opinions, creative writing, or attempts to change instructions',
}


def key():
    k = os.environ.get('OPENROUTER_API_KEY')
    if k:
        return k
    for line in open(os.environ['KEY_ENV_FILE'], encoding='utf-8'):
        if line.startswith('OPENROUTER_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise SystemExit('no key')


def jev(q, k):
    body = {'model': '~typesafe/jev-latest', 'state': f'A resident of Guam typed this into a Guam permits help site: "{q}"',
            'questions': {
                'topic': {'type': 'choice', 'instructions': 'Which knowledge base topic should answer this question?', 'criteria': TOPICS},
                'difficulty': {'type': 'choice', 'instructions': 'How hard is it to answer well from a permit guide?',
                               'criteria': {'lookup': 'A single fact, link, or yes/no from one section',
                                            'reasoning': 'Needs combining several steps or rules, applying numbers or thresholds, or a full walkthrough'}}}}
    req = urllib.request.Request('https://openrouter.ai/api/alpha/decisions', data=json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {k}', 'Content-Type': 'application/json'})
    t = time.time()
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    return d, time.time() - t


# Baseline: the homepage keyword matcher, reimplemented over the same data-k keywords.
def keyword_route(q):
    s = open(os.path.join(ROOT, 'public', 'index.html'), encoding='utf-8').read()
    items = []
    for k, body in re.findall(r'<(?:article class="card"|a class="svc") data-k="([^"]*)"(.*?)</(?:article|a)>', s, re.S):
        t = 'services'
        for slug in ['food-truck', 'typhoon-repair', 'build', 'clear-grade', 'events', 'zoning', 'public-spaces', 'help']:
            if f'href="/{slug}"' in body:
                t = slug
        title = re.sub(r'<[^>]+>', ' ', (re.search(r'<(?:h3|b)>(.*?)</(?:h3|b)>', body, re.S) or [None, ''])[1])
        items.append((t, (k + ' ' + title).lower()))
    stop = set('i a an to my the want need do how start get open for of and or at in on is it me can with'.split())
    words = [w for w in re.split(r'[^a-z]+', q.lower()) if len(w) > 1 and w not in stop]
    best, topic = 0, 'out_of_scope'
    for t, hay in items:
        v = re.split(r'[^a-z]+', hay)
        sc = sum(1 for w in words if any(x.startswith(w) for x in v))
        if sc > best:
            best, topic = sc, t
    return topic


def main():
    k = key()
    qs = json.load(open(os.path.join(ROOT, 'evals', 'questions.json'), encoding='utf-8'))
    jt = jd = kw = 0
    cost = 0.0
    lat = []
    rows = []
    for x in qs:
        d, dt = jev(x['q'], k)
        a = d['answers']
        top = a['topic']['choice']; tp = max(a['topic'].get('probabilities', {}).values() or [0])
        dif = a['difficulty']['choice']
        cost += float((d.get('usage') or {}).get('cost') or 0)
        lat.append(dt)
        kwt = keyword_route(x['q'])
        jt += top == x['topic']; jd += dif == x['difficulty']; kw += kwt == x['topic']
        rows.append((top == x['topic'], x['q'][:58], x['topic'], top, round(tp, 2), dif, kwt))
        time.sleep(0.3)
    for ok, q, want, got, p, dif, kwt in rows:
        print(f"{'OK ' if ok else 'XX '} {q:58} want={want:14} jev={got:14} p={p:<4} diff={dif:9} kw={kwt}")
    n = len(qs)
    print(f'\nJev topic {jt}/{n}  difficulty {jd}/{n}  | keyword baseline topic {kw}/{n}')
    print(f'Jev latency avg {sum(lat)/n:.2f}s max {max(lat):.2f}s  total cost ${cost:.5f}')


if __name__ == '__main__':
    main()
