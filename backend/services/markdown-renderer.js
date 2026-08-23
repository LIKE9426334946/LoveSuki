import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false
});

const originalLinkOpen = markdown.renderer.rules.link_open
  || ((tokens, index, options, _environment, renderer) => renderer.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return originalLinkOpen(tokens, index, options, environment, renderer);
};

export function renderMarkdown(content) {
  return markdown.render(String(content ?? ""));
}
