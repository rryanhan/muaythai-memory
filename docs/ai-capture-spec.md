# AI Capture Spec

## Purpose

AI capture turns a messy voice memo into a clean draft Drill.

The output should be useful enough for the user to quickly review and save, but not overloaded with fields.

Voice memo is the default capture path. Manual entry should use the same output fields and review flow.

Preferred capture control:

- Tap mic: record voice memo.
- Hold mic: reveal manual-input option.
- Hold and swipe up: open manual entry.

## MVP Output Shape

```json
{
  "title": "Slip Right Step-Through Uppercut Exit",
  "summary": "A counter drill for slipping the cross, stepping through into a temporary southpaw shape, firing the left uppercut, then exiting before the return shot.",
  "steps": [
    "Partner or pad holder feeds jab-cross at realistic rhythm.",
    "On the cross, slip right and let the right foot step slightly across so the stance turns southpaw.",
    "Keep the head off center and load the left side without standing up.",
    "Drive the left uppercut as the rear foot steps through back toward orthodox.",
    "Exit off-line with a small pivot or angle step instead of backing straight out."
  ],
  "trainingMethods": ["Partner Drill", "Pad Work"],
  "trainingTags": ["Slip", "Uppercut", "Step Through", "Stance Switch", "Angle"],
  "coreIdea": "Counter Rotation",
  "customTags": ["southpaw-transition", "sparring-focus"]
}
```

## Output Fields

- `title`: short, readable drill name.
- `summary`: one or two sentence explanation.
- `steps`: ordered drill steps.
- `trainingMethods`: one or more Training Methods.
- `trainingTags`: standard Tags from the app taxonomy.
- `coreIdea`: optional main training pattern the drill is teaching. Use `null` or leave empty when no clear idea is present.
- `customTags`: optional user-specific or app-suggested tags.

Allowed first-pass Training Methods:

- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

Use Technical Work for isolated mechanics, technique-first motions, stance transitions, balance drills, slow reps, solo motion practice, and other technical practice that is not clearly pad work, bag work, partner work, or clinch. Use `Shadowboxing` as a standard Tag, not a Training Method. Do not classify warmups as Muay Thai Training Methods in the MVP; warmup belongs in the later workout or conditioning system.

Allowed first-pass Tags are leaf tags inside these browse groups:

- Boxing: `Jab`, `Cross`, `Hook`, `Uppercut`, `Body Shot`
- Kicking: `Teep`, `Round Kick`, `Low Kick`
- Knees: `Knee`
- Elbows: `Elbow`
- Defense: `Kick Check`, `Kick Catch`, `Parry`, `Long Guard`
- Head Movement: `Slip`, `Roll`
- Footwork: `Pivot`, `Switch Step`, `Step Through`, `Stance Switch`
- Clinch: `Frame`, `Hand Trap`, `Hand Fighting`, `Body Lock`
- Sweeps And Dumps: `Sweep`, `Dump`
- Movement & Timing: `Entry`, `Angle`, `Distance`, `Timing`, `Pressure`, `Feint`
- Practice Format: `Shadowboxing`

## Capture Rules

- Extract one primary Core Idea when possible.
- Choose Core Idea from the app's predefined Core Idea taxonomy.
- If no standard Core Idea fits, set `coreIdea` to `null` and optionally include the user's wording as a Custom Tag if it is useful.
- If the memo describes a simple combination, general rep structure, bag round, pad round, or drill without one clear lesson, set `coreIdea` to `null`.
- Do not invent a Core Idea just to fill the field.
- Prefer standard Tags before creating Custom Tags.
- Do not duplicate the chosen Core Idea as a Tag. For example, if `coreIdea` is `Counter Rotation`, do not also add `Counter Rotation` to `trainingTags`.
- Do not use Training Methods as Tags.
- Do not use tag group labels as Tags. `Boxing`, `Kicking`, `Defense`, `Head Movement`, and `Footwork` are browse categories, not stored tags.
- Choose concrete leaf tags. Example: use `Jab`, `Cross`, and `Hook`, not `Boxing`; use `Kick Check` or `Parry`, not `Defense`.
- Use Custom Tags only when they capture useful personal meaning or something outside the standard taxonomy.
- Keep steps practical and coach-like, not textbook-like.
- Do not force confidence scores, status markers, review dates, or training plans into the capture output.
- If the voice memo is unclear, create the best draft possible and leave uncertain details out rather than inventing exact mechanics.

Core Idea taxonomy:

- Range Finding
- Feint To Draw
- Jab To Enter
- Teep To Interrupt
- Hand Trap Entry
- Pressure Entry
- Slip To Counter
- Parry To Counter
- Check And Return
- Catch And Return
- Shell And Return
- Roll And Return
- Counter Rotation
- Exit After Scoring
- Angle After Strike
- Angle After Defense
- Ring Cutting
- Stance Switch Attack
- Open Stance Attack
- Rhythm Change
- Frame To Knee
- Inside Control
- Posture Break
- Turn To Attack
- Catch To Sweep

Example distinction:

```json
{
  "title": "Jab Teep Feint To Shift Knee",
  "trainingMethods": ["Partner Drill", "Technical Work"],
  "trainingTags": ["Jab", "Teep", "Knee", "Entry", "Timing", "Feint"],
  "coreIdea": "Feint To Draw",
  "customTags": ["sparring-focus"]
}
```

No Core Idea example:

```json
{
  "title": "Jab Cross Rear Kick Pad Return",
  "trainingMethods": ["Pad Work"],
  "trainingTags": ["Jab", "Cross", "Round Kick", "Distance"],
  "coreIdea": null,
  "customTags": []
}
```

## User Review

After AI capture, the user should be able to edit:

- title
- summary
- steps
- trainingMethods
- trainingTags
- coreIdea
- customTags

Status markers and Training Plans can be added after saving.
