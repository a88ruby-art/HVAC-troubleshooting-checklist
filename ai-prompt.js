// What the AI check asks Claude, shared by the app (own API key) and the team server (server/).
// Change it here and both pick it up; redeploy the server after editing.

export const MODEL = "claude-opus-5";

export const SYSTEM = [
  "You help HVAC field technicians diagnose commercial and residential equipment from readings they took at the unit.",
  "You will get the readings from a pre-call checklist: unit details, line voltage, amp draw, capacitor and contactor, refrigerant pressures and line temperatures, superheat and subcool, air-side temperatures, heat-side checks, the symptom, and what the tech already tried. Automatic flags from simple rule checks are included too.",
  "Work only from the readings given. Where it helps, derive values yourself (for example saturation temperatures from the pressures for the listed refrigerant, then superheat or subcool, or the temperature split) and say you derived them. Never invent a reading that was not taken. If the readings don't support a conclusion, say so and name the reading that would settle it.",
  "Rank the likely causes, most likely first, each with a confidence and the specific readings that point to it. Next checks should be concrete things the tech can do at the unit now, in order, with what a good or bad result looks like.",
  "Include a safety note only when the readings or the fix involve a real hazard (for example a welded contactor, rollout or high-limit trips, gas pressure, high amp draw, refrigerant recovery). Keep every field short and plain; the tech is reading this on a phone at the unit."
].join("\n\n");

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "likely_causes", "next_checks", "safety_notes", "missing_readings"],
  properties: {
    summary: { type: "string", description: "One or two sentences on what the readings say overall." },
    likely_causes: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["cause", "confidence", "evidence"],
      properties: {
        cause: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        evidence: { type: "string", description: "The readings that point to this cause." }
      }
    }},
    next_checks: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["check", "expect"],
      properties: {
        check: { type: "string" },
        expect: { type: "string", description: "What a good vs. bad result looks like." }
      }
    }},
    safety_notes: { type: "array", items: { type: "string" } },
    missing_readings: { type: "array", items: { type: "string" }, description: "Readings that were not taken and would most help." }
  }
};

// Longest readings text either side will send; a full checklist is well under this.
export const MAX_READINGS = 20000;

// Parameters for client.beta.messages.create().
export function buildRequest(readings) {
  return {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: readings }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } }
  };
}

// Pulls the result out of a response. Throws an Error whose `code` says why it couldn't.
export function readResult(res) {
  if (res.stop_reason === "refusal") throw Object.assign(new Error("Claude declined to answer this one."), { code: "refusal" });
  if (res.stop_reason === "max_tokens") throw Object.assign(new Error("The answer was cut off. Try again."), { code: "truncated" });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error("Claude's answer couldn't be read. Try again."), { code: "bad_output" });
  }
}
