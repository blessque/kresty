const NBSP = ' ';

/**
 * Russian short function words that must not be left at the end of a line
 * (Мильчин; Артлебедев's «Ководство» §62). One-letter words are handled by
 * length, so this list is only the 2–4 letter ones.
 *
 * Deliberately excludes particles («же», «ли», «бы») — those must not START a
 * line, which is the opposite rule and needs a different binding direction.
 */
const SHORT_PREPOSITIONS = new Set([
  // prepositions
  'во',
  'до',
  'за',
  'из',
  'ко',
  'на',
  'об',
  'от',
  'по',
  'со',
  'без',
  'для',
  'изо',
  'над',
  'обо',
  'под',
  'при',
  'про',
  'близ',
  'вне',
  'меж',
  'перед',
  'через',
  // conjunctions — same rule, same direction: they lead the clause that
  // follows, so an orphaned one at a line end reads as a stumble
  'но',
  'да',
  'ни',
  'то',
  'или',
  'ибо',
  'как',
  'что',
  'чем',
  'либо',
  'если',
  'чтоб',
  'хотя',
  'пока',
  'зато',
  'чтобы',
]);

/** strip anything that is not a letter/digit so «(для» or «по,» still match */
function bare(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

function isBindable(word: string): boolean {
  const b = bare(word);
  if (!b) return false;
  // every one-character word (и, о, в, с, а, к, у, я — and the day in a date)
  if (b.length === 1) return true;
  // A numeral must not be orphaned from what it counts (Мильчин §6.2): «126
  // номеров», «2 ресторана», «240 машино-мест». The map's hover summary is
  // exactly this shape in a 320px column, so it would break there constantly.
  if (/^\d+$/.test(b)) return true;
  return SHORT_PREPOSITIONS.has(b);
}

/**
 * Glue short function words to the word that follows with U+00A0, so they can
 * never be orphaned at a line end.
 *
 * This is also what reproduces the designer's rag rather than a greedy one:
 * Figma breaks «Пространство / для объединения / …» even though «Пространство
 * для» fits the 580px box, and «Парковые зоны / и веранды вместо / …» even
 * though the «и» fits line 1. Both fall out of this rule automatically.
 *
 * Consumers that split into per-word reveal spans must split on the PLAIN space
 * only — a bound pair is one unit and reveals as one beat, which is right
 * anyway: a lone preposition does not deserve its own animation step.
 */
export function bindShortWords(text: string): string {
  const words = text.split(' ');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    // chain, so «о душе и теле» binds as «о·душе» + «и·теле»
    if (isBindable(words[i]) && i < words.length - 1) {
      out.push(words[i] + NBSP + words[++i]);
    } else {
      out.push(words[i]);
    }
  }
  return out.join(' ');
}
