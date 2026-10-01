-- ProjectBihar Newsfeed V2 — Phase 3: Source registry seed.
--
-- GENERATED FILE. Do not hand-edit.
-- Source: data/sources/registry.json
-- Regenerate: npm run registry:generate
-- Registry version: 1, verified: 2026-09-28
-- Sources: 14, endpoints: 23

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('The Hindu', 'thehindu.com', 'en', 'national', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'rss', 'https://www.thehindu.com/feeder/default.rss', TRUE, 'high' FROM public.sources WHERE domain = 'thehindu.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.thehindu.com/sitemap/googlenews/all/all.xml', TRUE, 'high' FROM public.sources WHERE domain = 'thehindu.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Indian Express', 'indianexpress.com', 'en', 'national', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'rss', 'https://indianexpress.com/feed/', TRUE, 'high' FROM public.sources WHERE domain = 'indianexpress.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://indianexpress.com/news-sitemap.xml', TRUE, 'high' FROM public.sources WHERE domain = 'indianexpress.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Dainik Jagran', 'jagran.com', 'hi', 'national', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.jagran.com/bihar/', TRUE, 'medium' FROM public.sources WHERE domain = 'jagran.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.jagran.com/news-sitemap.xml', TRUE, 'high' FROM public.sources WHERE domain = 'jagran.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Amar Ujala', 'amarujala.com', 'hi', 'national', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.amarujala.com/bihar', TRUE, 'medium' FROM public.sources WHERE domain = 'amarujala.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.amarujala.com/sitemap-news-v1.xml', TRUE, 'high' FROM public.sources WHERE domain = 'amarujala.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Times of India Patna', 'timesofindia.indiatimes.com', 'en', 'bihar', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://timesofindia.indiatimes.com/city/patna', TRUE, 'medium' FROM public.sources WHERE domain = 'timesofindia.indiatimes.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'sitemap', 'https://timesofindia.indiatimes.com/sitemap/today', TRUE, 'high' FROM public.sources WHERE domain = 'timesofindia.indiatimes.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Hindustan Times Patna', 'hindustantimes.com', 'en', 'bihar', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.hindustantimes.com/cities/patna-news', TRUE, 'medium' FROM public.sources WHERE domain = 'hindustantimes.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.hindustantimes.com/sitemap/news.xml', TRUE, 'high' FROM public.sources WHERE domain = 'hindustantimes.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Dainik Bhaskar Bihar', 'bhaskar.com', 'hi', 'bihar', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.bhaskar.com/local/bihar/', TRUE, 'medium' FROM public.sources WHERE domain = 'bhaskar.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.bhaskar.com/sitemaps-v1--sitemap-google-news-index.xml', TRUE, 'high' FROM public.sources WHERE domain = 'bhaskar.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Prabhat Khabar', 'prabhatkhabar.com', 'hi', 'bihar', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.prabhatkhabar.com/state/bihar', TRUE, 'medium' FROM public.sources WHERE domain = 'prabhatkhabar.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.prabhatkhabar.com/news-sitemap.xml', TRUE, 'high' FROM public.sources WHERE domain = 'prabhatkhabar.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Live Hindustan Bihar', 'livehindustan.com', 'hi', 'bihar', 'news', 'high', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.livehindustan.com/bihar/', TRUE, 'medium' FROM public.sources WHERE domain = 'livehindustan.com'
ON CONFLICT (url) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'news_sitemap', 'https://www.livehindustan.com/news-sitemap.xml', TRUE, 'high' FROM public.sources WHERE domain = 'livehindustan.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('News18 Bihar', 'hindi.news18.com', 'hi', 'bihar', 'news', 'medium', FALSE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://hindi.news18.com/news/bihar/', FALSE, 'medium' FROM public.sources WHERE domain = 'hindi.news18.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Economic Times', 'economictimes.indiatimes.com', 'en', 'national', 'news', 'medium', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'rss', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', TRUE, 'high' FROM public.sources WHERE domain = 'economictimes.indiatimes.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Mongabay India', 'india.mongabay.com', 'en', 'national', 'news', 'medium', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'rss', 'https://india.mongabay.com/feed/', TRUE, 'high' FROM public.sources WHERE domain = 'india.mongabay.com'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('Press Information Bureau', 'pib.gov.in', 'en', 'national', 'official', 'high', FALSE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://www.pib.gov.in/', FALSE, 'medium' FROM public.sources WHERE domain = 'pib.gov.in'
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
VALUES ('PRS Legislative Research', 'prsindia.org', 'en', 'national', 'institutional', 'low', TRUE)
ON CONFLICT (domain) DO NOTHING;
INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)
SELECT id, 'section', 'https://prsindia.org/', TRUE, 'low' FROM public.sources WHERE domain = 'prsindia.org'
ON CONFLICT (url) DO NOTHING;
