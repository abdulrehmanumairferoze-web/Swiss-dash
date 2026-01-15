
import { GoogleGenAI, Type } from "@google/genai";
import { DepartmentMismatch } from "../types";

export interface SummaryResult {
  executiveSummary: string;
  detailedAnalysis: string;
  actions: string[];
  readingTimeMinutes: number;
}

export interface MasterAuditSummary {
  whatsappMessage: string;
}

const getApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch {
    return '';
  }
};

export const summarizeOperations = async (
  currentData: DepartmentMismatch[]
): Promise<SummaryResult> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3-flash-preview';
  
  // Pre-process data to avoid token overflow if it's massive
  const salesData = currentData.filter(d => d.department === 'Sales');
  const summaryPayload = salesData.length > 300 
    ? salesData.slice(0, 300).concat([{ metric: "... (data truncated for summary)", plan: 0, actual: 0 } as any])
    : salesData;

  const prompt = `
    You are a world-class Executive Auditor. 
    Analyze the provided pharmaceutical sales data for Swiss Pharmaceuticals.
    
    The user requires a summary that takes NO MORE THAN 5 MINUTES to read (approx 750-1000 words max).
    
    TASK:
    1. Provide a high-level "Executive Summary" (2-3 sentences).
    2. Provide a "Detailed Analysis" section that breaks down performance by teams (Achievers, Passionate, Concord, Dynamic). 
       - Highlight specific products with major shortfalls.
       - Use markdown for bolding and structure.
    3. List 5 high-impact "Strategic Action Points".
    
    DATA (Sales Only):
    ${JSON.stringify(summaryPayload, null, 2)}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            detailedAnalysis: { type: Type.STRING, description: "Markdown formatted detailed report" },
            actions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            readingTimeMinutes: { type: Type.NUMBER }
          },
          required: ["executiveSummary", "detailedAnalysis", "actions", "readingTimeMinutes"]
        }
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text) as SummaryResult;
  } catch (error) {
    console.error("Gemini Service Error:", error);
    return {
      executiveSummary: "Strategic overview unavailable due to an analysis error.",
      detailedAnalysis: "The dataset provided was too large or improperly formatted for the current AI context window. Please verify 'Sales' sheet columns.",
      actions: ["Check API Key configuration", "Ensure 'Target' and 'Actual' columns are numeric", "Try uploading a smaller date range"],
      readingTimeMinutes: 1
    };
  }
};

export const generateMasterAuditSummary = async (data: DepartmentMismatch[]): Promise<MasterAuditSummary> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    Create a concise WhatsApp message (max 150 words) for the Board of Directors summarizing CRITICAL sales shortfalls.
    Focus on the most alarming gaps.
    Data: ${JSON.stringify(data.filter(d => d.department === 'Sales' && d.status !== 'on-track').slice(0, 50))}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            whatsappMessage: { type: Type.STRING }
          },
          required: ["whatsappMessage"]
        }
      }
    });
    const text = response.text || "{}";
    return JSON.parse(text) as MasterAuditSummary;
  } catch (error) {
    return { whatsappMessage: "Board Alert: System error during audit generation. Please check manual dashboard." };
  }
};
