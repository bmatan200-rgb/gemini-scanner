import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";

if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}
pdfMake.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

async function test() {
  console.log("Starting generate...");
  try {
    const docDef = { content: 'test' };
    const pdfDocGenerator = pdfMake.createPdf(docDef as any);
    console.log("createPdf done, calling getBuffer...");
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      try {
        pdfDocGenerator.getBuffer((buffer: Buffer) => {
          console.log("getBuffer callback fired");
          resolve(buffer);
        });
      } catch (e) {
          reject(e);
      }
    });
    console.log("PDF buffer size:", pdfBuffer.length);
  } catch (err) {
    console.error("Error:", err);
  }
}

test().then(() => console.log("Done")).catch(console.error);
