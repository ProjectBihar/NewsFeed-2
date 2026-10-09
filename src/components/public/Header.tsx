import Link from "next/link";
import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";

export default function Header({ totalStories }: { totalStories?: number }) {
  return (
    <header className="glass-header sticky top-0 z-50">
      <div className="masthead">
        <Link href="/" className="masthead-brand" aria-label="PrōjectBihar Newsfeed">
          PrōjectBihar <span>Newsfeed</span>
        </Link>
        <div className="masthead-controls">
          {totalStories !== undefined && (
            <span className="masthead-count">
              <span>{totalStories}</span> stories
            </span>
          )}
          <RefreshButton className="glass-pill refresh-control disabled:opacity-50" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
