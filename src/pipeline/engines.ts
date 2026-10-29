// The default engines: what computes the transcription, describe and decide stages unless the caller passes their own.
import {
  decide, DECISIONS_MODEL, describe, DESCRIBE_MODEL, transcribe, TRANSCRIBE_MODEL,
  type Decider, type Describer, type OpenAIOptions, type Transcriber,
} from "../primitives.js";

export type EngineOptions = OpenAIOptions & { model?: string };

/** OpenAI transcription (`whisper-1` unless `model` says otherwise); its `id` is the model. */
export function openaiTranscriber(o: EngineOptions = {}): Transcriber {
  const model = o.model ?? TRANSCRIBE_MODEL;
  return { id: model, transcribe: (audio) => transcribe(audio, { ...o, model }) };
}

/**
 * OpenAI Responses with a strict JSON schema (`gpt-6-luna` unless `model` says otherwise). `serviceTier: "flex"` runs it on
 * the flex tier: half the price, slower. The `id` stays the model, so switching tiers doesn't rerun the stage on reuse.
 */
export function openaiDescriber(o: EngineOptions & { serviceTier?: "flex" } = {}): Describer {
  const model = o.model ?? DESCRIBE_MODEL;
  return { id: model, describe: (evidence, request) => describe(evidence, request, { ...o, model }) };
}

/** OpenAI Decisions (`gpt-6-luna` unless `model` says otherwise). */
export function openaiDecider(o: EngineOptions = {}): Decider {
  const model = o.model ?? DECISIONS_MODEL;
  return { id: model, decide: (evidence, questions) => decide(evidence, questions, { ...o, model }) };
}
