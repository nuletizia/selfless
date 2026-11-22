"""Feasibility script: self / paper-level / co-author citation shares from OpenAlex.

Usage:
    python3 spike/openalex_filters.py OPENALEX_AUTHOR_ID [SCHOLAR_TOTAL [SCHOLAR_LIST]]

SCHOLAR_LIST is an optional text file with one line per Scholar paper:
    count|year|normalized title prefix   (lowercase, alphanumerics and spaces only)
Set OPENALEX_API_KEY in the environment to use a personal key.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import defaultdict

API = "https://api.openalex.org"
KEY = os.environ.get("OPENALEX_API_KEY")
OWNER = sys.argv[1]
SCHOLAR_TOTAL = int(sys.argv[2]) if len(sys.argv) > 2 else None
LIST = sys.argv[3] if len(sys.argv) > 3 else None


def get(path, **params):
    if KEY:
        params["api_key"] = KEY
    url = f"{API}/{path}?" + urllib.parse.urlencode(params, safe=":*|,")
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            err = e
            print("HTTP", e.code, e.read()[:300], file=sys.stderr)
        except Exception as e:
            err = e
        time.sleep(2 * (i + 1))
    raise err


def all_pages(path, **params):
    # page= paging works without an API key; cursor= paging needs one.
    out, page = [], 1
    while True:
        d = get(path, per_page=200, page=page, **params)
        out += d["results"]
        if len(out) >= d["meta"]["count"] or not d["results"]:
            return out
        page += 1


short = lambda u: u.rsplit("/", 1)[-1]
aids = lambda w: {short(a["author"]["id"]) for a in w["authorships"] if a["author"].get("id")}
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", re.sub(r"<[^>]+>", "", s or "").lower())

works = all_pages("works", filter=f"author.id:{OWNER}",
                  select="id,title,publication_year,cited_by_count,authorships")
W = {short(w["id"]): w for w in works}
coauthors = set().union(*(aids(w) for w in works)) - {OWNER}

# Citing works in batches of 50 cited IDs, attributed through referenced_works.
cites = defaultdict(dict)  # cited id -> {citing id: author ids}
ids = [i for i, w in W.items() if w["cited_by_count"]]
for k in range(0, len(ids), 50):
    batch = ids[k:k + 50]
    for cw in all_pages("works", filter="cites:" + "|".join(batch),
                        select="id,authorships,referenced_works"):
        a = aids(cw)
        for r in cw.get("referenced_works") or []:
            if short(r) in W:
                cites[short(r)][short(cw["id"])] = a

network = coauthors | {OWNER}
stats = {}
for i, w in W.items():
    pa = aids(w)
    c = dict(all=0, own=0, paper=0, coauth=0)
    for a in cites[i].values():
        c["all"] += 1
        c["own"] += OWNER in a
        c["paper"] += bool(a & pa)
        c["coauth"] += bool(a & network)
    stats[i] = c

tot = {k: sum(s[k] for s in stats.values()) for k in ("all", "own", "paper", "coauth")}
print(f"OpenAlex works {len(works)}, co-authors {len(coauthors)}")
print("Citing totals", tot)
if tot["all"]:
    print(f"Shares: self {tot['own']/tot['all']:.1%}  paper-level {tot['paper']/tot['all']:.1%}"
          f"  co-author {tot['coauth']/tot['all']:.1%}")
if SCHOLAR_TOTAL:
    print(f"Scholar total {SCHOLAR_TOTAL}, coverage {tot['all']/SCHOLAR_TOTAL:.1%}")

if not LIST:
    for i, w in sorted(W.items(), key=lambda x: -stats[x[0]]["all"]):
        s = stats[i]
        print(f"{s['all']:5d} {s['own']:4d} {s['paper']:4d} {s['coauth']:4d}  "
              f"{w['publication_year']} {(w['title'] or '')[:60]}")
    sys.exit()

# Match the Scholar list by normalized title prefix.
by_prefix = defaultdict(list)
for i, w in W.items():
    by_prefix[norm(w["title"]).replace(" ", "")[:20]].append(i)
sch = [l.split("|") for l in open(LIST).read().splitlines() if l]
rows, miss, used = [], [], set()
for c, y, t in sch:
    cand = [i for i in by_prefix.get(t.replace(" ", "")[:20], []) if i not in used]
    if cand:
        i = max(cand, key=lambda i: stats[i]["all"])
        used.add(i)
        rows.append((int(c), stats[i], y, t))
    else:
        miss.append((int(c), y, t))
ms, mo = sum(r[0] for r in rows), sum(r[1]["all"] for r in rows)
print(f"Scholar list: {len(sch)} papers, matched {len(rows)}, "
      f"Scholar {ms} vs OpenAlex {mo} ({mo/max(ms, 1):.1%})")
print("Weakest coverage (Scholar -> OpenAlex):")
for c, s, y, t in sorted(rows, key=lambda r: r[1]["all"] / max(r[0], 1))[:10]:
    print(f"  {c:4d} -> {s['all']:4d}  {y} {t}")
print("Unmatched (Scholar count, year, title):")
for m in miss:
    print("  ", *m)
