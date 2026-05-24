import express from "express";
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

const app = express();
app.get("/", async (req, res) => {
  console.log("Request received");
  const docDef = { content: 'test' };
  const pdfDocGenerator = pdfMake.createPdf(docDef as any);
  console.log("createPdf done");
  try {
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        pdfDocGenerator.getBuffer((buffer: Buffer) => {
          console.log("getBuffer callback");
          resolve(buffer);
        });
        setTimeout(() => reject(new Error("Timeout")), 2000);
      });
      res.send("Buffer Size: " + pdfBuffer.length);
  } catch (error: any) {
      console.log("Error:", error.message);
      res.status(500).send(error.message);
  }
});

app.listen(3001, () => {
    console.log("Listening on 3001");
    // self request
    import('http').then(http => {
        http.get("http://localhost:3001/");
    });
});
