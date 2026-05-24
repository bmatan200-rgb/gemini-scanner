import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface InvoiceItem {
  lineNumber?: number;
  name: string;
  price: number;
  quantity: number;
  total?: number;
  discount?: number;
  remarks?: string;
  printed_price?: number;
}

export interface ScannedInvoice {
  store: string;
  date: string;
  total: number;
  invoiceNumber?: string;
  items: InvoiceItem[];
  remarks?: string;
}

export interface FilePart {
  data: string;
  mimeType: string;
}

export async function scanInvoice(
  files: FilePart[],
  knownProducts?: string[]
): Promise<(ScannedInvoice & { images: string[] })[] | null> {
  try {
    // Validate input
    if (!files || files.length === 0) {
      console.warn("No files provided");
      return null;
    }

    const inlineDataParts = files.map(file => {
      const base64Data = file.data.includes(",") 
        ? file.data.split(",")[1] 
        : file.data;
        
      return {
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType
        }
      };
    });

    let productReferenceText = "";
    if (knownProducts && knownProducts.length > 0) {
      const limitedProducts = knownProducts.slice(0, 200);
      productReferenceText = `\nCRITICAL NAME MATCHING: Here is a list of known products in the system. If an item on the invoice matches or closely matches an item in this list, prefer using the EXACT name from the known products list. Known products:\n[${limitedProducts.join(", ")}]\n`;
    }

    const systemPrompt = `אתה קורא חשבוניות ותעודות משלוח של חברות וסופרמרקטים בישראל. קרא היטב את התמונות כחשבונית אחת או כמה חשבוניות.
מטרתך היא למשוך את הנתונים בדיוק רב, ללא השערות או המצאות. טעות בזיהוי המספרים מביאה לקריסת המערכת.

חוקי ברזל לסריקה נכונה (קריטי):
1. קריאה מימין לשמאל: בישראל, עמודות מופיעות מימין לשמאל. השתמש במבנה הוויזואלי כדי לשייך פריטים לאותה שורה אופקית (עזר: מס' שורה).
2. מבנה נפוץ של חשבונית ישראלית (מימין לשמאל):
   [מס' שורה] -> [מק"ט] -> [שם קריא של הפריט] -> [כמות/משקל] -> [מחיר ליחידה] -> [סה"כ לפריט]
   - *אזהרה מוחלטת*: אל תחליף בין "מחיר ליחידה" ל"כמות"!! העמודה 'מחיר' או מחיר יח' (Price) היא מחיר מחירון. העמודה 'כמות', 'משקל', או 'יח' (Quantity) היא הכמות. המודל עלול להתבלבל כי לעיתים המחיר בא אחרי למרות שהוא קטן במספרו מהכמות בסדר משמאל לימין. הסתכל לפי כותרת העמודה!!
3. מבחן מתמטי לאימות עמודות והנחות סמויות (קריטי לדיוק!):
   עליך תמיד להכפיל את ה[כמות/משקל] ב[מחיר ליחידה]. לרוב, התוצאה שווה ל-[סה"כ לפריט].
   - תשים לב שיש הנחה סמויה לפעמים בפריטים: הסכום הכולל בשורה לא מתאים למכפלת המחיר והכמות/משקל שמופיעים בשורה. אם זה המצב, כנראה שהסה"כ בשורה הוא אחרי הנחה. במצב כזה תציין את המחיר המקורי (הגבוה שהופיע בחשבונית) תחת \`printed_price\`, ואת המחיר החדש לאחר ההנחה (שמחושב כ-סה״כ לחלק לכמות) הצע תחת \`price\`. 
   - אם החישוב שלך לא תואם באופן חריג מאוד (ואין זו הנחה סבירה), ייתכן שפשוט החלפת בטעות בין עמודת מחיר לעמודת כמות בסריקה לכן החלף ביניהם חזרה! עליך להיות זהיר ולהבחין בין מגמות של הנחה לטעויות סריקה.
4. אימות כפילויות עמודים: חשוב לחבר את החשבוניות מעמודים שונים במידה וצולמו כמה פעמים ולהחסיר כפילויות.
5. מספר "לתשלום" הוא הסכום הסופי הכולל בתחתית החשבונית.
6. כלל ברזל - איכות הצילום: אם הצילום סרוק גרוע ולא קריא, החזר success: false ו-errorReason ובו תציין כי מטושטש.
7. סכום סופי: חבר את כל שורות ה-total בפריטים לוודא שהן בסוף סכומן מגיע במדויק ל-total הכולל של החשבונית. אם יש הנחה כללית בסוף החשבונית שמקזזת סכום, פזר / קזז מחלק מהמוצרים בשורות על מנת שהסכומים יתאימו, והוסף תחת printed_price. לעולם אל תשבית את הפער ללא טיפול!${productReferenceText}`;

    const MAX_RETRIES = 3;
    let attempt = 0;
    
    while(true) {
        try {
            const aiTask = ai.models.generateContent({
              model: "gemini-3.1-pro-preview",
              contents: {
                parts: [
                  { text: systemPrompt },
                  ...inlineDataParts
                ]
              },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    success: { type: Type.BOOLEAN, description: "האם החשבונית קריאה לחלוטין וללא ספקות בנתונים?" },
                    errorReason: { type: Type.STRING, description: "אם לא קריאה, מה הסיבה (למשל 'טקסט מטושטש')" },
                    invoices: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          store: { type: Type.STRING, description: "שם ספק או חנות כפי שכתוב למעלה" },
                          date: { type: Type.STRING, description: "תאריך החשבונית בפורמט YYYY-MM-DD" },
                          total: { type: Type.NUMBER, description: "סה״כ כללי לתשלום של החשבונית" },
                          invoiceNumber: { type: Type.STRING, description: "מספר חשבונית או תעודת משלוח. אם אין רשום UNKNOWN" },
                          remarks: { type: Type.STRING, description: "הערות כלליות. השאר ריק בדרך כלל." },
                          items: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                lineNumber: { type: Type.NUMBER, description: "מספר שורה אם מופיע בצד ימין" },
                                name: { type: Type.STRING, description: "שם המוצר" },
                                price: { type: Type.NUMBER, description: "מחיר ליחידה אחת לאחר הנחות (זהו המחיר הקובע שיוצג למשתמש ויצורף לחישוב)" },
                                printed_price: { type: Type.NUMBER, description: "מחיר מקורי לפני הנחה (אם הייתה הנחה)" },
                                quantity: { type: Type.NUMBER, description: "כמות תכלס שנקנתה" },
                                total: { type: Type.NUMBER, description: "סה״כ מחיר ששולם על שורה זו לאחר הנחות (מחיר כפול כמות)" },
                                discount: { type: Type.NUMBER, description: "סכום ההנחה השקלי לשורה זו, אם יש" },
                                remarks: { type: Type.STRING, description: "הערות, למשל אם שורה חתוכה או לא קריאה טובה" }
                              },
                              required: ["name", "price", "quantity"]
                            }
                          }
                        },
                        required: ["store", "date", "total", "items"]
                      }
                    }
                  },
                  required: ["success", "invoices"]
                }
              }
            });
        
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error("הבקשה למערכת ה-AI לקחה זמן רב מדי (Timeout). אנא נסה שוב.")), 120000)
            );
        
            const response = await Promise.race([aiTask, timeoutPromise]);
        
            if (!response || !response.text) {
              console.warn("Gemini returned no response or empty text");
              return null;
            }
            
            let text = response.text.trim();
            if (text.includes("\`\`\`")) {
              text = text.replace(/\`\`\`json\s?/g, "").replace(/\`\`\`/g, "").trim();
            }
            
            try {
              const parsedData = JSON.parse(text) as { success: boolean; errorReason?: string; invoices: any[] };
              if (parsedData.success === false) {
                throw new Error(parsedData.errorReason || "החשבונית אינה קריאה, אנא צלם מחדש.");
              }
              if (!parsedData.invoices || !Array.isArray(parsedData.invoices)) {
                console.warn("Gemini returned invalid invoices structure");
                return null;
              }
              return parsedData.invoices.map((inv: any, index: number) => ({
                ...inv,
                images: parsedData.invoices.length === 1 ? files.map((f) => f.data) : (files[index] ? [files[index].data] : (files.length > 0 ? [files[0].data] : []))
              }));
            } catch (parseError) {
              console.error("Failed to parse Gemini response as JSON:", text, parseError);
              if (parseError instanceof Error) {
                throw parseError; // Re-throw the known error
              }
              throw new Error("שגיאה בפיענוח התוצאה מ-Gemini.");
            }
        } catch (err: any) {
            if (err.status === 429 && attempt < MAX_RETRIES - 1) {
                attempt++;
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
                continue;
            }
            throw err;
        }
    }

  } catch (error: any) {
    console.error("Error scanning invoice:", error);
    throw error;
  }
}

export interface PriceChangeRecord {
  from: number;
  to: number;
  date: string;
  diff: string;
}

export interface ProcessedProduct {
  name: string;
  full_history: { date: string; price: number; store: string }[];
  all_detected_changes: PriceChangeRecord[];
}

export interface AIPriceAnalysisResult {
  summary: string;
  processed_products: ProcessedProduct[];
}

export async function analyzePriceHistoryWithAI(invoices: any[]): Promise<AIPriceAnalysisResult | null> {
  try {
    const prompt = `Role: Advanced Retail Price Intelligence Engine.
Task: Process multiple invoices and track the full price evolution for every item.

CORE LOGIC:
1. SEQUENCE ANALYSIS: You must analyze the price chain across ALL provided data points (Invoice 1 -> Invoice 2 -> Invoice 3 -> etc.). 
2. DATA INTEGRATION: You will receive "New_Invoices" (JSON array). You MUST merge them into a single chronological timeline for each product before performing the analysis.
3. FUZZY MATCHING: Treat "Milk 1L" and "Milk 1 Liter" as the same product.
4. RETROACTIVE REPORTING: Every time a new invoice is added, re-evaluate the entire history of that product and report every single price change detected from the very first record.

Output Requirements:
Return a JSON object containing a summary string and a processed_products array. Each processed product must include its full_history and an array of all_detected_changes.

Input Invoices Data:
${JSON.stringify(invoices, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            processed_products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  full_history: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        price: { type: Type.NUMBER },
                        date: { type: Type.STRING },
                        store: { type: Type.STRING }
                      },
                      required: ["price", "date", "store"]
                    }
                  },
                  all_detected_changes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        from: { type: Type.NUMBER },
                        to: { type: Type.NUMBER },
                        date: { type: Type.STRING },
                        diff: { type: Type.STRING }
                      },
                      required: ["from", "to", "date", "diff"]
                    }
                  }
                },
                required: ["name", "full_history", "all_detected_changes"]
              }
            }
          },
          required: ["summary", "processed_products"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return null;
  } catch (error) {
    console.error("Failed to analyze price history with AI:", error);
    return null;
  }
}
