---
name: Tend
description: A second key for someone's money, read against their circle's clocks.
colors:
  enamel: "#ffffff"
  dial: "#ffffff"
  ink: "#172238"
  ink-soft: "#536176"
  rule: "#dde3eb"
  rule-strong: "#9ca9bc"
  night: "#19233e"
  night-deep: "#111a30"
  night-cell: "#354568"
  night-ink: "#f3f6fc"
  night-soft: "#b9c5db"
  day: "#c7d7f1"
  brass: "#65788f"
  brass-deep: "#43566e"
  person-brass: "#65788f"
  person-cobalt: "#2c5bd4"
  accent: "#394f7c"
  night-dark-theme: "#0c1424"
  person-violet: "#7448c4"
  person-magenta: "#b8306f"
  person-teal: "#0f7f86"
  person-rust: "#b4532a"
  paid: "#1d7650"
  paid-tint: "transparent"
  paid-ink: "#ffffff"
  wait: "#a85f00"
  wait-tint: "transparent"
  stop: "#bf3528"
  stop-tint: "transparent"
  stop-ink: "#ffffff"
  second-hand: "#d23a2c"
  action: "#223454"
  action-hover: "#14243e"
  action-ink: "#f3f6fc"
  face-day: "#ffffff"
  face-night: "#19233e"
  hand-day: "#172238"
  hand-night: "#f3f6fc"
typography:
  display-xl:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  wordmark:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  caption:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.25
  micro:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.2
  mum-base-1:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.375
  mum-base-2:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.375
  mum-base-3:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 400
    lineHeight: 1.375
  money-xl:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  display:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  money-lg:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  headline:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  figures:
    fontFamily: "Jost, Futura, system-ui, sans-serif"
    fontWeight: 500
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.375
  label:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.25
rounded:
  cell: "2px"
  focus: "6px"
  md: "8px"
  lg: "12px"
  card: "24px"
  mum: "24px"
  dial: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-approve:
    backgroundColor: "{colors.paid}"
    textColor: "{colors.paid-ink}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.dial}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-quiet:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "40px"
  field:
    backgroundColor: "{colors.dial}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "48px"
  card:
    backgroundColor: "{colors.dial}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  status-badge-paid:
    backgroundColor: "{colors.paid-tint}"
    textColor: "{colors.paid}"
    typography: "{typography.label}"
    rounded: "{rounded.dial}"
    padding: "4px 10px"
  status-badge-wait:
    backgroundColor: "{colors.wait-tint}"
    textColor: "{colors.wait}"
    typography: "{typography.label}"
    rounded: "{rounded.dial}"
    padding: "4px 10px"
  status-badge-stop:
    backgroundColor: "{colors.stop-tint}"
    textColor: "{colors.stop}"
    typography: "{typography.label}"
    rounded: "{rounded.dial}"
    padding: "4px 10px"
  person-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.dial}"
    padding: "4px 12px 4px 8px"
    height: "32px"
  person-chip-asleep:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.dial}"
    padding: "4px 12px 4px 8px"
    height: "32px"
  person-chip-done:
    backgroundColor: "{colors.paid-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dial}"
    padding: "4px 12px 4px 8px"
    height: "32px"
  night-header:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-ink}"
    padding: "12px 16px 16px"
  tab-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.dial}"
    width: "48px"
    height: "28px"
  demo-badge:
    backgroundColor: "{colors.day}"
    textColor: "{colors.night}"
    rounded: "{rounded.dial}"
    padding: "4px 10px"
  mum-action:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.mum}"
    padding: "0 24px"
    height: "96px"
---

# Design System: Tend

## Overview

**Creative North Star: "The Circle Clock Wall"**

Tend reads like the row of city clocks in a diaspora living room. A circle can span time zones, so every screen reads money against everyone's clock: porcelain dials on a cool ground, a midnight-indigo shell for headers and anything asleep, slate for the home clock, and one colour per person that follows them everywhere. The memorable moment is the clock row, where asleep people's dials go to night and a waiting payment shows who is awake to approve it.

The system is calm and operational. Density is moderate on phones (16–20px gutters, 20–28px panel padding) and the type is large: body copy never drops below 15px, and labels are bold rather than small. Amounts and clock times are set in one numeral system, Jost with tabular lining figures at fixed steps, so any two amounts compare at a glance. Every line people read is Atkinson Hyperlegible Next. Surfaces are flat: the page and its panels share one neutral ground in each theme, separated by rules and whitespace. Status colour appears in text and icons without a matching tinted background.

It refuses the category default: a green balance card over a stack of white cards that could belong to any budgeting app. The balance lives in the night header, not in a card, and green is a state (paid), never the brand.

**Key Characteristics:**
- Night-indigo header carrying the brand, the viewer, the pot and the 24-cell day band.
- CSS clock dials with a person-coloured bezel, a red second-hand pin, and a night face when that person is asleep.
- One colour per person (bezels, dots, chips, contribution bars), never relabelled.
- State colours (paid, waiting, refused) always paired with a word and an icon.
- One numeral face (Jost, tabular) for every amount and every time, including inside sentences.
- A dark theme that turns the ground itself to night indigo; clock faces keep their day/night meaning in both.
- The person's screen: two-value contrast, very large type in three steps, 96–104px targets.

## Colors

**Flat Surface Rule:** avoid a colour placed on a lighter or darker tint of itself. Use one neutral ground, borders, and whitespace for grouping. Semantic labels carry colour through words and icons. Solid high-contrast primary actions and person-screen results remain appropriate. Historic tint tokens resolve to transparent, including in protected components.

There is no decorative gold, shade-on-shade layering, tinted status pill, translucent card, or decorative gradient. The shell, daylight strip, focus rings, and home-clock identity use cool hues. Amber is reserved for waiting or a payment needing attention.

A cool, near-neutral enamel and white ground under a deep night-indigo shell, with slate and six person hues as identity, and three semantic state colours that never travel alone.

### Primary
- **Night Indigo** (`night`): the committed shell colour. The header band, asleep dial faces (`face-night`), asleep clock faces, selected controls and primary actions (`action`) on light. Also the text-selection colour.
- **Night Deep** (`night-deep`): hover for primary actions; the darker step of the shell.
- **Night Cell** (`night-cell`): the night hours of the day band and neutral progress bars on night or enamel (the welcome stage strip).

### Secondary
- **Clock Slate** (`brass`, `brass-deep`): the home clock's cool slate identity (`person-brass`). Historic token names remain because stored identities reference them; they no longer render gold or brass.
- **Daylight Blue** (`day`): the daytime hours of the day band, the decorative details, and the focus ring on night surfaces.

### Tertiary (person colours)
- **Cobalt, Violet, Magenta, Teal, Rust** (`person-cobalt` through `person-rust`) plus slate: six assignable identities. A member's colour paints their dial bezel, their dot in the day band and chips, their contribution bar, and their viewer-switch dot. In the Okafor demo Ada is cobalt, Tunde violet, Chioma magenta, the person at the centre slate.
- **Second-Hand Red** (`second-hand`): only the centre pin of a dial.

- **Accent** (`accent`, #394f7c; #c0d2f2 in dark): Tend's own interaction colour, a lighter step of the night shell. Focus ring, caret, field focus, passbook grid hover and selection, Ask Tend and rules-assistant icons, the double-payment card, and PayPal's dot in the payment timeline. It replaced an earlier use of Ada's cobalt for these jobs, so no person's colour does interface work.

### Semantic
- **Paid Green** (`paid` / `paid-tint` / `paid-ink`): paid and approved states, the Approve button, completed stages, approver chips that have said yes.
- **Waiting Amber** (`wait` / `wait-tint`): needs approval, on hold, the current stage, the border of a card waiting on you. Simulated tags use neutral enamel.
- **Refused Red** (`stop` / `stop-tint` / `stop-ink`): refused, failed, decline confirmation, recoveries owed, errors.

### Neutral
- **Enamel** (`enamel`): the page and panel ground, grid header row.
- **Dial White** (`dial`, `face-day`): cards, fields, secondary buttons, day dial faces.
- **Ink** (`ink`, `hand-day`) and **Ink Soft** (`ink-soft`): text and secondary text; day dial hands.
- **Night Ink** (`night-ink`, `hand-night`) and **Night Soft** (`night-soft`): text on the night shell; night dial hands.
- **Rule** (`rule`) and **Rule Strong** (`rule-strong`): dividers and field borders; secondary-button borders and underlines.

In the dark theme (`prefers-color-scheme: dark`) the ground becomes indigo (enamel `#151b24`, dial `#151b24`), the shell deepens to `#0c1424`, person and state colours lift to lighter values for contrast, state inks go dark, and `action` flips to near-white with indigo ink.

### Named Rules
**The One Colour Per Person Rule.** A person's colour is theirs everywhere they appear. The colour, not a repeated name, is what ties a dot in the day band to a dial and a chip. Interface jobs use `accent`, never a person colour.

**The Word-And-Icon Rule.** Paid, waiting and refused colours never appear without a word and an icon (or, on the stage strip, a word). Colour alone never carries state.

**The Night Is Asleep Rule.** Indigo means night: the shell, an asleep dial, an asleep approver. Clock faces keep this meaning in either theme; white is day, indigo is night.

## Typography

**Display Font:** Jost (with Futura, system-ui)
**Body Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system-ui)

**Character:** Jost's geometric lobby-clock numerals carry amounts, times, headings and the wordmark; Atkinson Hyperlegible Next carries every line people read, the person at its centre included. The pair reads like a city clock above a printed timetable.

### Hierarchy
- **Money XL** (600, 3.25rem, line-height 1, -0.02em, tabular): the pot balance in the night header.
- **Display** (500, 3.35rem rising to 5.25rem on desktop, 1.02, -0.045em): the welcome headline only.
- **Money LG** (600, 2.125rem, 1, -0.01em, tabular): the amount on a payment card.
- **Headline** (600, 2–2.75rem, 1.12, -0.035em): page titles on Passbook, Ask, Rules, Payees, Setup.
- **Title** (500, 1.5rem, tight, -0.025em): section headings; 1.75rem on the welcome page.
- **Body** (400, 1rem, 1.5): reading text. Payee names on cards are body at 1.125rem bold.
- **Body Small** (400, 0.9375rem): card copy, reasons, captions; the floor for anything people read.
- **Label** (700, 0.875rem): status badges, chips, tabs, field labels, quiet buttons. Sentence case, no tracking.
- **Figures** (Jost 500, tabular lining): every amount and clock time in running text at the surrounding size; the money steps are fixed at xl / lg / md (1.125rem) / sm (1rem).

The person's screen scales in `em` from a chosen base of 1.25rem, 1.5rem or 1.8rem: greeting 2.4em, result heading 2.6em, action labels 1.45em.

### Named Rules
**The One Numeral System Rule.** Every amount and every time is Jost with tabular lining figures, including mid-sentence and inside chips (the inline figures wrapper does this). Atkinson's slashed zero never appears in a figure.

**The Fixed Steps Rule.** Amounts use only the four money steps. A new screen picks a step; it does not invent a size.

## Layout

The landing page uses a two-level editorial headline with paired phone previews . Inside Tend, fine rules, clearly grouped panels, and a framed clock wall establish a quieter task hierarchy. Presentation changes preserve requests, handlers, form fields, and component contracts.

Phones first. Content sits in a centred column (max 72rem for most screens, 80rem for the passbook) with 16px side gutters, 32px from 640px. The night header spans the full width and holds page-specific header content (pot, day band) beneath the brand row. Spacing runs on a 4px base, with 8px and 12px as the common gaps, 20–28px panel padding and 32–40px between sections.

Below 1024px a fixed bottom tab bar of five equal cells (Home, Passbook, Ask Tend, Rules, Payees), 76px tall, sits over an opaque neutral surface with safe-area padding; from 1024px the tabs move into the header as inline links. The clock row wraps to fit the circle, with 56px dials. Stage strips are a four-column grid at one fixed scale so any two payments compare. The person's screen is a single 42rem column, one decision per screen, with safe-area insets.

## Elevation & Depth

One flat neutral surface per theme, divided by 1px rules. Ordinary panels, callouts, badges, and navigation have no shadows or tinted backplates. Clock dials retain their physical face and small shadow so day and night remain recognizable.

### Shadow Vocabulary
- **Dial** (`0 1px 2px rgb(18 21 28 / 0.08), 0 6px 14px -6px rgb(18 21 28 / 0.25)`): every clock dial, so it sits proud of the ground.
- **Waiting card:** an outline carries emphasis, with no shadow.
- **Passbook:** a fine rule encloses the grid.
- **Review sheet:** an opaque neutral surface with a strong outline.

### Named Rules
**The Flat Ground Rule.** Ordinary cards and lists carry no shadow; only clock dials lift.

## Shapes

Round where the world is round: dials, dots and clock bezels are circles. Status labels and person names are unfilled text, paired with icons or personal dots. Everything else uses gently curved rectangles in three steps: 12–16px for fields and buttons, 24px for panels, lists, the grid wrapper, and large person-screen actions. Day-band cells are near-square (2px) and stage bars are thin 6px pills. Borders are 2px when they mean something (field, secondary button, waiting card at 35% amber, unverified payee at 40% amber) and 4px on the person's screen. Ask Tend bubbles tuck one corner (6px) toward the speaker.

## Components

### Buttons
Solid, wide and unmistakable; every button is at least 48px tall.
- **Shape:** gently curved (16px), with pills for landing-page calls to action.
- **Primary:** night indigo with night-ink text, 20px side padding, bold 1rem. Hovers to night deep. In dark mode it becomes near-white with indigo text.
- **Approve:** paid green with paid-ink, carrying the amount in figures ("Approve $340.00"); hovers 5% darker. Sits full-width beside Decline.
- **Secondary:** dial white, 1px rule-strong border, ink text; border goes to ink on hover.
- **Danger (Decline):** secondary at rest; border and text go to refused red on hover. Declining always asks for confirmation beside a refused-colour rule.
- **Quiet:** bold small ink-soft text with a rule-strong underline, 48px tall.
- **Disabled:** 55% opacity, not-allowed cursor. **Focus:** 3px accent outline, 2px offset; daylight blue on night surfaces.

### Chips
- **Person label:** unfilled, with a person dot, bold name, then a quiet note in figures ("awake, 9:40 pm").
- **States:** asleep is written explicitly; approved has a green note and check. Neither uses a coloured backplate.
- **Status label:** coloured bold text and a matching icon on the surrounding neutral surface; "Paying now" spins its icon. No pill, fill, or matching shade behind it.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** the same neutral surface as the page; lists are divided by rule lines.
- **Shadow Strategy:** none.
- **Border:** 1px rule by default; a 2px state-tinted border marks a card that needs action.
- **Internal Padding:** 20–28px, according to context.

### Inputs / Fields
- **Style:** 52px tall, dial white, 1px rule-strong border, 12px radius, 16px side padding, 1rem text; accent caret.
- **Focus:** border and visible outline turn accent.
- **Error:** bold refused-red message below, beside a refused-colour rule.

### Navigation
- **Header:** night indigo, Tend wordmark in Jost 500 (1.875rem), Demo badge outlined in night-soft, viewer link with the viewer's dot and a simple divider.
- **Bottom tabs (phones):** icon over bold 12px label; the active tab has a short underline and its label turns `action`; inactive is ink-soft.
- **Top tabs (1024px+):** bold 15px night-soft links; active gets a clear underline.

### Clock Dial (signature)
A white or night face sized by context (56px in the clock row), a bezel in the person's colour (size/16, min 3px), four hour ticks at 45% hand colour, hour and minute hands, and a red second-hand pin. The face goes night when the person's local hour is outside the day. Hands sweep 120 degrees into place once on load (900ms, ease-out). Each dial is labelled for screen readers with name, city, time and "probably asleep".

### Day Band (signature)
Twenty-four 10px-tall cells with 2px gaps, daylight blue for daytime hours and night cell for the rest, under the header. Each person's 12px dot sits at their own local hour, ringed in night; "midnight / noon / midnight" in 11px night-soft below.

### Stages and Reasons
- **Stages:** a payment's life at one fixed scale: Read, Rules, Family, PayPal. Each is a 6px bar (green done, amber now, red failed, rule for skipped or to-do) over a 13px label and a 12px note.
- **Reasons:** each rule's verdict as an unfilled check, clock, question or cross, followed by the plain sentence with figures set in Jost.

### Passbook Grid
AG Grid Quartz themed from the tokens: Atkinson at 15px (14px bold headers), dial-white rows on an enamel header, rule borders, 52px rows, 44px header, accent colour with a 7% accent hover and 12% selection, 24px wrapper radius with a fine rule border. Wrapped cells on phones read as text at 1.35 line-height.

### The Person's Screen
Two-value contrast: every result is ink on a light field or white on a deep one. Paid and refused results are solid paid or stop panels; waiting results are dial white with a 4px amber border. Large actions are 96–104px tall with 30-36px icons, a 24px radius and 4px or 2px borders. Results speak aloud and rise into place.

### Motion
Hands sweep once on load. State changes use the translate-only rise (6px upward, 220ms, cubic-bezier(0.16, 1, 0.3, 1)), with content visible from the first frame. Colour transitions are 200ms. Pulses run only on live states (recording, waiting for PayPal, loading), and skeletons pulse on a single flat fill while loading. Reduced motion turns everything off.

## Copy

Say “AI”, without model names. Generic interface copy refers to the person and their circle; do not assume they are a parent or have children. Named demo stories may describe their actual relationships. Keep VIDEO_SCRIPT.md shot-list labels verbatim.

## Do's and Don'ts

### Do:
- **Do** put the pot balance in the night header in Money XL, never in a card.
- **Do** give every person their one colour on every bezel, dot, chip and bar they own.
- **Do** pair every paid, waiting or refused colour with a word and an icon.
- **Do** set every amount and every time in Jost tabular figures, including inside sentences and chips.
- **Do** go to night (indigo face, night chip, moon icon) for anyone whose local hour is outside the day.
- **Do** keep buttons and fields at 48px minimum and the person's actions at 96px or more.
- **Do** keep reading text at 15px or larger in Atkinson Hyperlegible Next.

### Don't:
- **Don't** build the green balance card over a stack of white cards; green is the paid state, not the brand.
- **Don't** use a person colour for a category, a chart series or a state, and don't use any person's colour for interface jobs; that is what `accent` is for.
- **Don't** set a figure in Atkinson or invent an amount size outside the four money steps.
- **Don't** add shadow to ordinary cards, and never use hard or offset shadows.
- **Don't** animate beyond the hand sweep, the rise, 200ms colour changes and pulses on live states.
- **Don't** use uppercase tracked labels; labels are bold sentence case.
