export class TextCursor {
  constructor(text, locale = "zh-CN") {
    this.text = String(text ?? "");
    this.locale = locale;
    this.segmenter = typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter(locale, { granularity: "grapheme" })
      : null;
    // UTF-16 length is available in constant time. Using it for progress avoids
    // a blocking pre-scan when a future document contains millions of words.
    this.total = this.text.length;
    this.reset();
  }

  reset() {
    this.position = 0;
    this.iterator = this.segmenter
      ? this.segmenter.segment(this.text)[Symbol.iterator]()
      : this.text[Symbol.iterator]();
  }

  next() {
    const result = this.iterator.next();
    const value = result.done ? "" : this.segmenter ? result.value.segment : result.value;
    if (!result.done) this.position += value.length;

    return {
      done: result.done,
      value
    };
  }
}

export function countGraphemes(text, segmenter) {
  if (!text) return 0;
  if (!segmenter) {
    let count = 0;
    for (const _character of text) count += 1;
    return count;
  }

  let count = 0;
  for (const _segment of segmenter.segment(text)) count += 1;
  return count;
}
