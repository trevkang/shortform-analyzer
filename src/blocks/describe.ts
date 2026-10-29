import type { DescribeRequest, Evidence, OpenAIOptions, Usage } from "../types.js";
import { openai, send, stage } from "./run.js";

export const DESCRIBE_MODEL = "gpt-6-luna";
/**
 * gpt-6-luna's reasoning effort for describe. Measured on 24 TikToks: half medium's time (5.2 s against 9.9 s, p50)
 * with labels no further from medium than a second medium run is; `none` wrote one scene's text into every scene.
 */
export const DESCRIBE_EFFORT = "low";
export const FLEX_TIMEOUT_MS = 15 * 60_000; // flex requests can queue; OpenAI's examples wait 15 minutes
/** Without flex capacity OpenAI answers 429 with Retry-After 300; flex is for when waiting that out is fine. */
export const FLEX_MAX_WAIT_MS = 5 * 60_000;

/** The evidence as Responses input: the intro, then each item in order, images as JPEG data URLs. */
export function responsesContent(evidence: Evidence): unknown[] {
  return [
    { type: "input_text", text: evidence.intro },
    ...evidence.items.map((item) => item.type === "text"
      ? { type: "input_text", text: item.text }
      : { type: "input_image", image_url: `data:${item.mime ?? "image/jpeg"};base64,${item.image.toString("base64")}` }),
  ];
}

/** The request body for OpenAI Responses with a strict JSON schema. */
/** The Responses body. `effort` defaults to `DESCRIBE_EFFORT` for `DESCRIBE_MODEL`, and to none sent for another model. */
export function describeBody(evidence: Evidence, request: DescribeRequest, model = DESCRIBE_MODEL, effort?: string) {
  const reasoning = effort ?? (model === DESCRIBE_MODEL ? DESCRIBE_EFFORT : undefined);
  return {
    model,
    ...(reasoning ? { reasoning: { effort: reasoning } } : {}),
    instructions: request.instructions,
    input: [{ role: "user", content: responsesContent(evidence) }],
    text: { format: { type: "json_schema", name: request.name, schema: request.schema, strict: true } },
  };
}

type Reply = {
  output_text?: string;
  output?: { content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  service_tier?: string;
};

export type DescribeOptions = OpenAIOptions & {
  model?: string;
  /** The model's reasoning effort (`none`, `low`, `medium`, `high`… for gpt-6-luna). Default: `DESCRIBE_EFFORT` for gpt-6-luna. */
  effort?: string;
  /** `flex`: OpenAI's flex tier, at half the price and slower. It waits for capacity (up to 3 × 5 min), then the standard tier. */
  serviceTier?: "flex";
};

/** One OpenAI Responses request over the evidence → the JSON the request's schema asks for. No fallbacks. */
export function describe(evidence: Evidence, request: DescribeRequest, options: DescribeOptions = {}): Promise<{ output: unknown; usage?: Usage }> {
  return stage("describe", async () => {
    const body = describeBody(evidence, request, options.model, options.effort);
    const api = openai(options, "describe");
    const post = (b: object, o?: { timeoutMs: number; maxWaitMs: number }) => send(api.fetch, `${api.base}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }, o);
    let flex = options.serviceTier === "flex";
    // Flex waits for capacity: a 429 (not billed) is tried again after its Retry-After, 3 times. Then, or when flex
    // doesn't answer in time, the standard tier.
    let res = flex
      ? await post({ ...body, service_tier: "flex" }, { timeoutMs: FLEX_TIMEOUT_MS, maxWaitMs: FLEX_MAX_WAIT_MS }).catch(() => undefined)
      : await post(body);
    if (!res || (flex && (res.status === 429 || res.status >= 500))) {
      flex = false;
      res = await post(body);
    }
    const data = (await res.json().catch(() => ({}))) as Reply & { error?: { message?: string } };
    if (!res.ok) throw new Error(`responses ${res.status}: ${data?.error?.message ?? "no body"}`);
    const parts = (data.output ?? []).flatMap((o) => o.content ?? []);
    const text = data.output_text ?? parts.find((c) => c.type === "output_text")?.text;
    if (typeof text !== "string") {
      const refusal = parts.find((c) => c.type === "refusal")?.refusal;
      throw new Error(refusal ? `refused: ${refusal}` : "no output");
    }
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new Error("the output is not JSON");
    }
    const u = data.usage ?? {};
    return {
      output,
      usage: {
        ...(typeof u.input_tokens === "number" ? { inputTokens: u.input_tokens } : {}),
        ...(typeof u.output_tokens === "number" ? { outputTokens: u.output_tokens } : {}),
        ...(flex && (data.service_tier ?? "flex") === "flex" ? { serviceTier: "flex" as const } : {}),
      },
    };
  });
}
