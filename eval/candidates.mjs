// The candidate scene facets under test: how the frame is laid out (split_screen, overlay, text_bar), what the picture
// shows (subject) and what its text does (captions, message). They aren't in the record: eval/repeat.mjs asks them in the
// record's own decide request. Each value is a plain word with one sentence and examples, with no order between values
// and no exceptions, so a facet that keeps changing between runs points at its words, not at rules around them.

const row = (test, example) => ({ test, example });
const yesNo = (question, yes, also = "") => ({ question, yes, also });

export const CANDIDATES = {
  split_screen: yesNo(
    "Is the frame of scene {scene} split into panels, each with its own picture?",
    "a duet side by side; a reaction stacked over the original; before and after side by side; gameplay on top and a face below",
  ),
  overlay: yesNo(
    "Does a second picture sit on top of the main one in scene {scene}: a video, photo or screenshot in a window, or a person cut out over it?",
    "a facecam over gameplay; a reaction window in a corner; a green screen; a screenshot laid over a talking head",
  ),
  text_bar: yesNo(
    "Is the picture of scene {scene} shrunk to make room for a solid bar above or below it, with text in the bar?",
    "a meme clip under a white bar of text; a podcast clip under a headline bar",
  ),
  subject: {
    question: "What fills most of the frame of scene {scene}. Answer by what is seen, whether it was filmed, drawn or recorded from a screen.",
    about: {
      face: row("One person or character, from the waist up or closer", "talking to the camera; a selfie; a lip-sync; doing makeup"),
      full_body: row("One person or character, head to toe", "a dance; an outfit check; a workout"),
      people: row("Two or more people or characters", "an interview; a podcast; a skit with two actors; friends dancing"),
      hands: row("Hands doing something", "cooking seen from above; crafting; an unboxing; tapping through a phone"),
      object: row("An object or food", "a product on a table; a plate of food; a product held up to the camera"),
      animal: row("An animal", "a dog doing a trick; a cat; fish in a tank"),
      place: row("A place or a view", "a room tour; a city street; a beach; the world of a game"),
      slide: row("A designed page made to be read: text, a list, a chart or a diagram", "a text card; a list of tips; an infographic; a quote card"),
      interface: row("An app's or website's screen", "a screen recording; a screenshot of a chat or a post; an app demo"),
    },
  },
  captions: yesNo(
    "Are the words heard in scene {scene} written on screen as subtitles?",
    "subtitles under a talking head; word-by-word captions of a voiceover; a song's lyrics on screen",
  ),
  message: yesNo(
    "Does scene {scene} show words its maker wrote for the viewer, other than the words heard: a hook, a title, a statement, a joke, a POV, a question, a list or a line of a story?",
    `"POV: you finally found an app that works"; "3 mistakes everyone makes"; a headline bar over a podcast clip`,
    // Without it, a line that stays on screen was a message only in the scene it first showed in (41% of the later scenes).
    "Also when the same words stay on screen from the scene before.",
  ),
};

/** Each candidate's field in repeats.json and the labels → its question's name: camelCase, as showsProduct is shows_product's. */
export const CANDIDATE_FIELDS = Object.fromEntries(Object.keys(CANDIDATES).map((name) => [name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), name]));

const sentence = (s) => (/[.!?"]$/.test(s) ? s : `${s}.`);

/** A value as the model reads it: its test, then an example, as the record's `valueText`. */
export function candidateText(name, value) {
  const t = CANDIDATES[name].about[value];
  return `${sentence(t.test)} ${sentence(`Example: ${t.example}`)}`;
}

/** A candidate's answer as its field holds it: the value chosen, or true when yes is at least as likely as no; null when unanswered. */
export function candidateValue(name, answer) {
  if (CANDIDATES[name].about) return answer?.choice ?? null;
  return typeof answer?.probability === "number" ? answer.probability >= 0.5 : null;
}

/** The candidates as decide questions, asked of every scene. */
export const CANDIDATE_QUESTIONS = Object.entries(CANDIDATES).map(([name, c]) => (c.about
  ? { type: "choice", name, scope: "scene", instructions: c.question, choices: Object.keys(c.about).map((value) => ({ value, description: candidateText(name, value) })) }
  : { type: "predicate", name, scope: "scene", instructions: `${c.question} Yes for ${c.yes}.${c.also ? ` ${c.also}` : ""}` }));
