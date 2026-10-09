const fs = require("fs");

const path =
  "c:/Users/Public/publicsource/code-generator/sample/GS191701_69241476.00074_20231030-065057-057_74874.xml";
let s = fs.readFileSync(path, "utf8");

s = s.replace(/^[ \t]*<epcList><\/epcList>[ \t]*$/gm, "        <epcList></epcList>");

fs.writeFileSync(path, s, "utf8");
console.log("indented empty epcList:", (s.match(/        <epcList><\/epcList>/g) || []).length);
