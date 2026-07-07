# YouTube Transcript Fetcher & Video Analyzer

Add YouTube-aware handling to the chat backend so any YouTube link in a user message triggers transcript extraction and switches the AI into a strict "Video Analyst" mode.

## What the user will see

- Paste a YouTube link (e.g. `youtube.com/watch?v=…`, `youtu.be/…`, Shorts, embed, live) and ask a question — the AI answers strictly from the video's captions.
- Ask for a "summary" → structured response: 2-3 sentence Overview, 5-8 Key Takeaways with rough timestamps, short Conclusion.
- Quotes and references include `[mm:ss]` (or `h:mm:ss`) timestamps and a `[n]` video citation.
- If captions aren't available or the video is restricted, the chat shows: *"Sorry, I couldn't fetch the transcript for this video. It might not have closed captions enabled."*
- Mixing YouTube + regular web links in one message still works — YouTube gets the transcript path, other URLs continue to go through Firecrawl.

## Scope

- Backend only: `src/routes/api/chat.ts`.
- Adds one dependency: `youtube-transcript` (npm).
- No UI file changes. No database changes. No new secrets.

## Technical details

**Dependency**
- `bun add youtube-transcript` — a small, fetch-based library that works in the Cloudflare Workers runtime used by TanStack Start server routes.

**URL detection (`src/routes/api/chat.ts`)**
- Extend existing URL extractor. For each URL found in the latest user message, run `extractYouTubeId(url)`:
  - Accepts `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, `/embed/ID`, `/live/ID`, plus `www.` / `m.` / `music.` subdomains.
  - Rejects anything else.
- Split extracted URLs into `ytEntries` (YouTube) and `otherUrls` (everything else).

**Transcript fetch**
- For each `ytEntries` item: `YoutubeTranscript.fetchTranscript(videoId)`.
- Format each caption line as `[mm:ss] text` (or `h:mm:ss` for long videos); decode common HTML entities (`&amp;`, `&#39;`, etc.).
- Cap total transcript at ~24 000 characters per video; append `[transcript truncated for length]` when trimmed.
- Fetch multiple videos in parallel with `Promise.all`.

**Context injection & system prompt**
- If at least one transcript succeeds, prepend a `videoContext` block to the system prompt with:
  - `--- VIDEO [n]` header, URL, video ID, and the timestamped transcript.
  - "You are a Video Analyst" rules: answer strictly from the transcript; cite `[n]`; include timestamps; explicit summary format; refuse to guess when the transcript doesn't cover the question.
- If **every** YouTube transcript fails, short-circuit the request and return the friendly plain-text error message (HTTP 200, `text/plain`) so the chat UI displays it immediately instead of streaming a hallucinated answer.

**Firecrawl coexistence**
- Non-YouTube URLs continue through the existing Firecrawl scrape path unchanged; only `otherUrls` are passed to Firecrawl now.

**Final prompt assembly**
- `sys = user system prompt + COMPARISON_RULES + videoContext + urlContext` — order preserved so the Video Analyst rules take precedence when a video is present.

## Files touched

```text
src/routes/api/chat.ts     add YouTube detection, transcript fetch, video-analyst prompt, error short-circuit
package.json               add youtube-transcript dependency
```

## Out of scope

- No timestamp deep-linking in the UI (rendering `[mm:ss]` as clickable `?t=` links).
- No caching of transcripts across requests.
- No language selection UI — library defaults to the video's default caption track.
