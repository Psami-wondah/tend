/**
 * Sets every money amount and clock time inside running text in the clock
 * numerals (Jost, tabular), so "$100.00" or "2:40 am" never picks up
 * Atkinson's slashed zero mid-sentence. One numeral system for every figure.
 */
const MONEY = /([−-]?[$£€]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d{1,2}:\d{2}\s?(?:am|pm)\b)/g;

export function Txt({ children }: { children: string }) {
  const parts = children.split(MONEY);
  // One inline element, so a flex parent's gap never lands inside the sentence.
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="figures">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}
