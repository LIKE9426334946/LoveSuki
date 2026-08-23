export class DomTextCursor {
  constructor(root, locale = "zh-CN") {
    this.root = root;
    this.locale = locale;
    this.segmenter = typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter(locale, { granularity: "grapheme" })
      : null;
    this.entries = this.collectTextNodes();
    this.total = this.entries.reduce((sum, entry) => sum + entry.text.length, 0);
    this.reset();
  }

  collectTextNodes() {
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
    const entries = [];
    let node = walker.nextNode();

    while (node) {
      const text = node.nodeValue || "";
      if (text.trim()) entries.push({ node, text });
      node = walker.nextNode();
    }
    return entries;
  }

  reset() {
    for (const entry of this.entries) entry.node.nodeValue = "";
    this.entryIndex = 0;
    this.iterator = null;
    this.position = 0;
  }

  next() {
    while (this.entryIndex < this.entries.length) {
      const entry = this.entries[this.entryIndex];
      if (!this.iterator) {
        this.iterator = this.segmenter
          ? this.segmenter.segment(entry.text)[Symbol.iterator]()
          : entry.text[Symbol.iterator]();
      }

      const result = this.iterator.next();
      if (!result.done) {
        const value = this.segmenter ? result.value.segment : result.value;
        this.position += value.length;
        return { done: false, node: entry.node, value };
      }

      this.entryIndex += 1;
      this.iterator = null;
    }

    return { done: true, node: null, value: "" };
  }
}
