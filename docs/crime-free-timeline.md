# Crime preference

The main timeline excludes routine crime reports. Government accountability, corruption investigations, policy changes, recruitment results and court decisions with broad public impact remain. Other non-crime reporting remains eligible. Reports are still processed, deduplicated and stored for Archive; this preference does not weaken source/relevance/extraction rules or delete metadata.

`classification.timeline_policy` evaluates the headline and publisher summary, with only a short body fallback if no summary is available. It does not reuse topic categories, significance tiers or generic police/court keywords. English and Hindi signals cover common crime subjects and explicit public-interest exceptions. Decisions and reasons are stored with the article for review. This is a deterministic policy, so ambiguous or euphemistic headlines can still require correction; it is not a guarantee of perfect semantic understanding.

The read-only timeline RPC filters member reports before date filtering, counts and 90-card pagination. Mixed story groups use an eligible report's headline when another member is excluded, avoiding a crime headline on an otherwise eligible card. Archive and individual story pages retain their ordinary public-access rules.

Deploy `20261010000003_crime_free_timeline.sql` before the updated pipeline. Existing article decisions must be backfilled from reviewed headlines and summaries using the same policy; the migration does not guess from the unreliable old article-type labels. Full private text and decision reasons remain unavailable to anonymous readers.
