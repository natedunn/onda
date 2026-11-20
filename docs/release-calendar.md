# Release calendar

`/releases` shows what's coming out, and `/releases/{kind}` steps through it by
month. A daily cron per kind (`convex/crons.ts`) runs `releases.sync`, which calls
that provider's `upcoming` in `convex/providers.ts`. Releases are saved as ordinary
records, so item pages and adding to lists work, plus one `releases` row with the
date. Rows no sync has found for 3 days are dropped. `/admin` shows each job's
recent runs, the cover queue, and dates that moved.

| Kind | Source | Cut | Score |
|---|---|---|---|
| Movies | TMDB, first US release | Digital-only needs popularity 1+ | TMDB popularity |
| Shows | TMDB, next dated season | New series need popularity 1+ | TMDB popularity |
| Albums | MusicBrainz dump via `workers/music` | Score 3+, or artist on a list | Artist's best `boost` |
| Games | IGDB | 2+ hypes | IGDB hypes |

Scores only compare within a kind. Numbers below are from November 2026.

## Known issues

### Movies

- **The indie label is rough.** It means no name in `MAJOR_STUDIOS` appears among
  TMDB's production companies, and that data is thin. *Godzilla Minus Zero* and
  *I Play Rocky* both count as indie. Adding studios helps but won't fully fix it;
  a label like "smaller releases" may be more honest.
- **Some obscure digital titles remain.** The popularity floor removed about half
  of them, not all.

### Shows

- **Annual events count as seasons**, such as *Melodifestivalen* "Season 66" and the
  Actor Awards. Filtering them would take a hand-kept list.
- **Shows aren't limited by country**, so non-US shows reach the overview, like the
  Dutch *Sinterklaasjournaal*. That's good for international shows but less familiar
  to a US audience. Limiting it is a small change to `upcomingShows`.
- **Returning shows are probably undercounted.** A show needs a dated season on TMDB
  and a top-100 rank among shows airing that month. Only 65 of 289 are returning.
- **There's no indie toggle.** TMDB has no useful signal for shows.

### Albums

- **New artists can be missed.** Scores come from an artist's earlier work, so a new
  artist with no history only appears if they're on someone's list. This is the main
  gap for indie musicians.
- **Matching a list compares the full credit**, so "A & B" won't match a list that
  holds "A".
- **Dates lag by a few days.** MusicBrainz dumps come out on Wednesdays and Saturdays.
- **Months further out are thin**, because coverage depends on what MusicBrainz
  editors have added.
- **Many upcoming albums have no cover yet**, because nobody has added one to Cover
  Art Archive. They show the placeholder. A daily job (`releaseArt.copyDue`) copies
  covers to R2 once they appear, so the calendar doesn't depend on archive.org
  staying up. It checks for a missing cover again after 7 days, or after 2 days when
  the release is within 2 weeks. In late November 2026, about 250 albums were copied
  and about 35 were waiting.
- **Albums already out when first seen keep loading from Cover Art Archive.** The
  job only queues unreleased albums, so during an archive.org outage those covers
  disappear from the current month. Including them would be a small change to
  `artQueue` in `convex/releases.ts`.
- **A failed copy waits 12 hours.** archive.org storage nodes sometimes return
  errors for one file. The job skips that album and stops only after 5 failures in a
  row, so an outage ends the run early and the next day's run continues.
- **There's no indie toggle.** Nothing in the data says what's indie.
- **The list lookup reads every list item once a day** (`releases.listedCreators`).
  That's fine now, but worth revisiting if `items` gets very large.

### Games

- **More than half of hyped games have only a year or quarter**, and many of those
  are stale. They live on the "date TBA" page. Games dated only "2026" are especially
  likely to have slipped without an update.

### The mirror import

- **D1 sometimes times out on the upload.** The import is a 277 MB file, and 2 of the
  last 10 runs failed. It rolls back, search keeps working on the live slot, and the
  next daily run retries. A forced rerun is safe.

## Books are paused

Open Library has too few upcoming books to build on: about 29 allowlisted-publisher
works across 2027–2028, 7 with covers and 3 with want-to-read counts. Its dates are
mostly exact when they exist, but they're free text and can't be searched by range.

We left books out rather than take on the maintenance. The idea for later is an agent
that scrapes lists to build a curated list of our own. Hardcover is an untested
alternative: its API may not filter by release date, and it needs a token that resets
yearly. Either way, item pages are keyed to Open Library IDs, so a book that isn't on
Open Library yet needs a mapping.
