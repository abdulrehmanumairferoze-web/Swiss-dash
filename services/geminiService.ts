
import { GoogleGenAI, Type } from "@google/genai";
import { DepartmentMismatch } from "../types.ts";

export interface SummaryResult {
  executiveSummary: string;
  detailedAnalysis: string;
  actions: string[];
  readingTimeMinutes: number;
}

export interface MasterAuditSummary {
  whatsappMessage: string;
}

export const summarizeOperations = async (
  currentData: DepartmentMismatch[]
): Promise<SummaryResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = 'gemini-3-flash-preview';
  
  // Truncate or sample data if it's too large to prevent context window overflow
  // We prioritize 'Sales' department as requested by the app's context
  const relevantData = currentData.filter(d => d.department === 'Sales');
  const summarizedPayload = relevantData.length > 400 
    ? relevantData.slice(0, 400).concat([{ metric: `... (${relevantData.length - 400} more items truncated)`, plan: 0, actual: 0 } as any])
    : relevantData;

  const prompt = `
    You are a Senior Executive Auditor at Swiss Pharmaceuticals.
    Analyze the provided sales performance data.
    
    CRITICAL REQUIREMENT: 
    The generated report must be optimized for a 5-MINUTE READING TIME (approx 800-1000 words). 
    Do not be overly brief, but do not provide fluff.
    
    Structure your response as follows:
    1. Executive Summary: 3-4 powerful sentences summarizing the state of the business.
    2. Detailed Analysis: A structured breakdown using Markdown. Use bolding for emphasis. 
       Analyze team-wise performance (Achievers, Passionate, Concord, Dynamic).
       Identify specific high-value products that are failing targets.
    3. Strategic Action Plan: Exactly 5 high-impact bullet points for the Board.
    
    Data to Analyze:
    ${JSON.stringify(summarizedPayload)}
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
            detailedAnalysis: { type: Type.STRING, description: "Markdown formatted deep-dive analysis" },
            actions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            readingTimeMinutes: { type: Type.NUMBER, description: "Estimated reading time based on word count" }
          },
          required: ["executiveSummary", "detailedAnalysis", "actions", "readingTimeMinutes"]
        }
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text) as SummaryResult;
    // Ensure reading time is capped at 5 for the UI display
    if (result.readingTimeMinutes > 5) result.readingTimeMinutes = 5;
    return result;
  } catch (error) {
    console.error("Gemini Service Error:", error);
    return {
      executiveSummary: "Data volume exceeded current processing threshold or API configuration is missing.",
      detailedAnalysis: "The dataset provided contains too many entries for a single-pass executive summary. Please try analyzing a specific month or smaller product category range.",
      actions: ["Verify API Key in Vercel/Environment settings", "Reduce Excel file size by removing non-sales data", "Check column headers 'Metric', 'Plan', and 'Actual'"],
      readingTimeMinutes: 1
    };
  }
};

export const generateMasterAuditSummary = async (data: DepartmentMismatch[]): Promise<MasterAuditSummary> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    Create a high-urgency WhatsApp alert for the Board of Directors.
    Summarize critical shortfalls from this data in under 150 words.
    Data: ${JSON.stringify(data.filter(d => d.department === 'Sales' && d.status !== 'on-track').slice(0, 30))}
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
    return JSON.parse(response.text || "{}") as MasterAuditSummary;
  } catch (error) {
    return { whatsappMessage: "Board Alert: Automated audit failed. Please review manual dashboard for shortfall details." };
  }
};
