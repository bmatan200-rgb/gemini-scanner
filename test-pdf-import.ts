import pdfFonts from "pdfmake/build/vfs_fonts.js";
console.log(Object.keys(pdfFonts));
if (pdfFonts.default) console.log(Object.keys(pdfFonts.default));
