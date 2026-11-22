# Spike

Feasibility script from 2026-11-22. Results are in the project notes (kept local, not in the repo).

```bash
# Profile A: 21 papers, no Scholar list needed
python3 spike/openalex_filters.py A5052977700 384

# Compare against a Scholar list (see format below)
python3 spike/openalex_filters.py OPENALEX_AUTHOR_ID SCHOLAR_TOTAL scholar_list.txt
```

Set `OPENALEX_API_KEY` to use a personal key. A Scholar list has one line per paper, read from the profile page (one page load):
`count|year|normalized title prefix`. Lists used during the study are kept local in
`spike/data/` (git-ignored).
