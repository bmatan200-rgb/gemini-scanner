import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const content = fs.readFileSync('node_modules/pdfmake/package.json', 'utf8');
console.log(JSON.parse(content).main);
