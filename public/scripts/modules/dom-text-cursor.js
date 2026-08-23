export class DomTextCursor {
  constructor(root, locale = "zh-CN") {
    this.root = root;
    this.locale = locale;
    this.segmenter = typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter(locale, { granularity: "grapheme" })
      : null;
    this.entries = this.collectEntries();
    this.total = this.entries.reduce(
      (sum, entry) => sum + (entry.type === "text" ? entry.text.length : 0),
      0
    );
    this.hasRenderableContent = this.entries.length > 0;
    this.reset();
  }

  collectEntries() {
    const walker = document.createTreeWalker(
      this.root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    const entries = [];
    let node = walker.nextNode();

    while (node) {
      if (node.nodeType === 1) {
        entries.push({ type: "element", node });
      } else {
        const text = node.nodeValue || "";
        if (text.trim()) entries.push({ type: "text", node, text });
      }
      node = walker.nextNode();
    }
    return entries;
  }

  reset() {
    for (const entry of this.entries) {
      if (entry.type === "element") entry.node.hidden = true;
      else entry.node.nodeValue = "";
    }
    this.entryIndex = 0;
    this.iterator = null;
    this.position = 0;
    this.activeNode = null;
  }

  next() {
    while (this.entryIndex < this.entries.length) {
      const entry = this.entries[this.entryIndex];

      if (entry.type === "element") {
        entry.node.hidden = false;
        this.activeNode = entry.node;
        this.entryIndex += 1;
        continue;
      }

      if (!this.iterator) {
        this.iterator = this.segmenter
          ? this.segmenter.segment(entry.text)[Symbol.iterator]()
          : entry.text[Symbol.iterator]();
      }

      const result = this.iterator.next();
      if (!result.done) {
        const value = this.segmenter ? result.value.segment : result.value;
        this.position += value.length;
        this.activeNode = entry.node.parentElement || this.activeNode;
        return { done: false, node: entry.node, value, anchor: this.activeNode };
      }

      this.entryIndex += 1;
      this.iterator = null;
    }

    return { done: true, node: null, value: "", anchor: this.activeNode };
  }

  finish() {
    while (this.entryIndex < this.entries.length) {
      const entry = this.entries[this.entryIndex];
      if (entry.type === "element") {
        entry.node.hidden = false;
        this.activeNode = entry.node;
      }
      this.entryIndex += 1;
    }
    this.iterator = null;
    return this.activeNode;
  }
}
