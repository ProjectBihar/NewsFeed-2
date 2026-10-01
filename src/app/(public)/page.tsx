import Newsfeed from "@/components/public/Newsfeed";
import { DemoNotice, ErrorNotice, NotConfiguredNotice } from "@/components/public/Notices";
import { getFeed } from "@/lib/public/feed";

// Public homepage (Phase 28): the V1 visual shell over the V2 story
// architecture. Phase 29 adds feed modes and navigation.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const feed = await getFeed({ demo: params.demo === "1" });

  const notice = feed.demo ? (
    <DemoNotice />
  ) : !feed.configured ? (
    <NotConfiguredNotice />
  ) : feed.error ? (
    <ErrorNotice message={feed.error} />
  ) : undefined;

  return <Newsfeed stories={feed.stories} notice={notice} demo={feed.demo} />;
}
