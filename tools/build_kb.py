"""Build kb/*.md from the route pages and homepage services.

The knowledge base is generated, never hand-written, so it cannot drift from
what the site says. Every step keeps its source links; yellow "Not yet
confirmed" boxes become UNCONFIRMED notes. Run: python tools/build_kb.py
"""
import html, json, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
SITE = 'https://permitgu.vercel.app'
ROUTES = {
    'food-truck': 'food-truck.html',
    'typhoon-repair': 'typhoon-repair.html',
    'build': 'build.html',
    'clear-grade': 'clear-grade.html',
    'events': 'events.html',
    'zoning': 'zoning.html',
    'public-spaces': 'public-spaces.html',
    'help': 'help.html',
}


def text(fragment):
    """Strip tags and decode entities from an HTML fragment.
    Inline web links keep their URL, so facts cited in the text keep their source."""
    t = re.sub(r'<a [^>]*href="(http[^"]+)"[^>]*>(.*?)</a>', r'\2 (\1)', fragment, flags=re.S)
    t = re.sub(r'<[^>]+>', '', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def links(fragment):
    out = []
    for href, label in re.findall(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', fragment, re.S):
        label = text(label).replace('→', '').strip()
        if href.startswith('mailto:'):
            continue
        out.append((label, html.unescape(href)))
    return out


def route_md(slug, fname):
    s = open(os.path.join(PUBLIC, fname), encoding='utf-8').read()
    title = text(re.search(r'<h1>(.*?)</h1>', s, re.S).group(1))
    intro = text(re.search(r'<header class="route-hero">.*?<p>(.*?)</p>', s, re.S).group(1))
    md = [f'# {title}', '', f'Topic id: `{slug}`. Page: {SITE}/{slug}', '', intro, '']
    summ = re.search(r'<div class="summary">(.*?)</div>', s, re.S)
    if summ:
        head = text(re.search(r'<strong>(.*?)</strong>', summ.group(1), re.S).group(1))
        md += [f'## {head}', ''] + [f'- {text(li)}' for li in re.findall(r'<li>(.*?)</li>', summ.group(1), re.S)] + ['']
    steps = re.search(r'<ol class="steps">(.*)</ol>', s, re.S).group(1)
    for li in re.split(r'<li>(?=<span class="num">)', steps)[1:]:
        h2 = text(re.search(r'<h2>(.*?)</h2>', li, re.S).group(1))
        num = re.search(r'<span class="num">(.*?)</span>', li)
        num = text(num.group(1)) if num else ''
        md += [f'## Step {num}: {h2}' if num not in ('', '+') else f'## Also: {h2}', '']
        who = re.search(r'<p class="who">(.*?)</p>', li, re.S)
        if who:
            md += [f'Who: {text(who.group(1))}', '']
        ul = re.search(r'<ul>(.*?)</ul>', li, re.S)
        if ul:
            md += [f'- {text(x)}' for x in re.findall(r'<li>(.*?)</li>', ul.group(1), re.S)] + ['']
        for chk in re.findall(r'<div class="check">(.*?)</div>', li, re.S):
            md += [f'UNCONFIRMED: {text(chk)}', '']
        lk = re.search(r'<div class="links">(.*?)</div>', li, re.S)
        if lk:
            md += ['Sources:'] + [f'- [{a}]({b})' for a, b in links(lk.group(1))] + ['']
    unk = re.search(r'<div class="open">(.*?)</div>', s, re.S)
    if unk:
        md += ['## Still unknown (do not answer these; send the person to the agency)', '']
        md += [f'- UNCONFIRMED: {text(x)}' for x in re.findall(r'<li>(.*?)</li>', unk.group(1), re.S)] + ['']
    foot = re.search(r'<footer class="foot">.*?<p>(.*?)</p>', s, re.S)
    if foot:
        md += ['## Built from', '', text(foot.group(1)), '']
    return title, '\n'.join(md)


def services_md():
    s = open(os.path.join(PUBLIC, 'index.html'), encoding='utf-8').read()
    md = ['# Other Government of Guam services', '', 'Topic id: `services`. Official sites for common tasks that are not permit routes.', '']
    for k, href, body in re.findall(r'<a class="svc" data-k="([^"]*)" href="([^"]+)"[^>]*>(.*?)</a>', s, re.S):
        name = text(re.search(r'<b>(.*?)</b>', body, re.S).group(1))
        who = text(re.search(r'<small>(.*?)</small>', body, re.S).group(1))
        md.append(f'- {name}: {who}. Official site: {href} (keywords: {k})')
    md += ['', '## Other homepage topics', '']
    for k, body in re.findall(r'<article class="card" data-k="([^"]*)">(.*?)</article>', s, re.S):
        if '/food-truck' in body or '/typhoon-repair' in body or '/build"' in body or '/clear-grade' in body or '/events' in body or '/zoning' in body or '/public-spaces' in body or '/help' in body:
            continue
        name = text(re.search(r'<h3>(.*?)</h3>', body, re.S).group(1))
        para = text(re.search(r'<p>(.*?)</p>', body, re.S).group(1))
        srcs = '; '.join(f'[{a}]({b})' for a, b in links(body))
        md.append(f'- {name}: {para} Sources: {srcs} (keywords: {k})')
    return '\n'.join(md) + '\n'


def main():
    os.makedirs(os.path.join(ROOT, 'kb'), exist_ok=True)
    index = []
    for slug, fname in ROUTES.items():
        title, md = route_md(slug, fname)
        open(os.path.join(ROOT, 'kb', f'{slug}.md'), 'w', encoding='utf-8').write(md)
        index.append({'id': slug, 'title': title, 'file': f'kb/{slug}.md', 'page': f'{SITE}/{slug}'})
    open(os.path.join(ROOT, 'kb', 'services.md'), 'w', encoding='utf-8').write(services_md())
    index.append({'id': 'services', 'title': 'Other Government of Guam services', 'file': 'kb/services.md', 'page': SITE})
    json.dump(index, open(os.path.join(ROOT, 'kb', 'index.json'), 'w', encoding='utf-8'), indent=2)
    # Bundle for the api/ask function so it needs no filesystem access at runtime.
    bundle = {e['id']: {'title': e['title'], 'page': e['page'],
                        'text': open(os.path.join(ROOT, e['file']), encoding='utf-8').read()} for e in index}
    open(os.path.join(ROOT, 'api', '_kb.mjs'), 'w', encoding='utf-8').write(
        '// Generated by tools/build_kb.py. Do not edit by hand.\nexport const KB = ' + json.dumps(bundle, ensure_ascii=False, indent=1) + ';\n')
    for e in index:
        n = len(open(os.path.join(ROOT, e['file']), encoding='utf-8').read())
        print(f"{e['id']:15} {n:6} chars")


if __name__ == '__main__':
    main()
