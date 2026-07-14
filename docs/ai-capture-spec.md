# AI Capture Spec

## Purpose

Capture turns a messy training note or future voice transcript into an editable Drill draft. It is a memory aid, not an autonomous coach: the user remains responsible for reviewing mechanics and taxonomy before saving.

Voice recording is deferred. Text capture at `/capture/new` uses the same draft shape and review form that voice transcription will use later.

## Active Output

```json
{
  "title": "Slip Right Step-Through Uppercut Exit",
  "summary": "Slip the cross, step through into the uppercut, then leave off-line.",
  "notes": "Keep the head off center and do not stand up during the step-through.",
  "steps": [
    "Partner feeds the cross.",
    "Slip right and step through.",
    "Throw the left uppercut.",
    "Pivot out and reset."
  ],
  "trainingMethodSlugs": ["partner-drill"],
  "tagSlugs": ["slip", "step-through", "uppercut", "pivot"]
}
```

- `title`: required, short drill name.
- `summary`: required for AI capture; one short factual sentence describing what the drill practices.
- `notes`: optional source-backed cues, reminders, or mistakes.
- `steps`: one or more ordered physical actions.
- `trainingMethodSlugs`: zero or more deterministic Training Method matches. The user must select at least one before saving.
- `tagSlugs`: deterministic matches from the active standard-tag taxonomy.

Core Idea, Status Tags, Custom Tag creation, confidence scores, training plans, and review dates are not capture outputs.

## Hybrid Flow

1. The client loads active taxonomy while the user writes the note.
2. A deterministic parser immediately selects explicit Training Methods and standard Tags only.
3. Those taxonomy controls become editable while title, summary, notes, and steps show a `Cleaning up...` state.
4. Ollama or OpenAI produces title, a required factual summary, optional notes, and ordered steps from the original note.
5. The text fields become editable when cleanup finishes. If cleanup fails, they unlock empty for manual entry and cleanup can be retried.
6. A retry never overwrites text the user edited after a failed cleanup; suggestions remain field-level and optional.

The deterministic parser is conservative:

- It uses curated aliases and active taxonomy rows only.
- It supports multiple explicitly named Training Methods.
- It does not assume Technical Work when no method is clear.
- It does not generate or display deterministic title, summary, notes, or steps.
- It does not infer mechanics that were not stated.

## Active Taxonomy

Training Methods:

- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

Standard Tag categories:

- Boxing: Jab, Cross, Hook, Uppercut, Body Shot
- Kicking: Teep, Round Kick, Low Kick
- Knees: Knee
- Elbows: Elbow
- Defense: Kick Check, Kick Catch, Parry, Long Guard
- Head Movement: Slip, Roll
- Footwork: Pivot, Switch Step, Step Through, Stance Switch
- Sweeps: Sweep
- Movement & Timing: Entry, Angle, Distance, Timing, Pressure, Feint
- Practice Format: Shadowboxing

Clinch is a Training Method, not a Tag. Shadowboxing is a Tag and maps to Technical Work when explicitly mentioned. Sweep is the only active sweep tag.

## AI Cleanup Rules

- Preserve the source sequence, side, stance, target, and mechanics.
- Do not add techniques, targets, cues, or details absent from the source.
- Always return one short factual summary without inventing benefits or objectives.
- Keep steps to ordered, observable actions that advance the sequence.
- Put guard, posture, pacing, reminders, constraints, mistakes, and other how-to-perform cues in notes.
- Never duplicate a note as a step. Return `null` for notes only when the source contains no actual cue.
- AI does not choose or modify Training Methods, standard Tags, Custom Tags, or Status Tags.

Draft generation is provider-backed. Local development defaults to Ollama with `qwen3:4b-instruct`; production can switch to OpenAI with `CAPTURE_DRAFT_PROVIDER=openai`. Both providers share the same API contract.

## Review And Failure Behavior

- If cleanup fails, empty text fields become editable so capture never blocks manual entry.
- Cleanup can be retried without resetting taxonomy or user-entered text.
- AI suggestions never overwrite user-owned fields.
- The user can apply queued suggestions individually or explicitly apply all.
- The original transcript exists only for the capture session and is not persisted separately.
