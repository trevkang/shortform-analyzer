// The candidate scene facets under test: voice, layout, shot and text. They aren't in the record: eval/repeat.mjs asks
// them in the record's own decide request, written the way src/record/taxonomy.ts writes the record's (one question
// each, the first value that fits wins, each value with a test, an example and where a near miss belongs), so a facet
// that keeps changing between runs points at its values, not at how it was asked.

const row = (test, example = "", nearMiss = "") => ({ test, example, nearMiss });
const FIRST_WINS = "When more than one value fits, the first in the table wins.";

export const CANDIDATES = {
  voice: {
    question: "Whose words are heard in scene {scene}.",
    rules: [
      FIRST_WINS,
      "A transcription can hold a song's words: words that come with the sound (its title, the same words in a lip-sync or a dance) are the sound's, even when someone mouths them.",
    ],
    about: {
      in_frame: row(
        "A person or character in the frame says the words, in their own voice",
        "talking to the camera; a street interview; actors' dialogue; a podcast clip; a cartoon character talking",
        "the same person's voice over shots where they don't speak → off_frame; mouthing a song or a sound → sound",
      ),
      off_frame: row(
        "Someone who isn't speaking in the frame says the words: a voiceover or narration over the picture",
        "a voice over b-roll, a screen recording, gameplay or slides",
        "the words of a song or a trending sound → sound",
      ),
      sound: row(
        "The only words are the sound's own: a song's lyrics or a trending audio's line, also when someone in the frame mouths them",
        "a lip-sync; a dance to a song with lyrics; footage set to a song",
        "music without words → none",
      ),
      none: row("No words are heard: silence, music without words, or the picture's own noise", "an instrumental montage; cooking sounds"),
    },
  },
  layout: {
    question: "How the frame of scene {scene} is laid out.",
    rules: [FIRST_WINS, "Judge how the frame is divided, not what the pictures show."],
    about: {
      cutout: row(
        "A person cut out over another picture: a green screen",
        "a creator talking over a screenshot, a headline or a game",
        "a person filmed in front of a real screen or TV → full",
      ),
      split: row(
        "Two different videos or pictures share the frame: top and bottom, side by side, or one in a small window over the other",
        "a duet or reaction next to the original; before and after side by side; gameplay with the streamer's face in a corner",
        "a small product photo, sticker or logo on the picture → full",
      ),
      banner: row(
        "One picture smaller than the frame, with solid bands above or below it that hold text",
        "a meme clip with a white band of text on top; a podcast clip with a headline band",
        "empty black bars → full; text written straight on the picture → full",
      ),
      full: row("One picture fills the frame; text or stickers on it are fine", "a talking head with captions; a slide; a screen recording"),
    },
  },
  shot: {
    question: "What the main picture of scene {scene} shows, by how it is framed.",
    rules: [
      FIRST_WINS,
      "Judge the largest picture; for a cutout, the person.",
      "How it is framed, not what it is for: a skit, a performance or an interview is judged by what the frame shows.",
      "A person or thing shown inside a recorded screen is app, or game; a phone filmed in a hand is hands.",
      "A photo in a photo post is judged by what it shows.",
    ],
    about: {
      group: row("Two or more people, faces visible", "an interview; a podcast set; two actors in a skit; friends dancing", "one person, others small behind them → face or body"),
      face: row(
        "One person, waist-up or closer, face visible",
        "talking to the camera; a selfie lip-sync; makeup in a mirror; someone at a desk",
        "legs in view → body; no face → hands or thing",
      ),
      body: row("One person with their legs in view", "a dance; an outfit check; a workout; a transition", "waist-up → face"),
      hands: row(
        "Hands and what they hold or work on at the center, no face",
        "top-down cooking; crafting; an unboxing; a phone used in a hand",
        "the object with no hands → thing",
      ),
      thing: row("An object, food, product or animal close up, no person", "a product on a table; a plate of food; a pet", "a wide view of a place → place"),
      place: row("A place, a view or an event; people small if any", "a beach; a room; a city street; a concert crowd", "one person filling the frame → face or body"),
      app: row(
        "An app, website or computer screen, recorded or captured",
        "a screen recording; a screenshot; a phone mockup",
        "a phone filmed in a hand → hands; a game → game",
      ),
      game: row("A video game's picture", "gameplay; a game's menu or cutscene", "a website about the game → app"),
      card: row(
        "A designed card, slide or chart: text and graphics made to be read",
        "a text card; a list slide; a chart; a headline card with a photo",
        "a photo with a caption on it → judged by the photo",
      ),
      animation: row("A drawn, cartoon or 3D-animated picture", "a 3D animated story; a cartoon explainer", "lifelike AI footage → judged as if filmed"),
    },
  },
  text: {
    question: "What the main text written on scene {scene} does.",
    rules: [
      FIRST_WINS,
      "The main text is the most prominent line that stays on screen, text in a banner included; an app's interface, logos, watermarks and account names don't count.",
    ],
    about: {
      captions: row("It writes out the words being said", "subtitles of a talking head; word-by-word captions of a voiceover", "a line the speaker doesn't say → message"),
      message: row(
        "It tells the viewer something the picture doesn't: a statement, a joke, a POV, a question or a line of a story",
        `"POV: you finally found an app that works"; "me pretending I understand the exam"; a headline band over a clip`,
        "a name, title, step, price or number → other",
      ),
      other: row(
        "No text, or only labels for what is shown: a title, a step, a name, a price, a number or a date",
        `"Step 3"; "$29.99"; "Day 12"; a brand name`,
        "a title that makes a claim, a joke or a question → message",
      ),
    },
  },
};

export const CANDIDATE_FIELDS = Object.keys(CANDIDATES);

const sentence = (s) => (/[.!?"]$/.test(s) ? s : `${s}.`);

/** A value as the model reads it: its test, then an example and a near miss, as the record's `valueText`. */
export function candidateText(field, value) {
  const t = CANDIDATES[field].about[value];
  return [sentence(t.test), t.example && sentence(`Example: ${t.example}`), t.nearMiss && sentence(`Belongs elsewhere: ${t.nearMiss}`)].filter(Boolean).join(" ");
}

/** The candidates as decide questions, asked of every scene. */
export const CANDIDATE_QUESTIONS = Object.entries(CANDIDATES).map(([name, f]) => ({
  type: "choice", name, scope: "scene", instructions: `${f.question} ${f.rules.join(" ")}`,
  choices: Object.keys(f.about).map((value) => ({ value, description: candidateText(name, value) })),
}));
