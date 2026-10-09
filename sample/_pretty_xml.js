const fs = require("fs");

const path = process.argv[2];
let raw = fs.readFileSync(path, "utf8");

// Collapse insignificant whitespace between tags; trim text content
raw = raw.replace(/>\s+</g, "><");
raw = raw.replace(/>\s*([^<]+?)\s*</g, (m, text) => {
  const t = text.trim();
  return t ? ">" + t + "<" : "><";
});

const tokens = [];
const re = /(<\?[^>]*\?>|<[^>]+>|[^<]+)/g;
let m;
while ((m = re.exec(raw)) !== null) tokens.push(m[1]);

const indentUnit = "  ";
let depth = 0;
const lines = [];

function isClosing(tag) {
  return /^<\//.test(tag);
}
function isDeclOrComment(tag) {
  return /^<\?/.test(tag) || /^<!/.test(tag);
}
function isSelfClosing(tag) {
  return /\/>$/.test(tag);
}
function isOpening(tag) {
  return /^<[^!?/]/.test(tag) && !isSelfClosing(tag);
}
function tagName(tag) {
  const mm = tag.match(/^<\/?\s*([^\s>/]+)/);
  return mm ? mm[1] : "";
}

for (let i = 0; i < tokens.length; i++) {
  const tok = tokens[i];
  if (tok.startsWith("<")) {
    if (isClosing(tok)) {
      depth = Math.max(0, depth - 1);
      // Compact leaf nodes into <tag>text</tag>
      if (
        lines.length >= 2 &&
        !lines[lines.length - 1].trimStart().startsWith("<") &&
        isOpening(lines[lines.length - 2].trim()) &&
        tagName(lines[lines.length - 2].trim()) === tagName(tok)
      ) {
        const openLine = lines[lines.length - 2];
        const text = lines[lines.length - 1].trim();
        lines.pop();
        lines.pop();
        lines.push(openLine + text + tok);
        continue;
      }
      lines.push(indentUnit.repeat(depth) + tok);
    } else if (isDeclOrComment(tok) || isSelfClosing(tok)) {
      lines.push(indentUnit.repeat(depth) + tok);
    } else {
      lines.push(indentUnit.repeat(depth) + tok);
      depth++;
    }
  } else {
    const text = tok.trim();
    if (text) lines.push(indentUnit.repeat(depth) + text);
  }
}

fs.writeFileSync(path, lines.join("\n") + "\n", "utf8");
console.log("OK lines:", lines.length);
console.log(lines.slice(0, 50).join("\n"));
