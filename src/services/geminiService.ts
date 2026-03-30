import { GoogleGenAI, Type } from "@google/genai";

const apiKey = (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || import.meta.env.VITE_GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export type QuestionType = 'MCQ' | 'SHORT' | 'CQ' | 'FILL_BLANKS' | 'MATCHING' | 'DESCRIPTIVE';

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  answer: string;
  marks: number;
  matchingPairs?: { left: string; right: string }[];
}

export interface QuestionCounts {
  MCQ: number;
  SHORT: number;
  CQ: number;
  FILL_BLANKS: number;
  MATCHING: number;
  DESCRIPTIVE: number;
}

export const generateQuestions = async (className: string, subject: string, topic: string, counts: QuestionCounts) => {
  const prompt = `You are an expert school teacher in Bangladesh. Generate a set of questions in Bengali for Class ${className}, Subject: ${subject}, Topic: ${topic}. 
  
  Generate exactly:
  - ${counts.MCQ} Multiple Choice Questions (MCQ) with 4 options each.
  - ${counts.SHORT} Short Questions (সংক্ষিপ্ত প্রশ্ন).
  - ${counts.CQ} Creative Questions (CQ/সৃজনশীল) with parts (a, b, c, d).
  - ${counts.FILL_BLANKS} Fill in the blanks (শুন্যস্থান পূরণ).
  - ${counts.MATCHING} Matching questions (বাম-ডান মিলানো). For matching, provide a list of pairs.
  - ${counts.DESCRIPTIVE} Descriptive questions (বর্ণনামূলক প্রশ্ন).
  
  Provide the output in JSON format as an array of objects.
  Each object should have:
  - type: "MCQ", "SHORT", "CQ", "FILL_BLANKS", "MATCHING", or "DESCRIPTIVE"
  - question: The question text in Bengali. For MATCHING, this can be "বাম পাশের বাক্যাংশের সাথে ডান পাশের বাক্যাংশ মিল করো।".
  - options: (For MCQ only) Array of 4 options in Bengali.
  - answer: The correct answer or a model answer in Bengali. For MATCHING, provide the correct pairs as a string or list.
  - marks: Recommended marks for the question.
  - matchingPairs: (For MATCHING only) Array of objects with { left: string, right: string }.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["MCQ", "SHORT", "CQ", "FILL_BLANKS", "MATCHING", "DESCRIPTIVE"] },
            question: { type: Type.STRING },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            answer: { type: Type.STRING },
            marks: { type: Type.NUMBER },
            matchingPairs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  left: { type: Type.STRING },
                  right: { type: Type.STRING }
                },
                required: ["left", "right"]
              }
            }
          },
          required: ["type", "question", "answer", "marks"]
        }
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "[]");
    return data.map((q: any, index: number) => ({
      ...q,
      id: `${Date.now()}-${index}`
    })) as Question[];
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};

export const getAIChatResponse = async (message: string, history: any[]) => {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "আপনি একজন অভিজ্ঞ শিক্ষক এবং পড়াশোনা বিষয়ক সহকারী। আপনি ব্যবহারকারীর সাথে পড়াশোনা, প্রশ্ন-উত্তর এবং বিভিন্ন বিষয় নিয়ে আলোচনা করবেন। আপনার সব উত্তর বাংলা ভাষায় হতে হবে।",
    },
    history: history,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};
