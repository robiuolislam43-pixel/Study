import { Question } from "./services/geminiService";

export interface QuestionPaper {
  id: string;
  schoolName: string;
  examName: string;
  className: string;
  subject: string;
  time: string;
  totalMarks: number;
  questions: Question[];
  createdAt: string;
}

export interface AppSettings {
  defaultSchoolName: string;
  teacherName: string;
}

export const CLASSES = ["১ম", "২য়", "৩য়", "৪র্থ", "৫ম", "৬ষ্ঠ", "৭ম", "৮ম", "৯ম", "১০ম"];
export const SUBJECTS = ["বাংলা", "ইংরেজি", "গণিত", "বিজ্ঞান", "বাংলাদেশ ও বিশ্বপরিচয়", "ধর্ম", "তথ্য ও যোগাযোগ প্রযুক্তি"];
