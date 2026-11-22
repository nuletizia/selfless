# Privacy policy

Selfless is a browser extension that adds citation filters to Google Scholar profile
pages. This policy describes what it does with data. Last updated: 22 November 2026.

## What Selfless reads

When you open a Google Scholar profile, Selfless reads from that page: the profile
name, the citation table, the citations-per-year chart and the list of papers (titles,
years and citation counts). It reads only the page you opened; it never loads other
Scholar pages.

## What Selfless sends, and to whom

Selfless sends requests only to the OpenAlex API (`api.openalex.org`), an open catalogue
of scholarly works run by OurResearch. These requests contain:

- titles of papers from the profile, to find the author in OpenAlex;
- OpenAlex identifiers of the author and their works, to fetch citing works;
- your OpenAlex API key, if you entered one in the options page.

OpenAlex's own privacy policy applies to these requests. Selfless sends nothing to its
developer or to anyone else. There is no backend server, no analytics, no tracking and
no advertising.

## What Selfless stores

In your browser's local extension storage (`chrome.storage.local`), on your device only:

- your settings: OpenAlex API key, default filter and any author corrections you made;
- computed results per Scholar profile, kept for 7 days so revisits need no new
  requests.

Nothing is stored in sync storage or in your Google account. You can clear the cache
from the options page; removing the extension deletes everything.

## What Selfless does not do

It does not collect personal information about you, does not read your browsing
history, does not read any page other than Google Scholar profile pages, does not sell
or share data, and does not use data for any purpose other than showing the filters.

## Contact

Questions or issues: https://github.com/nuletizia/selfless/issues
