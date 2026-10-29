// The record's decide fields as docs/video-analysis.md defines them: the values in order, each value's test, example and
// near miss (the table cells, without the backticks), and the rules around the table. The decide questions, the describe
// schema and schema/analysis.schema.json's value lists are made from this file; tests/taxonomy.test.ts compares it with
// the docs, so a change starts in the docs.

export const TOPICS = [
  "beauty", "fashion", "gaming", "tech", "education", "business_money", "entertainment", "music_dance", "food",
  "fitness_sports", "shopping", "lifestyle", "other",
] as const;
export type Topic = (typeof TOPICS)[number];

export const FORMATS = [
  "tutorial", "listicle", "before_after", "review", "storytime", "skit", "performance", "reaction", "highlight",
  "interview", "vlog", "talking_head", "other",
] as const;
export type Format = (typeof FORMATS)[number];

export const SELLS = ["none", "software", "physical_goods", "service", "digital_content", "other"] as const;
export type Sells = (typeof SELLS)[number];

export const ROLES = ["hook", "body", "payoff", "cta"] as const;
export type Role = (typeof ROLES)[number];

export const FOOTAGE = ["camera_face", "camera_body", "camera_no_person", "screen", "graphics", "other"] as const;
export type Footage = (typeof FOOTAGE)[number];

export const COMMENT_KINDS = ["cta_reply", "intent", "negative", "positive", "other"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/** One table row: the test (for topic, what it covers), an example and a near miss; empty cells are "". */
export type ValueText = { test: string; example: string; nearMiss: string };

export type Field<V extends string> = {
  values: readonly V[];
  about: Record<V, ValueText>;
  /** Rules the docs give around the table, verbatim. */
  rules: string[];
};

const row = (test: string, example = "", nearMiss = ""): ValueText => ({ test, example, nearMiss });

export const TAXONOMY: {
  topic: Field<Topic>;
  format: Field<Format>;
  sells: Field<Sells>;
  role: Field<Role>;
  footage: Field<Footage>;
  commentKind: Field<CommentKind>;
} = {
  topic: {
    values: TOPICS,
    rules: [
      "The topic is what the video is about once the person and the tone are removed.",
      "tech only when the tool's own capability is the point. An app used for a life outcome takes the outcome's topic.",
      "A lesson about a subject takes that subject's topic. education covers learning itself (studying, exams, school, languages) and science facts.",
      "One product reviewed takes that product's topic; several unrelated products are shopping.",
      "Genre and humor are never a topic: a funny skit about exam week is education.",
    ],
    about: {
      beauty: row("skincare, makeup, hair, nails, body care", '"5-minute no-makeup makeup"', '"Wedding guest outfit" → fashion'),
      fashion: row("clothes, shoes, accessories, styling", '"3 ways to style a blazer"', '"Wedding hair" → beauty'),
      gaming: row("video games, esports", '"1v5 clutch in Valorant"', '"Board game night" → lifestyle'),
      tech: row(
        "apps, AI tools, gadgets, software",
        `"This AI turns your selfie into a 90s yearbook photo"; "AI makes my professor's face funny"`,
        '"I lost 8 kg with a calorie app" → fitness_sports; an exam-week skit → education',
      ),
      education: row("studying, exams, school, languages, science facts", '"Memorize 100 words a day"; "why the sky is blue"', '"How compound interest works" → business_money'),
      business_money: row(
        "personal finance, investing, careers, running a business, growing a page",
        '"How I budget ₩3M a month"; "How I got hired at Naver"',
        '"Daiso finds under ₩5,000" → shopping',
      ),
      entertainment: row("film, TV, celebrities, anime, comics, pop culture", '"Squid Game 2 ending explained"; celebrity news', '"Piano cover of a drama OST" → music_dance'),
      music_dance: row("music, singing, dance, instruments", '"Piano cover"; "dance tutorial"', "A skit set to a trending sound → the skit's subject"),
      food: row("cooking, recipes, restaurants, drinks", '"3-ingredient tteokbokki"', '"High-protein meals for a cut" → fitness_sports'),
      fitness_sports: row("workouts, health, wellbeing, sports", `"10-min ab workout"; "Messi's best goals"`, '"A gym outfit haul" → fashion'),
      shopping: row("hauls, deals, finds across unrelated products", '"Daiso finds under ₩5,000"; a haul', "A review of one serum → beauty"),
      lifestyle: row(
        "daily life, home, family, relationships, travel, pets, hobbies",
        '"Day in my life"; "Studio apartment makeover"; "Hidden cafés in Seongsu"',
        '"What I eat in a day" → food',
      ),
      other: row("everything else: news, politics, religion, cars", '"What the new rent law means"; "Ioniq 6 range test"'),
    },
  },
  format: {
    values: FORMATS,
    rules: [
      "Narration doesn't change the format: jokes over gameplay moments are still highlight, a match told as a story is storytime, and teaching how to play is tutorial.",
    ],
    about: {
      tutorial: row("Shows how to do or use something, step by step.", '"Remove a background in CapCut"; a recipe; an app walkthrough', '"5 CapCut tricks" → listicle; one product tried and judged → review'),
      listicle: row(
        "Goes through several things one by one, telling the viewer about each (tips, apps, products, places), or compares options.",
        '"5 apps every student needs"; "ChatGPT vs Claude for essays"',
        "One tip → talking_head; moments to watch, even ranked → highlight",
      ),
      before_after: row("Shows the same thing before and after.", '"Day 1 vs Day 90 on a skin app"; a room makeover; an AI face reveal', "A makeup look done step by step → tutorial"),
      review: row("Tries one product and says what they think of it.", 'an unboxing; "I used this serum for a week"', "Several products → listicle; the result shown with no verdict → before_after"),
      storytime: row("Tells something that happened.", '"Storytime: my landlord tried to scam me"', "Acted out → skit"),
      skit: row("An acted scene, including one lip-synced to a sound.", '"POV: mom finds your screen time"; a comedy sketch', "Told to camera → storytime"),
      performance: row("Dancing, singing, playing music or lip-syncing a song.", "a dance challenge; a piano cover", "A scene acted out to a song → skit"),
      reaction: row("Reacts to another video or post shown on screen.", "a duet; a stitch; a green screen over a viral tweet", "Nothing shown → talking_head"),
      highlight: row(
        "Shows one or more standout moments to watch, with no story. A ranking doesn't change it.",
        'a 1v5 clutch; "Top 10 goals of 2025"; a gameplay montage',
        "Tips over gameplay → listicle",
      ),
      interview: row("Two or more people talking: questions and answers, or a discussion.", "a street interview; a podcast clip", "Acted → skit; one person → talking_head"),
      vlog: row("Follows someone through their day or a routine.", '"Day in my life"; a GRWM; a morning routine', "A routine taught step by step → tutorial"),
      talking_head: row(
        "One person tells the camera one idea: a tip, an opinion, an explanation.",
        '"Stop studying for hours. Do this instead."',
        "Several tips → listicle; something that happened → storytime",
      ),
      other: row("None of the above."),
    },
  },
  sells: {
    values: SELLS,
    rules: [
      "Whether the video pitches something: it names or links a specific product and recommends that the viewer get it.",
      "Showing or using a product isn't enough.",
    ],
    about: {
      none: row("No product is named or linked and recommended.", "a dance; study tips", 'A tips video ending "download my app" → software'),
      software: row("The buyer runs it.", "an iOS app, a web tool, a browser extension, a game", "Only playing a game → none; a Notion template → digital_content"),
      physical_goods: row("It is shipped.", "a serum, a hoodie", "Only using a lipstick in a makeup tutorial → none; a printable PDF planner → digital_content"),
      service: row("A person does work for the buyer.", "a clinic, an agency, 1:1 coaching", "A coaching app → software"),
      digital_content: row("The buyer consumes it.", "a course, an ebook, a template, a paid community", "An app with a subscription → software"),
      other: row("A pitch none of the above covers."),
    },
  },
  role: {
    values: ROLES,
    rules: [],
    about: {
      hook: row(
        "The opening, until the video starts on what it opened with. The first scene always is; a later scene is when it still carries the opening: it finishes the first line, or continues a quick run of opening shots.",
        `the first shot of "I tried 10 AI apps so you don't have to", and the quick shots still under that line`,
      ),
      body: row("Anything after the hook that isn't the payoff or the ask: context, the main part, proof.", 'each app in "5 apps every student needs"'),
      payoff: row('The moment the promise lands: the result revealed, the "after", the punchline.', "Day 90 on a skin app; the finished edit"),
      cta: row("Asks the viewer to act: follow, comment, tap the link, buy.", `"Comment 'notes' and I'll send it"`),
    },
  },
  footage: {
    values: FOOTAGE,
    rules: [
      "When more than one value fits, the first in the table wins.",
      "A face that is part of what a screen shows (a photo in an app, a video playing in it) is screen.",
      "A phone filmed in someone's hand is camera_*. screen is only a recording of the screen itself.",
      "A photo in a photo post is judged by what it shows.",
    ],
    about: {
      camera_face: row("A person filmed by a camera, face visible.", "talking to camera, a vlog, a skit"),
      camera_body: row("A person filmed by a camera, face not visible.", "hands demoing a product, an outfit, POV hands"),
      camera_no_person: row("Filmed by a camera, no person.", "product shots, food, places, animals"),
      screen: row("A phone, computer or game screen, recorded.", "an app, a website, gameplay"),
      graphics: row("Made, not filmed.", "text cards, slides, animation"),
      other: row("None of the above."),
    },
  },
  commentKind: {
    values: COMMENT_KINDS,
    rules: ["When more than one value fits, the first in the table wins"],
    about: {
      cta_reply: row("Does what the video asked for in the comments: the keyword, an answer, a pick. Only offered when asksForComment is yes.", '"notes"; "2!"'),
      intent: row(
        "Wants the product the video pitches, or already has it: asks its name, price, link, where to get it or how it works, or says they bought, downloaded or tried it.",
        `"what's the app called?"; "does it work on Android?"; "just downloaded it"`,
      ),
      negative: row("Criticizes or distrusts the video, the creator or the product.", '"this is an ad"; "doesn\'t work"'),
      positive: row("Praises, agrees, relates or laughs, with no ask.", '"this is so useful"; "this is so me 😂"'),
      other: row("Anything else: a question about the video itself, a friend's tag, emoji, spam.", '"🔥🔥"; "@sam"; "what did you edit this with?"'),
    },
  },
};

const sentence = (s: string) => (/[.!?"]$/.test(s) ? s : `${s}.`);

/** A value as the model reads it: its test, then an example and a near miss when the docs give them. */
export function valueText(field: keyof typeof TAXONOMY, value: string): string {
  const t = (TAXONOMY[field].about as Record<string, ValueText>)[value];
  return [
    sentence(field === "topic" ? `Covers ${t.test}` : t.test),
    t.example && sentence(`Example: ${t.example}`),
    t.nearMiss && sentence(`Belongs elsewhere: ${t.nearMiss}`),
  ].filter(Boolean).join(" ");
}
