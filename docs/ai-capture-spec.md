# AI Capture Spec

## Purpose

Capture turns a messy typed note or voice memo into an editable Drill draft. It is a memory aid, not an autonomous coach: the user remains responsible for reviewing mechanics and taxonomy before saving.

Voice capture at `/capture/new?mode=voice&from=network|library` waits for the user to tap Record, captures up to two minutes, and transcribes after recording stops. Manual capture remains available at `/capture/new?mode=text&from=network|library`. Both paths use the same Capture Drill shell, draft shape, and review form.

## Voice Capture v1

- Voice recording is English-only and recording-only. Audio upload, live transcription, and hold-and-swipe entry are deferred.
- The browser prefers MP4, then WebM/Opus, then WebM. Ogg/Opus is accepted as an additional browser fallback.
- A live, request-scoped rolling trace visualizes roughly two seconds of microphone input as one continuous line crossing a center baseline. It does not modify the recording or persist waveform data.
- `POST /api/capture/transcribe` accepts one WebM, MP4, or Ogg recording up to 12 MB.
- Local development can use a private `whisper-server` with the `small.en` model. Hosted environments use OpenAI transcription because they cannot reach a developer machine's loopback address. Both providers receive the same fixed Muay Thai vocabulary prompt.
- Audio bytes and the raw transcript remain request/session-only. Neither is saved to Postgres or object storage.
- Microphone permission is requested only after the user taps Record.
- Cancelling microphone permission or an active recording discards the attempt and resets the timer to `0:00`.
- Stopping a recording freezes its duration and enters a bounded `Finalizing` state while the browser flushes its last audio chunk. Finalization waits at most five seconds.
- If finalization times out after producing audio, the partial completed recording is retained for retry. A timeout without any audio becomes a recorder error.
- Browser upload and transcription wait at most 190 seconds; the provider request remains capped at 180 seconds so its server error can surface first.
- Cancelling transcription, no-speech results, timeouts, and transcription failures keep completed audio in memory so the user can transcribe, record again, or discard it. Explicit Discard clears the in-memory audio and resets the recorder.
- Recording and transcription attempts carry session identities so late browser events cannot begin duplicate work.
- Development logs may report request IDs, elapsed stage times, MIME type, and byte size. They never log audio bytes or transcript text.
- Navigating away or saving aborts or ignores pending transcription/cleanup work.
- Capture guards header back, form Cancel, bottom navigation, browser Back, and refresh after unsaved work exists. In-app navigation uses the Capture discard confirmation; refresh and tab close use the browser warning.

Local setup:

```bash
npm run whisper:setup
npm run whisper:serve
```

Run Whisper in a separate terminal from Next.js. Phone microphone testing requires localhost or a secure HTTPS origin such as the development Cloudflare tunnel.

Hosted setup:

```bash
CAPTURE_TRANSCRIPTION_PROVIDER=openai
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Hosted transcription also requires the server-only `OPENAI_API_KEY` environment variable.

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
- `trainingMethodSlugs`: zero or more AI-selected values from the active Training Method taxonomy. The user must select at least one before saving.
- `tagSlugs`: AI-selected values from the active standard-tag taxonomy.

Core Idea, Status Tags, Custom Tag creation, confidence scores, training plans, and review dates are not capture outputs.

## Capture Flow

1. The client records a voice memo or accepts a typed note while active taxonomy loads.
2. Voice mode sends the recording to the configured transcription provider and receives an ephemeral transcript.
3. The review form opens with empty, editable taxonomy controls while all generated fields show a `Cleaning up...` state.
4. Ollama or OpenAI produces title, a required factual summary, optional notes, ordered steps, Training Methods, and standard Tags in one structured response.
5. The provider receives the active Training Method and standard-tag slugs as strict schema enums. Unknown slugs, custom tags, Saved Lists, Status Tags, and Core Idea cannot be returned.
6. AI taxonomy selection is semantic rather than alias-only: directly described pad work, partner work, feints, and stance changes may be selected even when the transcript uses natural phrasing.
7. Generated values automatically populate only untouched fields. Any Training Method, tag, text, or step collection edited while cleanup runs is preserved and the AI result is offered as an optional field-level suggestion.
8. If cleanup fails, the form unlocks empty for manual entry and cleanup can be retried.
9. Review keeps a compact transcript excerpt visible. Editing and regenerating the transcript replaces the current fields, Training Methods, and Tags only after confirmation.

AI taxonomy selection remains conservative:

- It can choose only active Training Methods and active standard tags supplied by the server.
- It may select multiple methods when the note describes multiple practice contexts.
- It does not assume Technical Work when no method is clear.
- It does not create custom tags or infer mechanics that are not stated or directly described.

## Active Taxonomy

Training Methods:

- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

Standard Tag categories:

- Boxing: Jab, Cross, Hook, Uppercut, Body Shot
- Kicking: Teep, Round Kick, Low Kick, Shift Kick, Rear Kick
- Knees: Knee
- Elbows: Elbow
- Defense: Kick Check, Kick Catch, Parry, Long Guard
- Head Movement: Slip, Roll
- Footwork: Pivot, Step Through, Stance Switch
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
- Select every source-supported Training Method and standard Tag, including explicitly mentioned optional variations.
- Use only active server-provided taxonomy slugs. Do not choose Custom Tags, Status Tags, or Core Idea.
- Do not select broad Movement & Timing tags from plausible benefits alone; the transcript must describe that concept as part of the drill.

Draft generation is provider-backed. Local development defaults to Ollama with `qwen3:4b-instruct`; production can switch to OpenAI with `CAPTURE_DRAFT_PROVIDER=openai`. Both providers share the same API contract.

## Review And Failure Behavior

- If cleanup fails, empty text fields become editable so capture never blocks manual entry.
- Cleanup can be retried without resetting taxonomy or user-entered text.
- AI suggestions never overwrite user-owned fields.
- The user can apply queued suggestions individually or explicitly apply all.
- The original transcript exists only for the capture session and is not persisted separately.
- Cleanup requests carry transcript-session and request identities. A late response from an older transcript revision is ignored.
- Capture uses phase-specific guidance: `Record the messy version.`, `Turning your memo into a drill.`, and `Check the transcript and drill before saving.`
