# Public timeline

The homepage is one Bihar feed. Topic, event-type and importance inference remain internal metadata; they do not filter or label the public timeline. Relevant sports, entertainment and roundup reports are eligible. Advertorials, failed extraction and reports that fail Bihar relevance remain excluded.

`public_timeline` runs with the caller's existing row-level access rules and returns at most 90 grouped story cards. It filters before pagination and returns the complete matching count. Eligible dates cover today and the preceding six calendar days in Asia/Kolkata. Publisher dates determine recency; undated reports use discovery time and display “First seen”. Future-dated reports wait until their publication time. A genuine new member report can update a story; a duplicate crawl cannot.

Pagination links carry an `asof` timestamp. Reports and membership inserted after that timestamp are excluded until refresh, preventing arrivals from moving page boundaries. Snapshots expire at midnight IST, including open or suspended browser tabs. Refresh returns a paginated homepage to the newest first page. Administrative edits can still alter a snapshot.

Older story metadata remains in Archive and existing story links continue working. The ten-day private temporary-document cleanup is independent. Previously rejected queue entries are not automatically reset: changing publication eligibility affects subsequent processing, without risking an unbounded replay of rejected URLs.

Deploy migration `20261010000002_unified_timeline.sql` before the application. It updates article eligibility and cached story counts and adds the read-only timeline RPC; it does not delete reports, modify source settings, or grant anonymous writes/private-content access.
