# Chrome Web Store listing (copy into the developer dashboard)

Title comes from the manifest `name`: **Selfless**. No Google branding in the title or
icon (CLAUDE.md constraint 4); "for Google Scholar" in descriptions is fine.

## Store listing tab

**Summary** (from manifest `description`, max 132 characters):

> Self-citation and co-author citation filters for Google Scholar profiles, computed with OpenAlex.

**Category:** Education (alternative: Tools)

**Language:** English

**Detailed description:**

```
Google Scholar is where most researchers look at citation counts, but it cannot leave out self-citations. Selfless adds that filter to the Scholar profile you are already looking at.

Pick a filter from the menu in the corner of the profile's citation table:

- Excl. author: leaves out citing papers written by the profile owner (classic self-citations).
- Excl. paper's authors: also leaves out citing papers by anyone who co-wrote the cited paper.
- Excl. network: also leaves out citing papers by anyone the owner has ever published with.

The citation count, h-index, i10-index and the citations-per-year chart are recomputed in place and marked with an asterisk. Each paper gets a small line under its Scholar count showing the citations left after the filter. Choosing "No filter" restores Scholar's numbers exactly.

HONEST NUMBERS
Citations are checked against OpenAlex, an open catalogue of scholarly works, which does not see every citation Scholar counts. Selfless always shows how many of Scholar's citations it could verify (for example "313 of 384 citations verified in OpenAlex (82%)"), and the filters apply to that verified part. Papers OpenAlex covers poorly are flagged.

PRIVATE BY DESIGN
- Reads only the Scholar profile page you opened. It never loads other Scholar pages or clicks anything for you.
- Talks only to the OpenAlex API. No server of its own, no analytics, no tracking.
- Settings and results stay in your browser.

A free OpenAlex API key (openalex.org/settings/api) is recommended for large profiles; paste it in the options page.

Open source (MIT): https://github.com/nuletizia/selfless

Selfless is an independent project, not affiliated with or endorsed by Google. Google Scholar is a trademark of Google LLC.
```

**Graphic assets** (in `store/`):

- Icon 128x128: `extension/icons/icon128.png`
- Screenshots 1280x800: `store/screenshot-*.png`
- Small promo tile 440x280: `store/promo-440x280.png`

**Additional fields:**

- Homepage URL: https://github.com/nuletizia/selfless
- Support URL: https://github.com/nuletizia/selfless/issues

## Privacy practices tab

**Single purpose:**

> Shows Google Scholar profile citation counts with self-citations and co-author citations filtered out, using citation data from OpenAlex.

**Permission justifications:**

- `storage`: Saves the user's settings (OpenAlex API key, default filter, author corrections) and caches computed results per profile for 7 days, locally on the device.
- Host permission `https://api.openalex.org/*`: Fetches the author's works and the works citing them from the OpenAlex API, which is the extension's only data source.
- Content script on Google Scholar domains (`scholar.google.*/citations*`): Reads the citation table and paper list of the Scholar profile page the user opened, and shows the filtered figures on that page. Listed per country domain because Scholar serves profiles on many of them.

**Remote code:** No, I am not using remote code. (All JavaScript is in the package.)

**Data usage, "What user data do you plan to collect":** tick

- **Website content**: paper titles from the open Scholar profile are sent to the OpenAlex API to identify the author.
- **Authentication information**: the user's own OpenAlex API key, if entered, is sent only to the OpenAlex API.

Leave everything else unticked. Then certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/nuletizia/selfless/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public (or Unlisted for a first soft launch)
- Regions: all
- Pricing: free
