# Selfless

**Citation filters for Google Scholar.** Open a Scholar profile and see how many of its
citations come from outside the author's own circle.

> Status: early development. The extension in `extension/` runs from source but has not
> been released.

Google Scholar is the citation page most researchers actually use, but it cannot exclude
self-citations. Scopus and Web of Science can, behind a subscription and on their own
numbers. Selfless adds the missing filters to the Scholar page you are already looking at.

## The three filters

Each level removes everything the previous one removes, plus more.

| Citing paper written by | 1. Self | 2. Paper-level | 3. Co-author |
|---|---|---|---|
| The profile owner | removed | removed | removed |
| A co-author of the cited paper, without the owner | kept | removed | removed |
| Someone who co-authored *another* paper with the owner | kept | kept | removed |
| Someone with no publication link to the owner | kept | kept | kept |

1. **Self-citations.** The profile owner is an author of the citing paper. The classic
   "excluding self-citations" figure.
2. **Paper-level self-citations.** Any author of the cited paper is an author of the
   citing paper. Matters most for supervisors and group leads, who sit on many papers.
3. **Co-author citations.** Anyone the owner has ever published with is an author of the
   citing paper. The strictest view: citations from outside the owner's network.

For each filter Selfless shows the filtered citation count per paper (an extra column
next to Scholar's own count, which is left untouched) and a recomputed total, h-index
and i10-index. The filter is off when a profile opens. Totals cover every work of the
author in OpenAlex, not only the rows Scholar shows before "Show more"; a paper
breakdown panel lists them all.

## How it works

- A Chrome extension reads the profile's paper list from the Scholar page **you loaded**.
  It never requests Scholar pages itself, so there is no scraping and no CAPTCHA risk.
- Each paper is matched to [OpenAlex](https://openalex.org), an open catalogue of
  scholarly works with full author lists and citation links.
- The citing works and their authors come from OpenAlex, and the filters are computed
  locally in your browser. Nothing is sent anywhere except the OpenAlex API.

## Coverage: read this before trusting a number

OpenAlex does not see every citation Scholar counts. Scholar also indexes theses, books,
slides and duplicate versions. Selfless always shows **how much of the Scholar count it
could verify**, and the filters apply to that verified part.

From the feasibility study:

| Profile | Scholar | Found in OpenAlex | Self | Paper-level | Co-author |
|---|---|---|---|---|---|
| Early-career, 21 papers | 384 | 81.5% | 17.9% | 29.1% | 29.1% |
| Senior, 300+ papers | 9,600 | 63.4% (about 75% without books) | 19.4% | 22.6% | 33.8% |

The percentages (what share of citations are self or network citations) are robust.
Absolute filtered totals are reliable where coverage is high: recent journal and
conference papers. Books and older work (before about 2010) are under-covered, and
Selfless flags them. Theses, which cite their own author heavily, are mostly missing
from OpenAlex, so the self-citation rates are probably a lower bound.

## OpenAlex API key

Without a key, OpenAlex gives every IP address a small shared daily budget and blocks
cursor paging. A free personal key (openalex.org/settings/api) is enough for any single
profile. Selfless will ask you to paste one in its options page.

## Run from source

1. Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick
   the `extension/` folder.
2. Paste your OpenAlex API key in the options page that opens (optional, recommended).
3. Open any Google Scholar profile.

Tests for the filter logic: `npm test` (Node 20 or later, no dependencies).

## Not affiliated with Google

Selfless is an independent open-source project. It is not made, endorsed or supported
by Google. "Google Scholar" is a trademark of Google LLC.

## License

MIT, see [LICENSE](LICENSE).
