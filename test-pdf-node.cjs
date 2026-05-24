const fs = require('fs');
const content = fs.readFileSync('node_modules/pdfmake/README.md', 'utf8');
const i = content.indexOf('Server-side');
console.log(content.substring(i, i + 1000));
