# Selected Bihar source expansion — 2026-10-10

The user selected only Patna Press, NDTV India/NDTV, ABP Live Bihar, Aaj Tak,
Bihar Tak, ETV Bharat Bihar, Zee Bihar Jharkhand, TV9 Bharatvarsh, Navbharat Times
Bihar, The New Indian Express, and the listed official channels. The existing
fourteen sources are retained. No other candidate newsroom was added.

The registry now contains 67 source entries and 79 endpoints: 11 additional
newsroom/language channels, four official organizations/portals, and all 38
district administrations. IPRD, education and health have separate endpoints
under one government-portal source because the foundation requires unique domains.
NewsTak's published Bihar section is the current Bihar Tak channel; the old
bihartak.in domain did not resolve. The New Indian Express is distinct from
the existing Indian Express. Related ownership is recorded in registry notes.

## Collection and publication

- Patna Press is first in the expansion and uses its publisher-advertised RSS.
- Publisher-specific article patterns exclude menus and pagination. Feeds precede
  section scraping. Bihar relevance remains mandatory for publication.
- NDTV publishes readable RSS but returns HTTP 403 for article downloads from
  GitHub. Its explicit feed-only mode stores only the actual publisher summary,
  title, date and original article link in temporary storage, without article
  downloads. The interface labels this mode. Summary-only reports never become
  Curated and are not full-article evidence. A feed with no current Bihar items
  is a successful empty poll, not fabricated coverage.
- Official PDF text is bounded at 8 MB, 20 pages and 200,000 characters. Listing
  titles and dates are preserved. Encrypted, scanned or unreadable PDFs are
  rejected with diagnostics; OCR is not implemented. District attachments may
  use the official S3WAAS government CDN. Arbitrary foreign PDF hosts are rejected.
- Each official source is bounded at 40 new URLs per run and 10 per endpoint,
  preventing a large IPRD archive from starving education or health channels.
- Bodies, raw HTML and encoded PDFs remain in the existing ten-day temporary
  store. The public archive holds metadata and original source links.
- Public issuer intermediates complete verified official-site TLS chains; no
  certificate validation or hostname checks are disabled.

## Evidence and limits

[Initial hosted verification](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37986222426)
confirmed the nine full-article newsroom channels and most official listings.
It exposed NDTV article blocking and missing BSDMA/railway TLS intermediates,
which prompted the supported feed-summary path and verified certificate bundle.
The final hosted rerun and production publication evidence will be recorded
after verification. Production activation waits for those results and full CI.

East Champaran is registered inactive because the directory-listed host has a
certificate hostname mismatch. Some district listings have no current notices;
an empty channel does not mean articles were ingested. Railway collection covers
homepage document announcements; a dedicated train press-release listing remains
unlocated. Scanned government notices need an OCR follow-up before full coverage.

Run the discover workflow with `verify-expansion=true` for a read-only host
check. It skips live database writes and saves the verification artifact.
The additive migration preserves existing IDs, checkpoints, articles and live
endpoint pauses. Historical seed migrations are unchanged.
