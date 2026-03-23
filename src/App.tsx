/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FilePlus, 
  FileText, 
  Settings as SettingsIcon, 
  Download, 
  Trash2, 
  Plus, 
  CheckCircle2,
  Loader2,
  ChevronRight,
  Menu,
  X,
  Printer,
  MessageSquare,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateQuestions, Question, getAIChatResponse } from './services/geminiService';
import { QuestionPaper, AppSettings, CLASSES, SUBJECTS } from './types';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

type Section = 'dashboard' | 'generate' | 'create-paper' | 'saved' | 'settings' | 'ai-assistant';

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // State for data
  const [savedPapers, setSavedPapers] = useState<QuestionPaper[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    defaultSchoolName: '',
    teacherName: ''
  });
  
  // Generation state
  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [topic, setTopic] = useState('');
  const [counts, setCounts] = useState({
    MCQ: 5,
    SHORT: 5,
    CQ: 2,
    FILL_BLANKS: 5,
    MATCHING: 1,
    DESCRIPTIVE: 2
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

  // Paper creation state
  const [paperInfo, setPaperInfo] = useState({
    schoolName: '',
    examName: '',
    time: '২ ঘণ্টা ৩০ মিনিট',
    totalMarks: 100
  });

  // Load data from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('teaching_assistant_papers');
    if (saved) setSavedPapers(JSON.parse(saved));
    
    const savedSettings = localStorage.getItem('teaching_assistant_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
      setPaperInfo(prev => ({ ...prev, schoolName: parsed.defaultSchoolName }));
    }
  }, []);

  // Save data to LocalStorage
  useEffect(() => {
    localStorage.setItem('teaching_assistant_papers', JSON.stringify(savedPapers));
  }, [savedPapers]);

  useEffect(() => {
    localStorage.setItem('teaching_assistant_settings', JSON.stringify(settings));
  }, [settings]);

  const handleGenerate = async () => {
    if (!topic) return;
    setIsGenerating(true);
    const questions = await generateQuestions(selectedClass, selectedSubject, topic, counts);
    setGeneratedQuestions(questions);
    setSelectedQuestionIds(new Set());
    setIsGenerating(false);
  };

  const toggleQuestionSelection = (id: string) => {
    const newSelected = new Set(selectedQuestionIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedQuestionIds(newSelected);
  };

  const handleCreatePaper = () => {
    const selectedQuestions = generatedQuestions.filter(q => selectedQuestionIds.has(q.id));
    if (selectedQuestions.length === 0) {
      alert('দয়া করে অন্তত একটি প্রশ্ন নির্বাচন করুন।');
      return;
    }
    setActiveSection('create-paper');
  };

  const savePaper = () => {
    const selectedQuestions = generatedQuestions.filter(q => selectedQuestionIds.has(q.id));
    const newPaper: QuestionPaper = {
      id: Date.now().toString(),
      ...paperInfo,
      className: selectedClass,
      subject: selectedSubject,
      questions: selectedQuestions,
      createdAt: new Date().toISOString()
    };
    setSavedPapers([newPaper, ...savedPapers]);
    setActiveSection('dashboard');
    // Reset
    setGeneratedQuestions([]);
    setSelectedQuestionIds(new Set());
  };

  const deletePaper = (id: string) => {
    setSavedPapers(savedPapers.filter(p => p.id !== id));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatLoading(true);

    try {
      const history = chatMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));
      const aiResponse = await getAIChatResponse(userMessage, history);
      setChatMessages(prev => [...prev, { role: 'model', text: aiResponse || 'দুঃখিত, আমি উত্তর দিতে পারছি না।' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, { role: 'model', text: 'দুঃখিত, একটি সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const downloadPDF = async (paper: QuestionPaper, type: 'question' | 'answer') => {
    // Create a temporary div to render the content for capture
    const element = document.createElement('div');
    element.style.padding = '50px';
    element.style.width = '800px';
    element.style.backgroundColor = 'white';
    element.style.color = '#1e293b';
    element.style.fontFamily = '"Hind Siliguri", sans-serif';
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    
    // Group questions by type for better organization
    const groupedQuestions: Record<string, Question[]> = {};
    paper.questions.forEach(q => {
      if (!groupedQuestions[q.type]) groupedQuestions[q.type] = [];
      groupedQuestions[q.type].push(q);
    });

    const typeLabels: Record<string, string> = {
      MCQ: 'বহুনির্বাচনী প্রশ্ন (MCQ)',
      SHORT: 'সংক্ষিপ্ত প্রশ্ন',
      CQ: 'সৃজনশীল প্রশ্ন (CQ)',
      FILL_BLANKS: 'শুন্যস্থান পূরণ',
      MATCHING: 'বাম-ডান মিলানো',
      DESCRIPTIVE: 'বর্ণনামূলক প্রশ্ন'
    };

    const header = `
      <div style="text-align: center; margin-bottom: 40px; border: 2px solid #2563eb; padding: 20px; border-radius: 15px; background-color: #f8fafc;">
        <h1 style="font-size: 28px; margin: 0; color: #2563eb; font-weight: 700;">${paper.schoolName || 'স্কুলের নাম'}</h1>
        <h2 style="font-size: 22px; margin: 10px 0; color: #475569;">${paper.examName || 'পরীক্ষার নাম'}</h2>
        <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 16px; font-weight: 600;">
          <span>শ্রেণি: ${paper.className} | বিষয়: ${paper.subject}</span>
          <span>সময়: ${paper.time} | পূর্ণমান: ${paper.totalMarks}</span>
        </div>
      </div>
    `;

    let sectionsHtml = '';
    let sectionCount = 1;
    const sections = ['MCQ', 'FILL_BLANKS', 'MATCHING', 'SHORT', 'DESCRIPTIVE', 'CQ'];
    
    sections.forEach(typeKey => {
      const qs = groupedQuestions[typeKey];
      if (qs && qs.length > 0) {
        const sectionLabel = typeLabels[typeKey] || typeKey;
        sectionsHtml += `
          <div style="margin-bottom: 30px;">
            <h3 style="background-color: #2563eb; color: white; padding: 8px 15px; border-radius: 8px; display: inline-block; margin-bottom: 20px; font-size: 18px;">
              ${sectionLabel}
            </h3>
            <div style="padding-left: 10px;">
              ${qs.map((q, i) => `
                <div style="margin-bottom: 20px; border-left: 3px solid #e2e8f0; padding-left: 15px;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <p style="font-weight: 500; margin: 0; font-size: 16px; flex: 1;">${i + 1}. ${q.question}</p>
                    <span style="font-weight: 700; color: #64748b; margin-left: 10px;">[${q.marks}]</span>
                  </div>
                  
                  ${type === 'answer' ? `
                    <div style="margin-top: 10px; padding: 10px; background-color: #f1f5f9; border-radius: 8px; font-size: 14px;">
                      <strong style="color: #2563eb;">উত্তর:</strong> ${q.answer}
                    </div>
                  ` : ''}

                  ${type === 'question' && q.options ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 30px; margin-top: 12px; margin-left: 20px;">
                      ${q.options.map((opt, oi) => `
                        <div style="font-size: 14px;">
                          <span style="color: #2563eb; font-weight: 700;">${String.fromCharCode(97 + oi)})</span> ${opt}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}

                  ${type === 'question' && q.matchingPairs ? `
                    <div style="margin-top: 12px; margin-left: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background-color: #f8fafc;">
                          <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left; width: 50%;">বাম পাশ</th>
                          <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left; width: 50%;">ডান পাশ</th>
                        </tr>
                        ${q.matchingPairs.map((pair) => `
                          <tr>
                            <td style="border: 1px solid #e2e8f0; padding: 8px;">${pair.left}</td>
                            <td style="border: 1px solid #e2e8f0; padding: 8px;">${pair.right}</td>
                          </tr>
                        `).join('')}
                      </table>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
        sectionCount++;
      }
    });

    element.innerHTML = `
      <div style="border: 1px solid #e2e8f0; padding: 40px; border-radius: 20px; min-height: 1000px;">
        ${header}
        ${sectionsHtml}
        <div style="margin-top: 50px; text-align: center; border-top: 1px solid #e2e8f0; pt: 20px; color: #94a3b8; font-size: 12px;">
          এই প্রশ্নপত্রটি "টিচিং অ্যাসিস্ট্যান্ট" অ্যাপের মাধ্যমে তৈরি করা হয়েছে।
        </div>
      </div>
    `;
    document.body.appendChild(element);

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // If content is longer than one page, we might need multiple pages
      // For now, we'll scale it to fit one page or handle multiple if needed
      // A4 is roughly 210x297mm
      if (pdfHeight > 297) {
        // Simple multi-page support by splitting the image
        let heightLeft = pdfHeight;
        let position = 0;
        const pageHeight = 297;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
          heightLeft -= pageHeight;
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }
      
      pdf.save(`${type === 'question' ? 'Question' : 'Answer'}_${paper.subject}_${paper.className}.pdf`);
    } catch (error) {
      console.error('PDF generation failed', error);
      alert('পিডিএফ তৈরি করতে সমস্যা হয়েছে।');
    } finally {
      document.body.removeChild(element);
    }
  };

  const NavItem = ({ section, icon: Icon, label }: { section: Section, icon: any, label: string }) => (
    <button
      onClick={() => {
        setActiveSection(section);
        setIsSidebarOpen(false);
      }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-left",
        activeSection === section 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
          : "text-slate-600 hover:bg-slate-100"
      )}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b z-50 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-blue-600 text-lg">স্টাডি অ্যাসিস্ট্যান্ট</h1>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-white border-r transform transition-transform duration-300 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <FileText size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">টিচিং অ্যাসিস্ট্যান্ট</h1>
          </div>
          
          <nav className="space-y-2">
            <NavItem section="dashboard" icon={LayoutDashboard} label="ড্যাশবোর্ড" />
            <NavItem section="generate" icon={FilePlus} label="প্রশ্ন তৈরি করো" />
            <NavItem section="ai-assistant" icon={MessageSquare} label="এআই অ্যাসিস্ট্যান্ট" />
            <NavItem section="saved" icon={Download} label="সংরক্ষিত প্রশ্ন" />
            <NavItem section="settings" icon={SettingsIcon} label="সেটিংস" />
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-10 pt-20 lg:pt-10 overflow-auto">
        <AnimatePresence mode="wait">
          {activeSection === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-slate-800">স্বাগতম, {settings.teacherName || 'শিক্ষক'}</h2>
                  <p className="text-slate-500 mt-1">আপনার আজকের কাজের সারসংক্ষেপ এখানে দেখুন।</p>
                </div>
                <button 
                  onClick={() => setActiveSection('generate')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
                >
                  <Plus size={20} />
                  নতুন প্রশ্ন তৈরি
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                    <FileText size={24} />
                  </div>
                  <div className="text-3xl font-bold text-slate-800">{savedPapers.length}</div>
                  <div className="text-slate-500 text-sm font-medium">মোট প্রশ্নপত্র</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4">
                    <CheckCircle2 size={24} />
                  </div>
                  <div className="text-3xl font-bold text-slate-800">
                    {savedPapers.reduce((acc, p) => acc + p.questions.length, 0)}
                  </div>
                  <div className="text-slate-500 text-sm font-medium">মোট প্রশ্ন</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <Download size={24} />
                  </div>
                  <div className="text-3xl font-bold text-slate-800">{savedPapers.length * 2}</div>
                  <div className="text-slate-500 text-sm font-medium">পিডিএফ ডাউনলোড</div>
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-800 mb-4">সাম্প্রতিক প্রশ্নপত্র</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedPapers.slice(0, 4).map(paper => (
                  <div key={paper.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{paper.examName || 'পরীক্ষা'}</h4>
                        <p className="text-sm text-slate-500">{paper.className} শ্রেণি • {paper.subject}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => downloadPDF(paper, 'question')} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Download size={18} />
                      </button>
                      <button onClick={() => deletePaper(paper.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {savedPapers.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400">এখনও কোনো প্রশ্নপত্র তৈরি করা হয়নি।</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">নতুন প্রশ্ন তৈরি করুন</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">শ্রেণি নির্বাচন করুন</label>
                    <select 
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                      {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">বিষয় নির্বাচন করুন</label>
                    <select 
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <label className="text-sm font-semibold text-slate-600">অধ্যায় বা টপিকের নাম লিখুন</label>
                  <input 
                    type="text"
                    placeholder="যেমন: আমাদের পরিবেশ, গুণিতক ও গুণনীয়ক"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                  {[
                    { key: 'MCQ', label: 'টিকচিহ্ন (MCQ)' },
                    { key: 'SHORT', label: 'সংক্ষিপ্ত প্রশ্ন' },
                    { key: 'CQ', label: 'সৃজনশীল (CQ)' },
                    { key: 'FILL_BLANKS', label: 'শুন্যস্থান' },
                    { key: 'MATCHING', label: 'বাম-ডান মিলানো' },
                    { key: 'DESCRIPTIVE', label: 'বর্ণনামূলক' }
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
                      <input 
                        type="number"
                        min="0"
                        max="20"
                        value={counts[key as keyof typeof counts]}
                        onChange={(e) => setCounts({ ...counts, [key]: parseInt(e.target.value) || 0 })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  ))}
                </div>
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin" />
                      প্রশ্ন তৈরি হচ্ছে...
                    </>
                  ) : (
                    <>
                      <FilePlus size={20} />
                      প্রশ্ন তৈরি করো
                    </>
                  )}
                </button>
              </div>

              {generatedQuestions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-800">তৈরিকৃত প্রশ্নসমূহ ({generatedQuestions.length})</h3>
                    <button 
                      onClick={handleCreatePaper}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-all flex items-center gap-2"
                    >
                      <ChevronRight size={18} />
                      প্রশ্নপত্র তৈরি করুন ({selectedQuestionIds.size})
                    </button>
                  </div>
                  
                  {generatedQuestions.map((q) => (
                    <div 
                      key={q.id} 
                      onClick={() => toggleQuestionSelection(q.id)}
                      className={cn(
                        "bg-white p-6 rounded-2xl border cursor-pointer transition-all flex gap-4",
                        selectedQuestionIds.has(q.id) ? "border-blue-500 bg-blue-50/30" : "border-slate-100 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 mt-1",
                        selectedQuestionIds.has(q.id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                      )}>
                        {selectedQuestionIds.has(q.id) && <CheckCircle2 size={16} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                            {q.type}
                          </span>
                          <span className="text-xs font-medium text-slate-400">মান: {q.marks}</span>
                        </div>
                        <p className="text-slate-800 font-medium leading-relaxed">{q.question}</p>
                        {q.options && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                            {q.options.map((opt, i) => (
                              <div key={i} className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                {String.fromCharCode(97 + i)}) {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.matchingPairs && (
                          <div className="mt-3 space-y-1">
                            {q.matchingPairs.map((pair, i) => (
                              <div key={i} className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">{pair.left}</div>
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">{pair.right}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">উত্তর:</p>
                          <p className="text-sm text-slate-600 italic">{q.answer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'create-paper' && (
            <motion.div
              key="create-paper"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">প্রশ্নপত্রের তথ্য</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">স্কুলের নাম</label>
                    <input 
                      type="text"
                      value={paperInfo.schoolName}
                      onChange={(e) => setPaperInfo({ ...paperInfo, schoolName: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">পরীক্ষার নাম</label>
                    <input 
                      type="text"
                      placeholder="যেমন: প্রথম সাময়িক পরীক্ষা ২০২৪"
                      value={paperInfo.examName}
                      onChange={(e) => setPaperInfo({ ...paperInfo, examName: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">সময়</label>
                    <input 
                      type="text"
                      value={paperInfo.time}
                      onChange={(e) => setPaperInfo({ ...paperInfo, time: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">পূর্ণমান</label>
                    <input 
                      type="number"
                      value={paperInfo.totalMarks}
                      onChange={(e) => setPaperInfo({ ...paperInfo, totalMarks: parseInt(e.target.value) })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-8 flex gap-4">
                  <button 
                    onClick={savePaper}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    সংরক্ষণ করুন
                  </button>
                  <button 
                    onClick={() => setActiveSection('generate')}
                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    বাতিল করুন
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-white p-10 rounded-xl shadow-2xl border border-slate-200 max-w-[800px] mx-auto">
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold">{paperInfo.schoolName || 'স্কুলের নাম'}</h1>
                  <h2 className="text-xl font-semibold">{paperInfo.examName || 'পরীক্ষার নাম'}</h2>
                  <div className="flex justify-between mt-4 border-b-2 border-slate-900 pb-2">
                    <span>শ্রেণি: {selectedClass} | বিষয়: {selectedSubject}</span>
                    <span>সময়: {paperInfo.time} | পূর্ণমান: {paperInfo.totalMarks}</span>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {generatedQuestions.filter(q => selectedQuestionIds.has(q.id)).map((q, i) => (
                    <div key={q.id}>
                      <div className="flex justify-between">
                        <p className="font-medium">{i + 1}. {q.question}</p>
                        <span className="font-bold">{q.marks}</span>
                      </div>
                      {q.options && (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2 ml-4">
                          {q.options.map((opt, oi) => (
                            <p key={oi}>{String.fromCharCode(97 + oi)}) {opt}</p>
                          ))}
                        </div>
                      )}
                      {q.matchingPairs && (
                        <div className="mt-2 ml-4 space-y-1">
                          {q.matchingPairs.map((pair, pi) => (
                            <div key={pi} className="grid grid-cols-2 gap-8">
                              <p>{pair.left}</p>
                              <p>{pair.right}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'ai-assistant' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col"
            >
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-bottom border-gray-100 bg-blue-50 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">এআই অ্যাসিস্ট্যান্ট</h2>
                    <p className="text-xs text-blue-600">পড়াশোনা বিষয়ক যেকোনো প্রশ্ন করুন</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4">
                        <MessageSquare size={32} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">আমি আপনাকে কীভাবে সাহায্য করতে পারি?</h3>
                      <p className="text-gray-500 max-w-xs">
                        পড়াশোনা, কোনো নির্দিষ্ট বিষয় বা প্রশ্নপত্র তৈরি নিয়ে আমার সাথে আলোচনা করতে পারেন।
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed",
                          msg.role === 'user'
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="আপনার প্রশ্ন এখানে লিখুন..."
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {activeSection === 'saved' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <h2 className="text-3xl font-bold text-slate-800 mb-8">সংরক্ষিত প্রশ্নপত্রসমূহ</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {savedPapers.map(paper => (
                  <div key={paper.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">{paper.examName}</h3>
                        <p className="text-slate-500">{paper.schoolName}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg">{paper.className} শ্রেণি</span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">{paper.subject}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">{new Date(paper.createdAt).toLocaleDateString('bn-BD')}</p>
                        <p className="text-sm font-bold text-slate-700 mt-1">মান: {paper.totalMarks}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => downloadPDF(paper, 'question')}
                        className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                      >
                        <Printer size={16} />
                        প্রশ্নপত্র PDF
                      </button>
                      <button 
                        onClick={() => downloadPDF(paper, 'answer')}
                        className="flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-green-700 transition-all"
                      >
                        <FileText size={16} />
                        উত্তরপত্র PDF
                      </button>
                      <button 
                        onClick={() => deletePaper(paper.id)}
                        className="col-span-2 flex items-center justify-center gap-2 bg-red-50 text-red-600 py-3 rounded-xl text-sm font-bold hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={16} />
                        মুছে ফেলুন
                      </button>
                    </div>
                  </div>
                ))}
                {savedPapers.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-medium">এখনও কোনো প্রশ্নপত্র সংরক্ষণ করা হয়নি।</p>
                    <button 
                      onClick={() => setActiveSection('generate')}
                      className="mt-4 text-blue-600 font-bold hover:underline"
                    >
                      নতুন প্রশ্ন তৈরি করুন
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800 mb-8">অ্যাপ সেটিংস</h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">ডিফল্ট স্কুলের নাম</label>
                    <input 
                      type="text"
                      value={settings.defaultSchoolName}
                      onChange={(e) => setSettings({ ...settings, defaultSchoolName: e.target.value })}
                      placeholder="আপনার স্কুলের নাম লিখুন"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600">শিক্ষকের নাম</label>
                    <input 
                      type="text"
                      value={settings.teacherName}
                      onChange={(e) => setSettings({ ...settings, teacherName: e.target.value })}
                      placeholder="আপনার নাম লিখুন"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-blue-900">অটো-সেভ সক্রিয়</p>
                          <p className="text-xs text-blue-700">আপনার সব ডাটা ব্রাউজারে সেভ হচ্ছে।</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
