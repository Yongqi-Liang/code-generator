const fs = require("fs");

const path =
  "c:/Users/Public/publicsource/code-generator/sample/GS191701_69241476.00074_20231030-065057-057_74874.xml";
let s = fs.readFileSync(path, "utf8");

// Fix corrupted empty tags from PowerShell $var expansion
s = s.replace(/^[ \t]*<><\/>\s*$/gm, (line) => {
  const indent = line.match(/^[ \t]*/)[0];
  return indent + "<epcList></epcList>";
});

fs.writeFileSync(path, s, "utf8");
console.log("fixed", (s.match(/<epcList><\/epcList>/g) || []).length, "epcList empties");
console.log("remaining broken:", (s.match(/<><\/>/g) || []).length);
