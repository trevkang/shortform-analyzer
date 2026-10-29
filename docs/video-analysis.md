# Video analysis

The record shortform-analyzer extracts from one short-form video: the whole video, each of its scenes and, for videos
that sell or ask for a comment, its top comments. The record is fixed: these fields, values and rules are the package's
opinion, and every caller gets the same ones. Your own questions are added next to it, never into it
([concepts.md](concepts.md#what-you-can-change)).

Its job is the recipe: how the video is made, so someone could make one like it, plus a coarse topic to filter by.
A field is here only because a search reads it. What a pitched product does belongs to the account that sells it, not
to the video.

Each field is filled in one of three ways. **Decide** fields have a closed list of values, picked by one Decisions
request. **Describe** fields are text, written by one describe request (Responses with a JSON schema). **Code** fields
are computed without a model. The decide request also reads what the describe request wrote.

Both requests see each scene's frame and spoken words, plus what TikTok already gives, when the input is a TikTok post:
the account that posted it, the caption, hashtags, sticker text, topic labels, commercial tags (paid partnership,
commission, promotional, ran as an ad), whether TikTok labels it AI-generated, effects such as Green Screen, and the
sound (its title, and whether it is the creator's own). The
requests can't hear the audio, so without the sound's title a lip-sync's lyrics would read as speech. All of this is
input only: none of it is copied into a field, and the post itself is kept in `raw.post`.

## Video

| Field | Step | Values |
|---|---|---|
| `topic` | decide | `beauty` · `fashion` · `gaming` · `tech` · `education` · `business_money` · `entertainment` · `music_dance` · `food` · `fitness_sports` · `shopping` · `lifestyle` · `other` |
| `format` | decide | `tutorial` · `listicle` · `before_after` · `review` · `storytime` · `skit` · `performance` · `reaction` · `highlight` · `interview` · `vlog` · `talking_head` · `other` |
| `sells` | decide | `none` · `software` · `physical_goods` · `service` · `digital_content` · `other` |
| `asksForComment` | decide | yes · no |
| `product` | describe | the name of the product the video pitches, or their names, separated by commas; empty when it pitches none |
| `tags` | describe | 5–10 single words |
| `description` | describe | what the video is about, in a few sentences |
| `formatDescription` | describe | how it is made, so someone could remake it about something else |
| `media` | code | `video` · `photos` (a TikTok photo post, shown as a slideshow) |
| `duration` | code | seconds; for photos, the number of photos |
| `speech` | code | where the scenes' `spoken` words came from: `subtitles` · `transcription` · `none` ([Speech](#speech)) |

### topic

The top-level subject. It stays coarse on purpose: the specifics are in `tags`. Searches like "small cosmetics creators"
or "gameplay edits" filter on it. TikTok's own topic label, when the post has one, goes to the decide request as a
hint. Rules, applied before the table:

1. The topic is what the video is about once the person and the tone are removed.
2. `tech` only when the tool's own capability is the point. An app used for a life outcome takes the outcome's topic.
3. A lesson about a subject takes that subject's topic. `education` covers learning itself (studying, exams, school,
   languages) and science facts.
4. One product reviewed takes that product's topic; several unrelated products are `shopping`.
5. Genre and humor are never a topic: a funny skit about exam week is `education`.

| Value | Covers | Example | Near miss → goes to |
|---|---|---|---|
| `beauty` | skincare, makeup, hair, nails, body care | "5-minute no-makeup makeup" | "Wedding guest outfit" → `fashion` |
| `fashion` | clothes, shoes, accessories, styling | "3 ways to style a blazer" | "Wedding hair" → `beauty` |
| `gaming` | video games, esports | "1v5 clutch in Valorant" | "Board game night" → `lifestyle` |
| `tech` | apps, AI tools, gadgets, software | "This AI turns your selfie into a 90s yearbook photo"; "AI makes my professor's face funny" | "I lost 8 kg with a calorie app" → `fitness_sports`; an exam-week skit → `education` |
| `education` | studying, exams, school, languages, science facts | "Memorize 100 words a day"; "why the sky is blue" | "How compound interest works" → `business_money` |
| `business_money` | personal finance, investing, careers, running a business, growing a page | "How I budget ₩3M a month"; "How I got hired at Naver" | "Daiso finds under ₩5,000" → `shopping` |
| `entertainment` | film, TV, celebrities, anime, comics, pop culture | "Squid Game 2 ending explained"; celebrity news | "Piano cover of a drama OST" → `music_dance` |
| `music_dance` | music, singing, dance, instruments | "Piano cover"; "dance tutorial" | A skit set to a trending sound → the skit's subject |
| `food` | cooking, recipes, restaurants, drinks | "3-ingredient tteokbokki" | "High-protein meals for a cut" → `fitness_sports` |
| `fitness_sports` | workouts, health, wellbeing, sports | "10-min ab workout"; "Messi's best goals" | "A gym outfit haul" → `fashion` |
| `shopping` | hauls, deals, finds across unrelated products | "Daiso finds under ₩5,000"; a haul | A review of one serum → `beauty` |
| `lifestyle` | daily life, home, family, relationships, travel, pets, hobbies | "Day in my life"; "Studio apartment makeover"; "Hidden cafés in Seongsu" | "What I eat in a day" → `food` |
| `other` | everything else: news, politics, religion, cars | "What the new rent law means"; "Ioniq 6 range test" | |

### format

What kind of video it is, whatever it is about, named the way creators and ad-analytics tools name formats: "5 apps
every student needs" and "5 summer lip tints" are both `listicle`. It is the core of the recipe: search uses it to find
videos made the same way in any industry, such as a recipe from beauty that would work for an app. Tags can't do this
job: they are free words, so they don't group.

| Value | Test | Example | Near miss → goes to |
|---|---|---|---|
| `tutorial` | Shows how to do or use something, step by step. | "Remove a background in CapCut"; a recipe; an app walkthrough | "5 CapCut tricks" → `listicle`; one product tried and judged → `review` |
| `listicle` | Goes through several things one by one, telling the viewer about each (tips, apps, products, places), or compares options. | "5 apps every student needs"; "ChatGPT vs Claude for essays" | One tip → `talking_head`; moments to watch, even ranked → `highlight` |
| `before_after` | Shows the same thing before and after. | "Day 1 vs Day 90 on a skin app"; a room makeover; an AI face reveal | A makeup look done step by step → `tutorial` |
| `review` | Tries one product and says what they think of it. | an unboxing; "I used this serum for a week" | Several products → `listicle`; the result shown with no verdict → `before_after` |
| `storytime` | Tells something that happened. | "Storytime: my landlord tried to scam me" | Acted out → `skit` |
| `skit` | An acted scene, including one lip-synced to a sound. | "POV: mom finds your screen time"; a comedy sketch | Told to camera → `storytime` |
| `performance` | Dancing, singing, playing music or lip-syncing a song. | a dance challenge; a piano cover | A scene acted out to a song → `skit` |
| `reaction` | Reacts to another video or post shown on screen. | a duet; a stitch; a green screen over a viral tweet | Nothing shown → `talking_head` |
| `highlight` | Shows one or more standout moments to watch, with no story. A ranking doesn't change it. | a 1v5 clutch; "Top 10 goals of 2025"; a gameplay montage | Tips over gameplay → `listicle` |
| `interview` | Two or more people talking: questions and answers, or a discussion. | a street interview; a podcast clip | Acted → `skit`; one person → `talking_head` |
| `vlog` | Follows someone through their day or a routine. | "Day in my life"; a GRWM; a morning routine | A routine taught step by step → `tutorial` |
| `talking_head` | One person tells the camera one idea: a tip, an opinion, an explanation. | "Stop studying for hours. Do this instead." | Several tips → `listicle`; something that happened → `storytime` |
| `other` | None of the above. | | |

Narration doesn't change the format: jokes over gameplay moments are still `highlight`, a match told as a story is
`storytime`, and teaching how to play is `tutorial`.

### sells

Whether the video pitches something: it names or links a specific product and recommends that the viewer get it.
Showing or using a product isn't enough, unless the post has one of TikTok's commercial tags or the product's own
account posted it. Searches for videos that sell an app filter on it. Whether a pitch is paid, an affiliate deal or the
account's own product isn't a field: the commercial tags and the account are in `raw.post`.

| Value | Test | Example | Near miss → goes to |
|---|---|---|---|
| `none` | Nothing is pitched. | a dance; study tips | A tips video ending "download my app" → `software`; an app's own account using its app → `software` |
| `software` | The buyer runs it. | an iOS app, a web tool, a browser extension, a game | Only playing a game → `none`; a Notion template → `digital_content` |
| `physical_goods` | It is shipped. | a serum, a hoodie | Only using a lipstick in a makeup tutorial → `none`; a printable PDF planner → `digital_content` |
| `service` | A person does work for the buyer. | a clinic, an agency, 1:1 coaching | A coaching app → `software` |
| `digital_content` | The buyer consumes it. | a course, an ebook, a template, a paid community | An app with a subscription → `software` |
| `other` | A pitch none of the above covers. | | |

The describe request writes `product` on its own, before `sells` is decided. When the two disagree, code follows
`sells`: if it is `none`, `product` is emptied.

### asksForComment

Yes when the video asks viewers to write something specific in the comments: a keyword (often to get something sent
back), an answer to its question, or a pick. Yes for "Comment 'notes' and I'll send it" or "Which one would you pick, 1
or 2?"; no for "Let me know what you think" or "Follow for part 2". With `sells`, it decides whether the video's
comments are read, and only then can a comment be a `cta_reply`.

### tags

What the video means, as single lowercase English words: its specific subject (`skincare`, `furniture`), the names in
it (`amazon`, `duolingo`), its intent (`recommendation`, `deal`, `dupe`), who it's for and whether it's a joke. Search
by meaning goes through them: a request becomes tags, synonyms included, and they are matched.

- One word each. A name of several words is joined like a hashtag: `leagueoflegends`. Code lowercases them, removes `#`,
  spaces and punctuation, drops repeats and keeps at most 10.
- More specific than the topic: with `topic` = `beauty`, tags like `skincare`, `serum`, `kbeauty`, `dryskin`.
- Who it's for, only when the video says or writes it: "If you're a student…" → `students`; likewise `moms` and
  `gamers`.
- `funny` when the video is built around a joke or a punchline. Humor is never a topic (topic rule 5) and no format
  holds it, so this is where it's kept.
- Nothing about how it's made: green screen, voiceover, AI footage and reused clips go in `formatDescription`.

Example: a video recommending an Amazon dining table set → `amazon` `furniture` `diningtable` `deal` `recommendation`.

### description and formatDescription

Two texts in English, for reading by people and by a model. `description` says what the video is about.
`formatDescription` says how it's made: the shots, the edit, how it opens, where the product appears, and techniques
such as green screen, voiceover, AI-generated footage or clips taken from someone else. They are read on a result page,
by a relevance check that keeps the search results that fit a request, and by keyword search.

Neither is embedded. A paragraph's vector matched against a request isn't precise, and grouping videos by
format-description vectors failed a same-recipe check (0–4 of 10 pairs judged the same recipe, against a bar of 8)
because the descriptions were too generic.

## Scene

A scene runs from one cut to the next; in a photo post, each photo is a scene.

| Field | Step | Values |
|---|---|---|
| `start`, `end` | code | where the scene starts and ends, in seconds; a photo runs from its index to index + 1 |
| `cut` | code | yes when the scene starts at a cut (or starts the video); no when it continues the take before it |
| `role` | decide; code sets the first scene to `hook` | `hook` · `body` · `payoff` · `cta` |
| `footage` | decide | `camera_face` · `camera_body` · `camera_no_person` · `screen` · `graphics` · `other` |
| `showsProduct` | decide | yes · no; kept only when `sells` isn't `none` |
| `subject` | decide | `face` · `full_body` · `people` · `hands` · `object` · `animal` · `place` · `slide` · `interface` |
| `splitScreen` | decide | yes · no |
| `overlay` | decide | yes · no |
| `textBar` | decide | yes · no |
| `captions` | decide | yes · no |
| `message` | decide | yes · no |
| `spoken` | code | the words said in the scene ([Speech](#speech)) |
| `onScreenText` | describe | the video's main caption in the frame, verbatim |
| `frame` | code | the JPEG the model saw: the scene's middle frame, at most 512 px on its long side |

The scene times are kept because nothing else holds them: the cuts are found in the video, which isn't kept, and
TikTok's post has none. The hook rule, the cut rhythm and when the product first appears all come from them.

### Cuts and takes

1. ffmpeg's scene-change score on RGB frames above 0.3 is a cut (`select='gt(scene,0.3)'`; on luma alone a red → green
   cut is missed).
2. A scene shorter than 0.4 s is a transition and joins the scene before it (the first joins the one after).
3. A take longer than 5 s is split into equal parts of at most 5 s, each after the first with `cut` = no. Without the
   split, a one-take talking head would be one scene, and all of it hook. With it, the first scene never runs past 5 s:
   on 187 TikToks the first shot up to its first cut ran a median 7.3 s (60% ran 6 s or more), and the first scene
   after the split a median 3.9 s. `cut` keeps the split apart from the edit: cuts per second count only scenes where
   it is yes.
4. Past 40 scenes the shortest neighbours merge, so the record's questions fit one decide request. None of the 187 had
   more than 40; the median was 9.

Each number is an option of `detectScenes` ([concepts.md](concepts.md#composing-your-own)); `analyzeVideo` uses these.

### role

The scene's job in the video, in the standard short-form terms. TikTok's own
[guidance](https://ads.tiktok.com/help/article/creative-best-practices?lang=en) gives a hook, the selling points and a
call to action ("a hook, highlight your unique selling points, and end with a clear call-to-action"); creators call the
middle the body and the moment it lands the payoff.

| Value | Test | Example |
|---|---|---|
| `hook` | The opening, until the video starts on what it opened with. The first scene always is; a later scene is when it still carries the opening: it finishes the first line, or continues a quick run of opening shots. | the first shot of "I tried 10 AI apps so you don't have to", and the quick shots still under that line |
| `body` | Anything after the hook that isn't the payoff or the ask: context, the main part, proof. | each app in "5 apps every student needs" |
| `payoff` | The moment the promise lands: the result revealed, the "after", the punchline. | Day 90 on a skin app; the finished edit |
| `cta` | Asks the viewer to act: follow, comment, tap the link, buy. | "Comment 'notes' and I'll send it" |

The hook is bounded by the video's own cuts and content, not by a clock. The first scene's role isn't asked: code sets
it to `hook`. Code then keeps the hook in one piece: a later scene stays `hook` only while every scene before it is
`hook` and it starts before 6 seconds, since TikTok's guidance says "Prioritize your hook in the first 6 seconds";
otherwise it takes its most probable role other than `hook`. Meta defines the hook by what it does, "the text, visual,
and audio components that grab and hold attention in the first few seconds"
([Meta](https://www.facebook.com/business/news/the-science-of-the-hook-how-to-supercharge-your-reels-performance)),
and other sources put it between 1 and 6 seconds. A fixed 3-second window would cut through the first shot of most
videos: the first scene ended within 3 seconds in only 19% of the 187. In a photo post, the same rule makes the first
photo the hook.

There is no `other`: `body` takes everything in the middle. Setup and proof aren't values of their own because no
search needs them apart: searches read where the hook, the payoff and the ask fall.

### footage

What a creator needs to make the scene, in the order they ask: do I film it, does my face show, and if it isn't filmed,
what kind of visual is it. Every value can be told from the frame. Searches for on-camera creators, gameplay and a face
over an app use it.

| Value | Test | Example |
|---|---|---|
| `camera_face` | A person filmed by a camera, face visible. | talking to camera, a vlog, a skit |
| `camera_body` | A person filmed by a camera, face not visible. | hands demoing a product, an outfit, POV hands |
| `camera_no_person` | Filmed by a camera, no person. | product shots, food, places, animals |
| `screen` | A phone, computer or game screen, recorded. | an app, a website, gameplay |
| `graphics` | Made, not filmed. | text cards, slides, animation |
| `other` | None of the above. | |

- When more than one value fits, the first in the table wins. A green screen over an app and a game facecam are both
  `camera_face`: the creator has to show their face. What is behind the person goes in `formatDescription`, where
  keyword search and the relevance check find it, and `overlay` says one picture sits on another.
- A face that is part of what a screen shows (a photo in an app, a video playing in it) is `screen`.
- A phone filmed in someone's hand is `camera_*`. `screen` is only a recording of the screen itself.
- A photo in a photo post is judged by what it shows.
- AI-generated footage and clips taken from someone else can't be told from a frame alone, so they aren't values:
  `formatDescription` says so.

### showsProduct

Yes when the product the video sells is in the scene: seen (the item, its packaging or its screen, also while it is used
or applied) or named. Asked for every scene, kept only when `sells` isn't `none`. It gives where and how often the product
appears.

### subject

What fills most of the frame. `footage` says how the scene was made; `subject` says what it shows. Answer by what is
seen, whether it was filmed, drawn or recorded from a screen. A cartoon character talking is `face` like a creator
talking, and the world of a game is `place` like a street. With the layout and the text below, it says how a scene is
built, so videos made the same way are found together whatever they are about.

| Value | Test | Example |
|---|---|---|
| `face` | One person or character, from the waist up or closer. | talking to the camera; a selfie; a lip-sync; doing makeup |
| `full_body` | One person or character, head to toe. | a dance; an outfit check; a workout |
| `people` | Two or more people or characters. | an interview; a podcast; a skit with two actors; friends dancing |
| `hands` | Hands doing something. | cooking seen from above; crafting; an unboxing; tapping through a phone |
| `object` | An object or food. | a product on a table; a plate of food; a product held up to the camera |
| `animal` | An animal. | a dog doing a trick; a cat; fish in a tank |
| `place` | A place or a view. | a room tour; a city street; a beach; the world of a game |
| `slide` | A designed page made to be read: text, a list, a chart or a diagram. | a text card; a list of tips; an infographic; a quote card |
| `interface` | An app's or website's screen. | a screen recording; a screenshot of a chat or a post; an app demo |

The values have no order and no exceptions: each is a plain noun with one sentence and examples, so a scene whose answer
changes between runs points at the words, not at rules around them. There is no `other`: a `subject` that wasn't
answered is left out.

### splitScreen, overlay and textBar

How the frame is put together, which a remake has to copy. Each is asked on its own, so one frame can have all three: a
reaction window over a split screen, under a text bar.

- `splitScreen`: yes when the frame is split into panels, each with its own picture. Yes for a duet side by side; a
  reaction stacked over the original; before and after side by side; gameplay on top and a face below.
- `overlay`: yes when a second picture sits on top of the main one: a video, photo or screenshot in a window, or a
  person cut out over it. Yes for a facecam over gameplay; a reaction window in a corner; a green screen; a screenshot
  laid over a talking head.
- `textBar`: yes when the picture is shrunk to make room for a solid bar above or below it, with text in the bar. Yes
  for a meme clip under a white bar of text; a podcast clip under a headline bar.

`onScreenText` leaves the bar's text out, since it repeats in every scene; `textBar` says the bar is there, and `message`
says its words speak to the viewer.

### captions and message

What the text on screen does. `onScreenText` keeps the main caption's words; these two say what kind of text the frame
shows, and a scene can have both.

- `captions`: yes when the words heard in the scene are written on screen as subtitles. Yes for subtitles under a
  talking head; word-by-word captions of a voiceover; a song's lyrics on screen.
- `message`: yes when the scene shows words its maker wrote for the viewer, other than the words heard: a hook, a title,
  a statement, a joke, a POV, a question, a list or a line of a story. Yes for "POV: you finally found an app that
  works"; "3 mistakes everyone makes"; a headline bar over a podcast clip. Also when the same words stay on screen from
  the scene before: without that sentence, a line kept on screen was a message only in the scene it first showed in. Of
  70 labelled message scenes right after another, 32 were found without it and 60 with it
  ([eval](../eval/README.md#results-050-the-scene-facets)).

### onScreenText

The video's main caption in the scene's frame, verbatim and in its own language: the text added in the edit that says
what is happening or being said, usually over the footage (subtitles, a hook line, a list item, a step). It is written
in every scene it shows in, also when it stays on screen for the whole video. The fixed layout around the footage (a
title or header in a band above or below it, the channel's name or logo, a watermark, a label such as FANMADE) and text
that is part of the footage (an app's or game's interface, names, numbers, signs) are left out: repeated in every scene,
they hid the caption that tells the scenes apart. TikTok's sticker text is given to the describe request to get the
spelling right, but only text visible in the frame is written. Empty when the frame has no such caption.

## Speech

Where `spoken` comes from, in order. The first that applies sets `speech`:

1. **`subtitles`:** the post's TikTok subtitle track whose source is `ASR`, TikTok's own recognition of the words, in the
   language they're spoken. A track whose source is `MT` is a machine translation and is never used, nor is any other
   source. Each cue's words are spread evenly over the cue's time.
2. **`transcription`:** only when transcription is turned on (it is off by default) and there is no `ASR` track: the
   audio goes to a transcriber (`whisper-1` by default, or your own), and a segment that is likely not speech and unsure
   (`noSpeechProb` > 0.4 and `avgLogprob` < -0.6) is dropped, as is a segment that is only "thanks for watching" (on
   music-only reels whisper writes "Thanks for watching!" at 0.5 and -0.86; real speech measured -0.19 to -0.22 even at
   0.54). The same filter runs on any transcriber's output that carries those numbers. The requests are told these
   words are an automatic transcription that may be song lyrics.
3. **`none`:** otherwise. Every `spoken` is empty, and the requests are told the words aren't known, not that nothing is
   said.

Each word goes to the scene its midpoint falls in. A word is never split between scenes and never appears twice.

Transcription is off by default because it rarely adds speech. Of 187 TikToks, 93 had a subtitle track. Of the 94
without one, whisper found real speech in 10 to 13 (5–7% of all videos); the rest were song lyrics (48), under 5 words
(21) or words it invented (12, such as "Thank you for watching" over a piano piece). TikTok makes no track for most
videos without speech, so its choice is mostly right. A video file has no TikTok subtitles at all: turn transcription on
for files whose words matter.

## Comments

Read for videos that sell something or ask for a comment (`sells` isn't `none`, or `asksForComment` is yes), when the
input is a TikTok post and comments aren't turned off. They show whether the views turned into intent, and whether the
reaction is good or bad. Other videos skip them because reading costs: an apinoa read and a decide request per video.
The read runs after the decide request, which settles both fields.

One read of up to 50 of the post's top comments is kept, leaving out the creator's own, in the order TikTok gives them.
One decide request labels them all, given what the video is about (its `description`), the product's name and the words
said and written in the video's `cta` scenes.

| Field | Step | Values |
|---|---|---|
| `id` | code | TikTok's id for the comment, to join it to the comments read |
| `text` | code | the comment, verbatim |
| `likes` | code | its likes when read |
| `kind` | decide | `cta_reply` · `intent` · `negative` · `positive` · `other` |

### kind

What the comment does. When more than one value fits, the first in the table wins: "link? this looks amazing" is
`intent`. Social-listening taxonomies share a core of purchase intent, questions, complaints, praise and spam;
`cta_reply` is added for the video's ask, and a question about the product counts as `intent`, since someone asking how
it works is weighing whether to get it.

| Value | Test | Example |
|---|---|---|
| `cta_reply` | Does what the video asked for in the comments: the keyword, an answer, a pick. Only offered when `asksForComment` is yes. | "notes"; "2!" |
| `intent` | Wants the product the video pitches, or already has it: asks its name, price, link, where to get it or how it works, or says they need, bought, downloaded or use it. Only offered when `sells` isn't `none`. | "what's the app called?"; "does it work on Android?"; "I need this"; "just downloaded it" |
| `negative` | Criticizes, distrusts or pushes back on the video, the creator or the product, a way to do without it included. | "this is an ad"; "doesn't work"; "just use 2x speed" |
| `positive` | Praises, agrees, relates or laughs about the video, with no ask. | "this is so useful"; "this is so me 😂" |
| `other` | Anything else: unrelated to the video, a question about the video itself, a friend's tag, emoji alone, spam, another product pushed. | "🔥🔥"; "@sam"; "what did you edit this with?" |

Shares are computed when needed: each kind's count ÷ the comments read, and not meaningful under 20 comments. The
`intent` share is purchase intent, not conversion: studies detect intent in social posts, but none found links it to
sales.

## When an answer is missing

A refused or missing decide answer falls back to: `topic`, `format` and `footage` `other`; `sells` `none`; `role`
`body`; `asksForComment`, `showsProduct`, `splitScreen`, `overlay`, `textBar`, `captions` and `message` no; a comment's
`kind` `other`. A `subject` that wasn't answered is left out, since it has no `other`. A describe field the model left
out is empty. A question of your own that wasn't answered is left out of `answers`.

## Not extracted

- **What the product does:** the account's question, since a video records how it's made. A video's tags still name
  its subject (`pricecomparison`), which covers creators who pitch a different product in each video.
- **The sound:** the post has it (its id, title and whether it's original), and videos on the same sound are found
  there.
- **Hook and CTA type:** sources name different, overlapping hook tactics (Meta three, Segwise six, Motion its own), so
  no list of them would stay unambiguous. The `hook` and `cta` scenes, with what's said and written in them, cover them.
- **Named things** (apps, brands, games, people): in `tags`.
- **Production techniques** (green screen, voiceover, AI footage, reused clips): in `formatDescription`.
- **Language:** TikTok's `lang`, in the post.
- **A one-line description of each scene:** its frame shows it.
- **Roll-ups from the scenes** (how long a face is on screen, when the product first appears): computed from the scene
  values when a search needs them.
- **Who wrote each comment:** no search reads it; `raw.comments` keeps it.
- **Whose voice is heard** (the person shown, a voiceover, a song): the requests can't hear the audio, and a frame
  can't tell a voiceover from the person shown talking. `speech` and the post's sound say what can be known.
- **Attractiveness, or who a face belongs to:** never. About people, the record says only whether someone is filmed,
  whether their face shows, and how much of one person or how many people fill the frame.
