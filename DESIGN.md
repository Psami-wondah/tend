---
name: Tend
description: A family care pot read against everyone's clock, on a wall of city dials.
colors:
  enamel: "#f1f3f6"
  dial: "#ffffff"
  ink: "#12151c"
  ink-soft: "#4a5163"
  rule: "#d8dde6"
  rule-strong: "#b9c0cd"
  night: "#1c2250"
  night-deep: "#141a3f"
  night-cell: "#2c3473"
  night-ink: "#f0f2fb"
  night-soft: "#b9bfe0"
  day: "#edc66f"
  brass: "#a9792a"
  brass-deep: "#7d5718"
  person-brass: "#a9792a"
  person-cobalt: "#2c5bd4"
  accent: "#2c3473"
  night-dark-theme: "#0b0f26"
  person-violet: "#7448c4"
  person-magenta: "#b8306f"
  person-teal: "#0f7f86"
  person-rust: "#b4532a"
  paid: "#1d7650"
  paid-tint: "#e1f1e9"
  paid-ink: "#ffffff"
  wait: "#a85f00"
  wait-tint: "#fbefd9"
  stop: "#bf3528"
  stop-tint: "#f9e3df"
  stop-ink: "#ffffff"
  second-hand: "#d23a2c"
  action: "#1c2250"
  action-hover: "#141a3f"
  action-ink: "#f0f2fb"
  face-day: "#ffffff"
  face-night: "#1c2250"
  hand-day: "#12151c"
  hand-night: "#f0f2fb"
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
  card: "16px"
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
    padding: "16px"
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
    backgroundColor: "{colors.enamel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dial}"
    padding: "4px 12px 4px 8px"
    height: "32px"
  person-chip-asleep:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-ink}"
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

**Creative North Star: "The Family Clock Wall"**

Tend reads like the row of city clocks in a diaspora living room. The family lives in four time zones, so every screen reads the care pot against everyone's clock: white enamel dials on a cool enamel ground, a committed night-indigo shell for headers and anything asleep, brass for Mum's home clock, and one colour per person that follows them everywhere. The memorable moment is the clock row, where asleep siblings' dials go to night and a waiting payment shows who is awake to approve it.

The system is calm and operational. Density is moderate on phones (16px gutters, 16px card padding) and the type is large: body copy never drops below 15px, and labels are bold rather than small. Amounts and clock times are set in one numeral system, Jost with tabular lining figures at fixed steps, so any two amounts compare at a glance. Every line people read is Atkinson Hyperlegible Next. Depth is mostly tonal: white dial surfaces sitting on enamel, with soft ambient shadow reserved for the dials themselves and for the one card that is waiting on you.

It refuses the category default: a green balance card over a stack of white cards that could belong to any budgeting app. The balance lives in the night header, not in a card, and green is a state (paid), never the brand.

**Key Characteristics:**
- Night-indigo header carrying the brand, the viewer, the pot and the 24-cell day band.
- CSS clock dials with a person-coloured bezel, a red second-hand pin, and a night face when that person is asleep.
- One colour per person (bezels, dots, chips, contribution bars), never relabelled.
- State colours (paid, waiting, refused) always paired with a word and an icon.
- One numeral face (Jost, tabular) for every amount and every time, including inside sentences.
- A dark theme that turns the ground itself to night indigo; clock faces keep their day/night meaning in both.
- Mum's screen: two-value contrast, very large type in three steps, 80-96px targets.

## Colors

A cool, near-neutral enamel and white ground under a deep night-indigo shell, with brass and six person hues as identity, and three semantic state colours that never travel alone.

### Primary
- **Night Indigo** (`night`): the committed shell colour. The header band, asleep dial faces (`face-night`), asleep approver chips, the active bottom-tab pill and primary actions (`action`) on light. Also the text-selection colour.
- **Night Deep** (`night-deep`): hover for primary actions; the darker step of the shell.
- **Night Cell** (`night-cell`): the night hours of the day band and neutral progress bars on night or enamel (the welcome stage strip).

### Secondary
- **Clock Brass** (`brass`, `brass-deep`): Mum's home clock. It is her person colour (`person-brass`) and the warm metal of the wall.
- **Day Gold** (`day`): the daytime hours of the day band, the Demo badge on the night header, and the focus ring on night surfaces.

### Tertiary (person colours)
- **Cobalt, Violet, Magenta, Teal, Rust** (`person-cobalt` through `person-rust`) plus brass: six assignable identities. A member's colour paints their dial bezel, their dot in the day band and chips, their contribution bar, and their viewer-switch dot. In the demo family Ada is cobalt, Tunde violet, Chioma magenta, Mum brass.
- **Second-Hand Red** (`second-hand`): only the centre pin of a dial.

- **Accent** (`accent`, #2c3473; #c3cbf5 in dark): Tend's own interaction colour, a lighter step of the night shell. Focus ring, caret, field focus, passbook grid hover and selection, Ask Tend and rules-assistant icons, the double-payment card, and PayPal's dot in the payment timeline. It replaced an earlier use of Ada's cobalt for these jobs, so no person's colour does interface work.

### Semantic
- **Paid Green** (`paid` / `paid-tint` / `paid-ink`): paid and approved states, the Approve button, completed stages, approver chips that have said yes.
- **Waiting Amber** (`wait` / `wait-tint`): needs approval, on hold, the current stage, the border of a card waiting on you, Simulated tags.
- **Refused Red** (`stop` / `stop-tint` / `stop-ink`): refused, failed, decline confirmation, recoveries owed, errors.

### Neutral
- **Enamel** (`enamel`): the page ground, quiet badges, chip fill, grid header row.
- **Dial White** (`dial`, `face-day`): cards, fields, secondary buttons, day dial faces.
- **Ink** (`ink`, `hand-day`) and **Ink Soft** (`ink-soft`): text and secondary text; day dial hands.
- **Night Ink** (`night-ink`, `hand-night`) and **Night Soft** (`night-soft`): text on the night shell; night dial hands.
- **Rule** (`rule`) and **Rule Strong** (`rule-strong`): dividers and field borders; secondary-button borders and underlines.

In the dark theme (`prefers-color-scheme: dark`) the ground becomes indigo (enamel `#11152f`, dial `#1a2046`), the shell deepens to `#0b0f26`, person and state colours lift to lighter values for contrast, state inks go dark, and `action` flips to near-white with indigo ink.

### Named Rules
**The One Colour Per Person Rule.** A person's colour is theirs everywhere they appear. The colour, not a repeated name, is what ties a dot in the day band to a dial and a chip. Interface jobs use `accent`, never a person colour.

**The Word-And-Icon Rule.** Paid, waiting and refused colours never appear without a word and an icon (or, on the stage strip, a word). Colour alone never carries state.

**The Night Is Asleep Rule.** Indigo means night: the shell, an asleep dial, an asleep approver. Clock faces keep this meaning in either theme; white is day, indigo is night.

## Typography

**Display Font:** Jost (with Futura, system-ui)
**Body Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system-ui)

**Character:** Jost's geometric lobby-clock numerals carry amounts, times, headings and the wordmark; Atkinson Hyperlegible Next carries every line people read, Mum included. The pair reads like a city clock above a printed timetable.

### Hierarchy
- **Money XL** (600, 3.25rem, line-height 1, -0.02em, tabular): the pot balance in the night header.
- **Display** (600, 2.5rem rising to 3.5rem from 640px, 1.05, -0.02em): the welcome headline only.
- **Money LG** (600, 2.125rem, 1, -0.01em, tabular): the amount on a payment card.
- **Headline** (600, 2rem, 1, -0.01em): page titles on Passbook, Ask, Rules, Payees, Setup.
- **Title** (600, 1.375rem, tight, -0.01em): section headings; 1.75rem on the welcome page.
- **Body** (400, 1rem, 1.5): reading text. Payee names on cards are body at 1.125rem bold.
- **Body Small** (400, 0.9375rem): card copy, reasons, captions; the floor for anything people read.
- **Label** (700, 0.875rem): status badges, chips, tabs, field labels, quiet buttons. Sentence case, no tracking.
- **Figures** (Jost 500, tabular lining): every amount and clock time in running text at the surrounding size; the money steps are fixed at xl / lg / md (1.125rem) / sm (1rem).

Mum's screen scales in `em` from a chosen base of 1.25rem, 1.5rem or 1.8rem: greeting 2.4em, result heading 2.6em, action labels 1.45em.

### Named Rules
**The One Numeral System Rule.** Every amount and every time is Jost with tabular lining figures, including mid-sentence and inside chips (the inline figures wrapper does this). Atkinson's slashed zero never appears in a figure.

**The Fixed Steps Rule.** Amounts use only the four money steps. A new screen picks a step; it does not invent a size.

## Layout

Phones first. Content sits in a centred column (max 64rem for most screens, 72rem for the passbook) with 16px side gutters, 24px from 640px. The night header spans the full width and holds page-specific header content (pot, day band) beneath the brand row. Spacing runs on a 4px base, with 8px and 12px as the common gaps, 16px card padding (20px from 640px) and 16-24px between sections.

Below 768px a fixed bottom tab bar of five equal cells (Home, Passbook, Ask Tend, Rules, Payees), 64px tall, sits over a translucent dial-white panel with backdrop blur and safe-area padding; from 768px the tabs move into the header as inline links. The clock row is always a four-column grid of 56px dials. Stage strips are a four-column grid at one fixed scale so any two payments compare. Mum's screen is a single 36rem column, one decision per screen, with safe-area insets.

## Elevation & Depth

Mostly flat and tonal: white dial surfaces on enamel, divided by 1px rules. Shadow is ambient and rare, used where something should feel like an object on the wall or demands attention now. There are no hard or offset shadows.

### Shadow Vocabulary
- **Dial** (`0 1px 2px rgb(18 21 28 / 0.08), 0 6px 14px -6px rgb(18 21 28 / 0.25)`): every clock dial, so it sits proud of the ground.
- **Waiting card** (`0 1px 2px rgb(18 21 28 / 0.05), 0 10px 24px -14px rgb(18 21 28 / 0.25)`): the approval card that needs you.
- **Hairline** (`0 1px 2px rgb(18 21 28 / 0.05)`): the passbook grid wrapper.
- **Review sheet** (`0 12px 40px -12px rgb(18 21 28 / 0.45)`): the rule-change review panel that rises into view.

### Named Rules
**The Flat Ground Rule.** Ordinary cards and lists carry no shadow; only dials and something waiting on you lift.

## Shapes

Round where the world is round: dials, dots, chips, badges and the active-tab pill are full circles or pills. Everything else uses gently curved rectangles in three steps: 12px for buttons and fields, 16px for cards, lists and the grid wrapper, 24px for Mum's large actions and result panel. Day-band cells are near-square (2px) and stage bars are thin 6px pills. Borders are 2px when they mean something (field, secondary button, waiting card at 35% amber, unverified payee at 40% amber) and 4px on Mum's screen. Ask Tend bubbles tuck one corner (6px) toward the speaker.

## Components

### Buttons
Solid, wide and unmistakable; every button is at least 48px tall.
- **Shape:** gently curved (12px).
- **Primary:** night indigo with night-ink text, 20px side padding, bold 1rem. Hovers to night deep. In dark mode it becomes near-white with indigo text.
- **Approve:** paid green with paid-ink, carrying the amount in figures ("Approve $340.00"); hovers 5% darker. Sits full-width beside Decline.
- **Secondary:** dial white, 2px rule-strong border, ink text; border goes to ink on hover.
- **Danger (Decline):** secondary at rest; border and text go to refused red on hover. Declining always asks for a confirmation in a refused-tint panel.
- **Quiet:** bold small ink-soft text with a rule-strong underline, 40px tall.
- **Disabled:** 55% opacity, not-allowed cursor. **Focus:** 3px accent outline, 2px offset; day gold on night surfaces.

### Chips
- **Person chip:** pill, 32px tall, enamel fill, person dot, bold name, then a quiet note in figures ("awake, 9:40 pm").
- **States:** asleep chips go night indigo with night-soft notes; approved chips go paid tint with a green note and check.
- **Status badge:** pill, tinted fill, coloured bold label and a matching icon; "Paying now" spins its icon.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** dial white on enamel; lists are dial-white panels divided by rule lines.
- **Shadow Strategy:** none, except the waiting approval card (see Elevation).
- **Border:** none by default; a 2px state-tinted border marks a card that needs action.
- **Internal Padding:** 16px, 20px from 640px.

### Inputs / Fields
- **Style:** 48px tall, dial white, 2px rule border, 12px radius, 14px side padding, 1rem text; accent caret.
- **Focus:** border turns accent, no outline.
- **Error:** bold refused-red message below, or a refused-tint alert strip.

### Navigation
- **Header:** night indigo, Tend wordmark in Jost 600 (1.625rem), Demo badge in day gold, viewer switch as a translucent night-ink pill with the viewer's dot.
- **Bottom tabs (phones):** icon over bold 12px label; the active tab fills a 48x28 pill in `action` and its label turns `action`; inactive is ink-soft.
- **Top tabs (768px+):** bold 15px night-soft links; active gets a 12% night-ink fill.

### Clock Dial (signature)
A white or night face sized by context (56px in the clock row), a bezel in the person's colour (size/16, min 3px), four hour ticks at 45% hand colour, hour and minute hands, and a red second-hand pin. The face goes night when the person's local hour is outside the day. Hands sweep 120 degrees into place once on load (900ms, ease-out). Each dial is labelled for screen readers with name, city, time and "probably asleep".

### Day Band (signature)
Twenty-four 10px-tall cells with 2px gaps, day gold for daytime hours and night cell for the rest, under the header. Each person's 12px dot sits at their own local hour, ringed in night; "midnight / noon / midnight" in 11px night-soft below.

### Stages and Reasons
- **Stages:** a payment's life at one fixed scale: Read, Rules, Family, PayPal. Each is a 6px bar (green done, amber now, red failed, rule for skipped or to-do) over a 13px label and a 12px note.
- **Reasons:** each rule's verdict as a 20px tinted circle with a check, clock, question or cross, followed by the plain sentence with figures set in Jost.

### Passbook Grid
AG Grid Quartz themed from the tokens: Atkinson at 15px (14px bold headers), dial-white rows on an enamel header, rule borders, 52px rows, 44px header, accent colour with a 7% accent hover and 12% selection, 16px wrapper radius, no wrapper border. Wrapped cells on phones read as text at 1.35 line-height.

### Mum's Screen
Two-value contrast: every result is ink on a light field or white on a deep one. Paid and refused results are solid paid or stop panels; waiting results are dial white with a 4px amber border. Large actions are 80-96px tall with 30-36px icons, a 24px radius and 4px or 2px borders. Results speak aloud and rise into place.

### Motion
Hands sweep once on load. State changes use the translate-only rise (6px upward, 220ms, cubic-bezier(0.16, 1, 0.3, 1)), with content visible from the first frame. Colour transitions are 200ms. Pulses run only on live states (recording, waiting for PayPal, loading), and skeletons shimmer while loading. Reduced motion turns everything off.

## Do's and Don'ts

### Do:
- **Do** put the pot balance in the night header in Money XL, never in a card.
- **Do** give every person their one colour on every bezel, dot, chip and bar they own.
- **Do** pair every paid, waiting or refused colour with a word and an icon.
- **Do** set every amount and every time in Jost tabular figures, including inside sentences and chips.
- **Do** go to night (indigo face, night chip, moon icon) for anyone whose local hour is outside the day.
- **Do** keep buttons and fields at 48px minimum and Mum's actions at 80px or more.
- **Do** keep reading text at 15px or larger in Atkinson Hyperlegible Next.

### Don't:
- **Don't** build the green balance card over a stack of white cards; green is the paid state, not the brand.
- **Don't** use a person colour for a category, a chart series or a state, and don't use any person's colour for interface jobs; that is what `accent` is for.
- **Don't** set a figure in Atkinson or invent an amount size outside the four money steps.
- **Don't** add shadow to ordinary cards, and never use hard or offset shadows.
- **Don't** animate beyond the hand sweep, the rise, 200ms colour changes and pulses on live states.
- **Don't** use uppercase tracked labels; labels are bold sentence case.
