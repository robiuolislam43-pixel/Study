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
  AlertCircle,
  Info,
  Loader2,
  ChevronRight,
  Menu,
  X,
  Printer,
  MessageSquare,
  Send,
  Cloud,
  LogOut,
  LogIn,
  User,
  RefreshCw,
  BookOpen,
  Trophy,
  BarChart3,
  Calculator,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Target,
  Star,
  Zap,
  Clock,
  History,
  Languages,
  Search,
  ListChecks,
  Type,
  Columns2,
  AlignLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateQuestions, Question, getAIChatResponse } from './services/geminiService';
import { QuestionPaper, AppSettings, CLASSES, SUBJECTS, PracticeSession } from './types';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

type Section = 'dashboard' | 'generate' | 'create-paper' | 'saved' | 'settings' | 'ai-assistant' | 'practice' | 'progress' | 'quiz';
type UserRole = 'teacher' | 'student' | null;

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  // State for data
  const [savedPapers, setSavedPapers] = useState<QuestionPaper[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
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
    DESCRIPTIVE: 2,
    MATH: 0
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null);

  // Practice state
  const [activePaper, setActivePaper] = useState<QuestionPaper | null>(null);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [practiceResult, setPracticeResult] = useState<{ score: number, total: number, results: Record<string, boolean> } | null>(null);
  const [studentName, setStudentName] = useState('');
  const [isSelfPracticeMode, setIsSelfPracticeMode] = useState(false);
  const [selfPracticeTopic, setSelfPracticeTopic] = useState('');
  const [selfPracticeChapter, setSelfPracticeChapter] = useState('');
  const [isSelfGenerating, setIsSelfGenerating] = useState(false);
  const [selfPracticeType, setSelfPracticeType] = useState<string>('COMBINED');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('All');
  const [viewingSession, setViewingSession] = useState<PracticeSession | null>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);

  // Paper creation state
  const [paperInfo, setPaperInfo] = useState({
    schoolName: '',
    examName: '',
    time: '২ ঘণ্টা ৩০ মিনিট',
    totalMarks: 100
  });

  const filteredPapers = React.useMemo(() => {
    return savedPapers.filter(p => 
      (filterSubject === 'All' || p.subject === filterSubject) &&
      (p.examName.toLowerCase().includes(searchQuery.toLowerCase()) || 
       p.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [savedPapers, filterSubject, searchQuery]);

  const practiceStats = React.useMemo(() => {
    if (practiceSessions.length === 0) return { averageScore: 0, totalSessions: 0 };
    const totalScorePercent = practiceSessions.reduce((acc, s) => acc + (s.score / s.totalMarks), 0);
    return {
      averageScore: Math.round((totalScorePercent / practiceSessions.length) * 100),
      totalSessions: practiceSessions.length
    };
  }, [practiceSessions]);

  const chartData = React.useMemo(() => {
    return practiceSessions.slice().reverse().map((s, i) => ({ 
      name: `Session ${i + 1}`, 
      score: Math.round((s.score / s.totalMarks) * 100) 
    }));
  }, [practiceSessions]);

  // Load data from LocalStorage
  useEffect(() => {
    const savedRole = localStorage.getItem('teaching_assistant_role') as UserRole;
    if (savedRole) setUserRole(savedRole);

    const saved = localStorage.getItem('teaching_assistant_papers');
    if (saved) setSavedPapers(JSON.parse(saved));
    
    const savedSessions = localStorage.getItem('teaching_assistant_sessions');
    if (savedSessions) setPracticeSessions(JSON.parse(savedSessions));
    
    const savedSettings = localStorage.getItem('teaching_assistant_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
      setPaperInfo(prev => ({ ...prev, schoolName: parsed.defaultSchoolName }));
    }

    // Check for Supabase session
    const minLoadingTime = new Promise(resolve => setTimeout(resolve, 2000));
    
    if (supabase) {
      Promise.all([
        supabase.auth.getSession().then(({ data: { session } }) => {
          setUser(session?.user ?? null);
          if (session?.user) {
            return fetchFromSupabase(session.user.id);
          }
        }),
        minLoadingTime
      ]).finally(() => setIsAppLoading(false));

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchFromSupabase(session.user.id);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      minLoadingTime.then(() => setIsAppLoading(false));
    }
  }, []);

  // Save data to LocalStorage
  useEffect(() => {
    localStorage.setItem('teaching_assistant_papers', JSON.stringify(savedPapers));
  }, [savedPapers]);

  useEffect(() => {
    localStorage.setItem('teaching_assistant_settings', JSON.stringify(settings));
  }, [settings]);

  const fetchFromSupabase = async (userId: string) => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      // Fetch papers
      const { data: papersData, error: papersError } = await supabase
        .from('papers')
        .select('*')
        .eq('user_id', userId);
      
      if (papersData && !papersError) {
        // Merge with local papers or replace? Let's merge for now.
        setSavedPapers(prev => {
          const merged = [...papersData, ...prev];
          // Filter unique by ID
          return Array.from(new Map(merged.map(p => [p.id, p])).values());
        });
      }

      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (settingsData && !settingsError) {
        setSettings(settingsData.config);
      }
    } catch (error) {
      console.error('Error fetching from Supabase:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToSupabase = async () => {
    if (!user || !supabase) return;
    setIsSyncing(true);
    try {
      // Upsert papers
      const papersToSync = savedPapers.map(p => ({
        ...p,
        user_id: user.id
      }));

      const { error: papersError } = await supabase
        .from('papers')
        .upsert(papersToSync, { onConflict: 'id' });

      if (papersError) throw papersError;

      // Upsert settings
      const { error: settingsError } = await supabase
        .from('settings')
        .upsert({
          user_id: user.id,
          config: settings
        }, { onConflict: 'user_id' });

      if (settingsError) throw settingsError;

      showToast('সুপাবেস-এর সাথে সফলভাবে সিঙ্ক হয়েছে!', 'success');
    } catch (error) {
      console.error('Error syncing to Supabase:', error);
      showToast('সিঙ্ক করতে সমস্যা হয়েছে।', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsAuthLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });
    if (error) showToast(error.message, 'error');
    else showToast('আপনার ইমেইল চেক করুন!', 'success');
    setIsAuthLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) showToast(error.message, 'error');
    setIsAuthLoading(false);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    if (role) {
      localStorage.setItem('teaching_assistant_role', role);
      setActiveSection('dashboard');
    }
  };

  const handleLogoutRole = () => {
    setUserRole(null);
    localStorage.removeItem('teaching_assistant_role');
  };

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (isAppLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-[100] overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute -top-1/2 -left-1/2 w-full h-full bg-indigo-500/20 rounded-full blur-[120px]"
          />
          <motion.div 
            animate={{ 
              scale: [1.2, 1, 1.2],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 5, repeat: Infinity }}
            className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-purple-500/20 rounded-full blur-[120px]"
          />
        </div>

        <motion.div 
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ 
            type: "spring",
            stiffness: 100,
            damping: 15,
            duration: 1
          }}
          className="relative z-10"
        >
          <div className="w-32 h-32 bg-linear-to-br from-indigo-600 to-purple-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_20px_50px_rgba(79,70,229,0.3)] relative group">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-white/20 rounded-[2.5rem] scale-110"
            />
            <GraduationCap size={60} className="text-white drop-shadow-lg" />
          </div>
        </motion.div>

        <div className="mt-12 text-center relative z-10">
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-5xl font-black text-white tracking-tighter mb-2"
          >
            পড়ালেখা<span className="text-indigo-400">.প্রো</span>
          </motion.h1>
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="h-1 w-24 bg-linear-to-r from-indigo-500 to-purple-500 mx-auto rounded-full mb-4"
          />
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="text-slate-400 font-bold text-sm uppercase tracking-[0.3em]"
          >
            স্মার্ট লার্নিং প্ল্যাটফর্ম
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-12 flex flex-col items-center gap-3"
        >
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
              />
            ))}
          </div>
        </motion.div>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={cn(
                "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 rounded-2xl font-black text-sm shadow-2xl flex items-center gap-3 border backdrop-blur-md",
                toast.type === 'success' ? "bg-emerald-600/90 text-white border-emerald-400/50" :
                toast.type === 'error' ? "bg-red-600/90 text-white border-red-400/50" :
                "bg-indigo-600/90 text-white border-indigo-400/50"
              )}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
               toast.type === 'error' ? <AlertCircle size={20} /> : <Info size={20} />}
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-6 relative overflow-hidden selection:bg-indigo-100">
        {/* Animated Background Blobs */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
              x: [0, 100, 0],
              y: [0, -50, 0]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute -top-40 -right-40 w-[800px] h-[800px] bg-indigo-200/20 rounded-full blur-[60px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, -45, 0],
              x: [0, -80, 0],
              y: [0, 100, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-40 -left-40 w-[800px] h-[800px] bg-purple-200/20 rounded-full blur-[60px]" 
          />
        </div>

        <div className="max-w-5xl w-full relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-white shadow-xl shadow-indigo-100 rounded-full mb-8 border border-indigo-50">
              <Sparkles size={20} className="text-indigo-600 animate-pulse" />
              <span className="text-sm font-black text-indigo-900 uppercase tracking-widest">পড়ালেখা.প্রো</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-tight mb-6">
              আপনার <span className="gradient-text">ভূমিকা</span> নির্বাচন করুন
            </h1>
            <p className="text-xl text-slate-500 font-bold max-w-2xl mx-auto leading-relaxed">
              শিক্ষক হিসেবে প্রশ্নপত্র তৈরি করুন অথবা শিক্ষার্থী হিসেবে প্র্যাকটিস শুরু করুন। আপনার প্রয়োজন অনুযায়ী সঠিক অপশনটি বেছে নিন।
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <motion.button
              whileHover={{ scale: 1.02, y: -15 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleRoleSelect('teacher')}
              className="group relative bg-white/95 backdrop-blur-xl p-12 rounded-[4rem] shadow-ultra border border-white/50 hover:border-indigo-500/30 transition-all text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-1000 blur-xl opacity-50" />
              <div className="relative z-10">
                <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-10 shadow-2xl shadow-indigo-200 group-hover:rotate-12 transition-transform duration-500">
                  <GraduationCap size={48} strokeWidth={1.5} />
                </div>
                <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">আমি একজন শিক্ষক</h2>
                <p className="text-slate-500 font-bold text-xl leading-relaxed mb-10">
                  এআই ব্যবহার করে মুহূর্তেই প্রশ্নপত্র তৈরি করুন, শিক্ষার্থীদের অগ্রগতি দেখুন এবং স্মার্টলি ক্লাস পরিচালনা করুন।
                </p>
                <div className="flex items-center gap-4 text-indigo-600 font-black text-2xl">
                  শুরু করুন <ArrowRight size={28} className="group-hover:translate-x-3 transition-transform" />
                </div>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -15 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleRoleSelect('student')}
              className="group relative bg-white/95 backdrop-blur-xl p-12 rounded-[4rem] shadow-ultra border border-white/50 hover:border-purple-500/30 transition-all text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-50 rounded-full -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-1000 blur-xl opacity-50" />
              <div className="relative z-10">
                <div className="w-24 h-24 bg-purple-600 text-white rounded-[2rem] flex items-center justify-center mb-10 shadow-2xl shadow-purple-200 group-hover:-rotate-12 transition-transform duration-500">
                  <BookOpen size={48} strokeWidth={1.5} />
                </div>
                <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">আমি একজন শিক্ষার্থী</h2>
                <p className="text-slate-500 font-bold text-xl leading-relaxed mb-10">
                  বিভিন্ন বিষয়ের প্রশ্নপত্র প্র্যাকটিস করো, তোমার স্কোর দেখো এবং নিজের পড়াশোনার উন্নতি পর্যবেক্ষণ করো।
                </p>
                <div className="flex items-center gap-4 text-purple-600 font-black text-2xl">
                  প্র্যাকটিস শুরু করো <ArrowRight size={28} className="group-hover:translate-x-3 transition-transform" />
                </div>
              </div>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    if (!topic.trim()) {
      showToast('দয়া করে একটি টপিক লিখুন।', 'info');
      return;
    }
    setIsGenerating(true);
    setGeneratingItemId('generate');
    try {
      const questions = await generateQuestions(selectedClass, selectedSubject, topic, counts);
      if (questions.length === 0) {
        showToast('প্রশ্ন জেনারেট করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।', 'error');
      } else {
        setGeneratedQuestions(questions);
        setSelectedQuestionIds(new Set());
      }
    } catch (error) {
      console.error('Generation error:', error);
      showToast('সার্ভারে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।', 'error');
    } finally {
      setIsGenerating(false);
      setGeneratingItemId(null);
    }
  };
  const handleQuickMath = async () => {
    setIsGenerating(true);
    setGeneratingItemId('quick-math');
    try {
      const mathCounts = { 
        MCQ: 0, 
        SHORT: 0, 
        CQ: 0, 
        FILL_BLANKS: 0, 
        MATCHING: 0, 
        DESCRIPTIVE: 0, 
        MATH: 10 
      };
      const questions = await generateQuestions(selectedClass, 'গণিত', 'যোগ, বিয়োগ, গুণ, ভাগ', mathCounts);
      
      if (questions.length === 0) {
        showToast('ম্যাপ চ্যালেঞ্জ জেনারেট করতে সমস্যা হয়েছে।', 'error');
        setIsGenerating(false);
        setGeneratingItemId(null);
        return;
      }

      const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
      const newPaper: QuestionPaper = {
        id: 'quick-math-' + Date.now(),
        schoolName: 'কুইক ম্যাথ প্র্যাকটিস',
        examName: 'গণিত চ্যালেঞ্জ',
        className: selectedClass,
        subject: 'গণিত',
        time: '১৫ মিনিট',
        totalMarks: totalMarks,
        questions: questions,
        createdAt: new Date().toISOString()
      };
      
      setGeneratedQuestions(questions);
      setSelectedQuestionIds(new Set(questions.map(q => q.id)));
      setActivePaper(newPaper);
      setStudentAnswers({});
      setPracticeResult(null);
      setActiveSection('quiz');
    } catch (error) {
      console.error('Error in quick math:', error);
    } finally {
      setIsGenerating(false);
      setGeneratingItemId(null);
    }
  };

  const handleQuickPractice = async (subject: string, type: 'MCQ' | 'SHORT') => {
    const itemId = `${subject}-${type}`;
    setIsGenerating(true);
    setGeneratingItemId(itemId);
    try {
      const practiceCounts = {
        MCQ: type === 'MCQ' ? 10 : 0,
        SHORT: type === 'SHORT' ? 10 : 0,
        CQ: 0,
        FILL_BLANKS: 0,
        MATCHING: 0,
        DESCRIPTIVE: 0,
        MATH: 0
      };

      const questions = await generateQuestions(selectedClass, subject, 'সাধারণ অনুশীলন', practiceCounts);
      
      const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
      const newPaper: QuestionPaper = {
        id: 'quick-practice-' + Date.now(),
        schoolName: 'কুইক প্র্যাকটিস',
        examName: `${subject} অনুশীলন (${type === 'MCQ' ? 'MCQ' : 'সংক্ষিপ্ত'})`,
        className: selectedClass,
        subject: subject,
        time: '২০ মিনিট',
        totalMarks: totalMarks,
        questions: questions,
        createdAt: new Date().toISOString()
      };
      
      setGeneratedQuestions(questions);
      setSelectedQuestionIds(new Set(questions.map(q => q.id)));
      setActivePaper(newPaper);
      setStudentAnswers({});
      setPracticeResult(null);
      setActiveSection('quiz');
    } catch (error) {
      console.error('Error in quick practice:', error);
    } finally {
      setIsGenerating(false);
      setGeneratingItemId(null);
    }
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

  const handleSelectAll = () => {
    if (selectedQuestionIds.size === generatedQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(generatedQuestions.map(q => q.id)));
    }
  };

  const handleCreatePaper = () => {
    const selectedQuestions = generatedQuestions.filter(q => selectedQuestionIds.has(q.id));
    if (selectedQuestions.length === 0) {
      showToast('দয়া করে অন্তত একটি প্রশ্ন নির্বাচন করুন।', 'info');
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
    
    // Auto-sync to Supabase if logged in
    if (user && supabase) {
      supabase.from('papers').upsert({
        ...newPaper,
        user_id: user.id
      }).then(({ error }) => {
        if (error) console.error('Error auto-syncing paper:', error);
      });
    }

    setActiveSection('dashboard');
    // Reset
    setGeneratedQuestions([]);
    setSelectedQuestionIds(new Set());
  };

  const handleSelfPractice = async () => {
    if (!selfPracticeTopic.trim() || !selfPracticeChapter.trim()) {
      showToast('দয়া করে অধ্যায় এবং টপিক লিখুন।', 'info');
      return;
    }
    setIsSelfGenerating(true);
    try {
      let qCounts = {
        MCQ: 0,
        SHORT: 0,
        CQ: 0,
        FILL_BLANKS: 0,
        MATCHING: 0,
        DESCRIPTIVE: 0,
        MATH: 0
      };

      if (selfPracticeType === 'MCQ') qCounts.MCQ = 10;
      else if (selfPracticeType === 'FILL_BLANKS') qCounts.FILL_BLANKS = 10;
      else if (selfPracticeType === 'MATCHING') qCounts.MATCHING = 5;
      else if (selfPracticeType === 'SHORT') qCounts.SHORT = 5;
      else if (selfPracticeType === 'DESCRIPTIVE') qCounts.DESCRIPTIVE = 3;
      else {
        // Combined
        qCounts = {
          MCQ: 5,
          SHORT: 3,
          CQ: 0,
          FILL_BLANKS: 2,
          MATCHING: 0,
          DESCRIPTIVE: 0,
          MATH: 0
        };
      }

      const questions = await generateQuestions(selectedClass, selectedSubject, `${selfPracticeChapter} - ${selfPracticeTopic}`, qCounts);
      
      if (questions.length === 0) {
        showToast('প্রশ্ন জেনারেট করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।', 'error');
        setIsSelfGenerating(false);
        return;
      }
      if (questions.length > 0) {
        const selfPaper: QuestionPaper = {
          id: `self-${Date.now()}`,
          schoolName: 'সেলফ প্র্যাকটিস',
          examName: `${selectedSubject} - ${selfPracticeChapter} (${selfPracticeType === 'COMBINED' ? 'সম্মিলিত' : selfPracticeType})`,
          className: selectedClass,
          subject: selectedSubject,
          time: '৩০ মিনিট',
          totalMarks: questions.reduce((acc, q) => acc + q.marks, 0),
          questions,
          createdAt: new Date().toISOString()
        };
        startPractice(selfPaper);
        setIsSelfPracticeMode(false);
      }
    } catch (error) {
      console.error('Error in self practice generation:', error);
    } finally {
      setIsSelfGenerating(false);
    }
  };

  const startPractice = (paper: QuestionPaper) => {
    setActivePaper(paper);
    setStudentAnswers({});
    setPracticeResult(null);
    setActiveSection('quiz');
  };

  const submitPractice = () => {
    if (!activePaper) return;
    
    if (!studentName.trim()) {
      showToast('অনুগ্রহ করে তোমার নাম লিখো', 'error');
      // Scroll to the name input
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    let score = 0;
    let total = 0;
    const results: Record<string, boolean> = {};
    
    activePaper.questions.forEach(q => {
      total += q.marks;
      const studentAns = (studentAnswers[q.id] || '').trim().toLowerCase();
      const correctAns = (q.answer || '').trim().toLowerCase();
      
      let isCorrect = false;
      if (q.type === 'MCQ' || q.type === 'MATH' || q.type === 'FILL_BLANKS') {
        if (studentAns === correctAns && studentAns !== '') {
          score += q.marks;
          isCorrect = true;
        }
      } else {
        // For CQ/Short/Descriptive, we'll do a simple keyword match for demo 
        // or just mark as partially correct if it's not empty
        if (studentAns && studentAns.length > 10) {
          score += q.marks * 0.8; // Give 80% for descriptive if not empty
          isCorrect = true;
        }
      }
      results[q.id] = isCorrect;
    });

    const result = { score, total, results };
    setPracticeResult(result as any);

    const session: PracticeSession = {
      id: Date.now().toString(),
      paperId: activePaper.id,
      paperName: activePaper.examName,
      studentName: studentName || 'অজ্ঞাত শিক্ষার্থী',
      score,
      totalMarks: total,
      date: new Date().toISOString(),
      answers: studentAnswers,
      results
    };

    const newSessions = [session, ...practiceSessions];
    setPracticeSessions(newSessions);
    localStorage.setItem('teaching_assistant_sessions', JSON.stringify(newSessions));
    
    // Scroll to top to see results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetPractice = () => {
    setActivePaper(null);
    setStudentAnswers({});
    setPracticeResult(null);
    setActiveSection('practice');
  };

  const deletePaper = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে আপনি এই প্রশ্নপত্রটি মুছে ফেলতে চান?')) return;
    
    const updated = savedPapers.filter(p => p.id !== id);
    setSavedPapers(updated);
    localStorage.setItem('teaching_assistant_papers', JSON.stringify(updated));
    
    if (supabase && user) {
      await supabase.from('question_papers').delete().eq('id', id);
    }
  };

  const downloadPaper = (paper: QuestionPaper) => {
    downloadPDF(paper, 'question');
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
      
      // Add an empty model message that we will update with chunks
      setChatMessages(prev => [...prev, { role: 'model', text: '' }]);
      
      let fullResponse = "";
      await getAIChatResponse(userMessage, history, (chunk) => {
        fullResponse += chunk;
        setChatMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'model', text: fullResponse };
          return newMessages;
        });
      });
      
      if (!fullResponse) {
        setChatMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'model', text: 'দুঃখিত, আমি উত্তর দিতে পারছি না।' };
          return newMessages;
        });
      }
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
    element.style.padding = '60px';
    element.style.width = '900px';
    element.style.backgroundColor = 'white';
    element.style.color = '#0f172a';
    element.style.fontFamily = '"Hind Siliguri", "Inter", sans-serif';
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
      DESCRIPTIVE: 'বর্ণনামূলক প্রশ্ন',
      MATH: 'গণিত সমস্যা'
    };

    const header = `
      <div style="text-align: center; margin-bottom: 50px; border: 4px solid #6366f1; padding: 40px; border-radius: 40px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); position: relative; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05);">
        <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: linear-gradient(to bottom right, #6366f1, #a855f7); opacity: 0.05; border-radius: 50%;"></div>
        <div style="position: absolute; bottom: -30px; left: -30px; width: 120px; height: 120px; background: linear-gradient(to top left, #ec4899, #f43f5e); opacity: 0.03; border-radius: 50%;"></div>
        
        <h1 style="font-size: 42px; margin: 0; color: #1e1b4b; font-weight: 900; letter-spacing: -1.5px; text-transform: uppercase;">${paper.schoolName || 'শিক্ষা প্রতিষ্ঠানের নাম'}</h1>
        <div style="height: 4px; width: 80px; background: #6366f1; margin: 20px auto; border-radius: 2px;"></div>
        <h2 style="font-size: 28px; margin: 10px 0; color: #4f46e5; font-weight: 800; letter-spacing: 0.5px;">${paper.examName || 'পরীক্ষার নাম'}</h2>
        
        <div style="display: flex; justify-content: space-between; margin-top: 35px; padding: 20px; background: white; border-radius: 20px; border: 2px solid #eef2ff; font-size: 18px; font-weight: 700; color: #475569; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);">
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 5px;">
            <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">শ্রেণি ও বিষয়</span>
            <span>${paper.className} শ্রেণি | ${paper.subject}</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
            <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">সময় ও পূর্ণমান</span>
            <span>${paper.time} | ${paper.totalMarks} নম্বর</span>
          </div>
        </div>
      </div>
    `;

    let sectionsHtml = '';
    const sectionsOrder = ['MCQ', 'FILL_BLANKS', 'MATCHING', 'MATH', 'SHORT', 'DESCRIPTIVE', 'CQ'];
    
    sectionsOrder.forEach(typeKey => {
      const qs = groupedQuestions[typeKey];
      if (qs && qs.length > 0) {
        const sectionLabel = typeLabels[typeKey] || typeKey;
        const sectionColors: Record<string, string> = {
          MCQ: '#6366f1',
          FILL_BLANKS: '#8b5cf6',
          MATCHING: '#ec4899',
          MATH: '#f59e0b',
          SHORT: '#10b981',
          DESCRIPTIVE: '#3b82f6',
          CQ: '#ef4444'
        };
        const color = sectionColors[typeKey] || '#6366f1';

        sectionsHtml += `
          <div style="margin-bottom: 50px; page-break-inside: avoid;">
            <div style="display: flex; align-items: center; margin-bottom: 30px; padding-bottom: 10px; border-bottom: 3px solid ${color}20;">
              <div style="width: 14px; height: 35px; background: ${color}; border-radius: 7px; margin-right: 18px; box-shadow: 0 4px 6px -1px ${color}40;"></div>
              <h3 style="color: #1e1b4b; font-size: 24px; font-weight: 900; margin: 0; letter-spacing: 0.5px;">
                ${sectionLabel}
              </h3>
            </div>
            <div style="padding-left: 10px;">
              ${qs.map((q, i) => `
                <div style="margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 25px; position: relative;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; gap: 15px; flex: 1;">
                      <div style="width: 32px; height: 32px; background: ${color}10; color: ${color}; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; flex-shrink: 0; border: 1px solid ${color}20;">
                        ${i + 1}
                      </div>
                      <p style="font-weight: 700; margin: 0; font-size: 19px; color: #1e293b; line-height: 1.6;">
                        ${q.question}
                      </p>
                    </div>
                    <div style="font-weight: 900; color: ${color}; background: ${color}05; padding: 6px 14px; border-radius: 12px; font-size: 14px; border: 2px solid ${color}10; margin-left: 25px; white-space: nowrap;">
                      ${q.marks} নম্বর
                    </div>
                  </div>
                  
                  ${type === 'answer' ? `
                    <div style="margin-top: 15px; padding: 15px; background-color: #f0fdf4; border-radius: 12px; font-size: 16px; border: 1px solid #dcfce7; color: #166534;">
                      <strong style="color: #15803d; font-weight: 900; margin-right: 10px;">উত্তর:</strong> ${q.answer}
                    </div>
                  ` : ''}

                  ${type === 'question' && q.options ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px 40px; margin-top: 18px; margin-left: 30px;">
                      ${q.options.map((opt, oi) => `
                        <div style="font-size: 16px; color: #475569; font-weight: 600; display: flex; align-items: center;">
                          <span style="color: #4f46e5; font-weight: 900; width: 25px; height: 25px; background: #eef2ff; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 12px;">
                            ${String.fromCharCode(65 + oi)}
                          </span> 
                          ${opt}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}

                  ${type === 'question' && q.matchingPairs ? `
                    <div style="margin-top: 20px; margin-left: 30px; border: 2px solid #e2e8f0; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                          <th style="padding: 12px 20px; text-align: left; width: 50%; color: #4f46e5; font-weight: 900; font-size: 14px; text-transform: uppercase;">বাম পাশ</th>
                          <th style="padding: 12px 20px; text-align: left; width: 50%; color: #4f46e5; font-weight: 900; font-size: 14px; text-transform: uppercase;">ডান পাশ</th>
                        </tr>
                        ${q.matchingPairs.map((pair, pi) => `
                          <tr style="${pi % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #fcfcfc;'}">
                            <td style="border-right: 1px solid #f1f5f9; padding: 12px 20px; color: #334155; font-weight: 600; font-size: 15px;">${pair.left}</td>
                            <td style="padding: 12px 20px; color: #334155; font-weight: 600; font-size: 15px;">${pair.right}</td>
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
      }
    });

    element.innerHTML = `
      <div style="border: 1px solid #e2e8f0; padding: 50px; border-radius: 40px; min-height: 1100px; background: white; box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.05);">
        ${header}
        ${sectionsHtml}
        <div style="margin-top: 80px; text-align: center; border-top: 2px solid #f1f5f9; padding-top: 30px; color: #94a3b8; font-size: 14px; font-weight: 700;">
          এই প্রশ্নপত্রটি <span style="color: #4f46e5;">"পড়ালেখা.প্রো"</span> এআই অ্যাপের মাধ্যমে তৈরি করা হয়েছে।
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
      showToast('পিডিএফ তৈরি করতে সমস্যা হয়েছে।', 'error');
    } finally {
      document.body.removeChild(element);
    }
  };

  const NavItem = ({ section, icon: Icon, label }: { section: Section, icon: any, label: string }) => (
    <motion.button
      whileHover={{ x: 8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        setActiveSection(section);
        setIsSidebarOpen(false);
      }}
      className={cn(
        "w-full flex items-center gap-5 px-8 py-5 rounded-[2rem] font-black transition-all duration-500 group relative overflow-hidden",
        activeSection === section 
          ? "text-white shadow-2xl shadow-indigo-200/50" 
          : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
      )}
    >
      <Icon size={24} className={cn(
        "transition-all duration-500 relative z-10",
        activeSection === section ? "scale-110 drop-shadow-lg" : "group-hover:scale-110 group-hover:text-indigo-600"
      )} />
      <span className="tracking-tight relative z-10 font-black">{label}</span>
      {activeSection === section && (
        <motion.div 
          layoutId="activeTab"
          className="absolute inset-0 bg-linear-to-br from-indigo-600 via-indigo-500 to-purple-600"
          initial={false}
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent_70%)]" />
        </motion.div>
      )}
      {activeSection === section && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute right-4 w-2 h-2 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10"
        />
      )}
    </motion.button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-600 relative overflow-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="blob w-72 h-72 bg-purple-300 top-0 -left-20 mix-blend-multiply opacity-20" />
        <div className="blob w-96 h-96 bg-indigo-300 top-1/2 -right-20 mix-blend-multiply opacity-20 delay-2000" />
        <div className="blob w-80 h-80 bg-pink-300 -bottom-20 left-1/3 mix-blend-multiply opacity-20 delay-4000" />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b z-50 px-6 py-4 flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-xl tracking-tighter">পড়ালেখা<span className="text-indigo-600">.প্রো</span></h1>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 bg-slate-50 rounded-xl text-slate-600 active:scale-90 transition-transform">
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-white/95 backdrop-blur-xl border-r border-slate-200/50 transition-all duration-500 lg:static lg:block shadow-2xl shadow-slate-200/50",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-full flex flex-col p-8">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-14 h-14 bg-linear-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 rotate-3 group-hover:rotate-6 transition-transform duration-500">
                <Sparkles className="text-white w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">পড়ালেখা</h1>
                <p className="text-indigo-600 font-black text-xs uppercase tracking-widest mt-1">.প্রো</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            {userRole === 'teacher' ? (
              <>
                <NavItem section="dashboard" icon={LayoutDashboard} label="ড্যাশবোর্ড" />
                <NavItem section="generate" icon={FilePlus} label="প্রশ্ন তৈরি করো" />
                <NavItem section="saved" icon={Download} label="সংরক্ষিত প্রশ্ন" />
                <NavItem section="practice" icon={GraduationCap} label="শিক্ষার্থী প্র্যাকটিস" />
                <NavItem section="progress" icon={BarChart3} label="শিক্ষার্থীর অগ্রগতি" />
                <NavItem section="ai-assistant" icon={MessageSquare} label="এআই অ্যাসিস্ট্যান্ট" />
              </>
            ) : (
              <>
                <NavItem section="dashboard" icon={LayoutDashboard} label="ড্যাশবোর্ড" />
                <NavItem section="practice" icon={GraduationCap} label="প্র্যাকটিস শুরু করো" />
                <NavItem section="progress" icon={BarChart3} label="আমার অগ্রগতি" />
                <NavItem section="ai-assistant" icon={MessageSquare} label="এআই অ্যাসিস্ট্যান্ট" />
              </>
            )}
            <NavItem section="settings" icon={SettingsIcon} label="সেটিংস" />
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-100 space-y-4">
            <button 
              onClick={handleLogoutRole}
              className="w-full flex items-center gap-4 px-6 py-4 rounded-[1.25rem] font-black text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group"
            >
              <RotateCcw size={22} className="group-hover:rotate-180 transition-transform duration-500" />
              রোল পরিবর্তন করুন
            </button>
            
            {user ? (
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-100 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-700" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                    <User className="text-indigo-600 w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{user.email?.split('@')[0]}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">অনলাইন</p>
                  </div>
                  <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                    <LogOut size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setActiveSection('settings')}
                className="w-full flex items-center gap-4 px-6 py-4 rounded-[1.25rem] bg-slate-900 text-white font-black hover:bg-slate-800 transition-all shadow-xl"
              >
                <LogIn size={22} /> লগ ইন করুন
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6 pt-20 lg:pt-6 overflow-auto relative z-10">
        <AnimatePresence mode="wait">
          {activeSection === 'dashboard' && userRole === 'student' && (
            <motion.div
              key="student-dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="max-w-7xl mx-auto space-y-10"
            >
              {/* Hero Welcome Section */}
              <div className="relative overflow-hidden rounded-[3.5rem] bg-linear-to-br from-indigo-600 via-purple-600 to-pink-500 p-12 text-white shadow-ultra group">
                <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      rotate: [0, 90, 0],
                      x: [0, 50, 0],
                      y: [0, -30, 0]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-xl" 
                  />
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, -45, 0],
                      x: [0, -40, 0],
                      y: [0, 60, 0]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-lg" 
                  />
                </div>

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                  <div className="max-w-3xl">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="inline-flex items-center gap-3 px-6 py-2.5 bg-white/30 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-widest mb-8 border border-white/40 shadow-xl"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" /> তোমার শেখার যাত্রা শুরু হোক
                    </motion.div>
                    <motion.h2 
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, type: "spring", damping: 15 }}
                      className="text-6xl lg:text-7xl font-black mb-8 tracking-tighter leading-tight"
                    >
                      স্বাগতম, <span className="text-yellow-300 drop-shadow-lg">{studentName || 'শিক্ষার্থী'}</span>! 👋
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2, type: "spring", damping: 15 }}
                      className="text-white text-2xl font-medium leading-relaxed mb-12 max-w-2xl"
                    >
                      আজ তোমার শেখার যাত্রায় নতুন কী যোগ করতে চাও? তোমার লক্ষ্য অর্জনে আমরা পাশে আছি। প্রতিটি প্রশ্নের উত্তর তোমাকে নিয়ে যাবে সাফল্যের আরও কাছে।
                    </motion.p>
                    <div className="flex flex-wrap gap-6">
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -5, shadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveSection('practice')}
                        className="bg-white text-indigo-600 px-12 py-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-900/40 flex items-center gap-4 hover:bg-indigo-50 transition-all group"
                      >
                        <BookOpen className="w-7 h-7" /> অনুশীলন শুরু করো <ArrowRight className="w-7 h-7 group-hover:translate-x-3 transition-transform" />
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveSection('ai-assistant')}
                        className="bg-indigo-500/30 backdrop-blur-xl text-white border-2 border-white/30 px-12 py-6 rounded-[2rem] font-black text-xl shadow-2xl flex items-center gap-4 hover:bg-indigo-500/40 transition-all"
                      >
                        <MessageSquare className="w-7 h-7" /> এআই শিক্ষক
                      </motion.button>
                    </div>
                  </div>
                  <div className="relative hidden lg:block">
                    <motion.div 
                      animate={{ y: [0, -25, 0], rotate: [0, 5, 0] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                      className="w-80 h-80 bg-white/10 backdrop-blur-2xl rounded-[5rem] border-2 border-white/20 flex items-center justify-center p-16 shadow-2xl group/cap"
                    >
                      <div className="absolute inset-8 border-4 border-dashed border-white/20 rounded-[4rem] animate-spin-slow group-hover:border-white/40 transition-colors" />
                      <GraduationCap className="w-full h-full text-white drop-shadow-2xl group-hover:scale-110 transition-transform duration-500" strokeWidth={1} />
                    </motion.div>
                    {/* Floating elements */}
                    <div className="absolute -top-8 -left-8 w-24 h-24 bg-yellow-400 rounded-3xl flex items-center justify-center shadow-2xl rotate-12 animate-bounce">
                      <Star className="w-12 h-12 text-indigo-900" fill="currentColor" />
                    </div>
                    <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-pink-500 rounded-full flex items-center justify-center shadow-2xl -rotate-12 animate-float" style={{ animationDelay: '1s' }}>
                      <Trophy className="w-14 h-14 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Subject-wise Practice Section */}
                <div className="lg:col-span-2 space-y-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
                    <div>
                      <h3 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                        <Target className="w-10 h-10 text-indigo-600" /> বিষয়ভিত্তিক অনুশীলন
                      </h3>
                      <p className="text-slate-500 font-bold text-lg mt-2">তোমার পছন্দের বিষয়টি বেছে নিয়ে প্র্যাকটিস শুরু করো</p>
                    </div>
                    <div className="flex items-center gap-4 bg-white p-3 rounded-[1.5rem] border border-slate-100 shadow-ultra">
                      <span className="text-xs font-black text-slate-400 px-2 uppercase tracking-widest">শ্রেণী:</span>
                      <select 
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="bg-slate-50 px-6 py-3 rounded-xl text-indigo-600 font-black outline-hidden border border-transparent focus:border-indigo-200 transition-all cursor-pointer"
                      >
                        {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {SUBJECTS.map((subject, idx) => (
                      <motion.div 
                        key={subject}
                        whileHover={{ y: -12, scale: 1.02 }}
                        className="glass-card p-10 rounded-[3rem] border-slate-100 shadow-ultra group relative overflow-hidden"
                      >
                        <div className={`absolute top-0 right-0 w-48 h-48 opacity-10 rounded-full -mr-24 -mt-24 transition-transform duration-1000 group-hover:scale-150 ${
                          idx % 4 === 0 ? 'bg-blue-600' :
                          idx % 4 === 1 ? 'bg-purple-600' :
                          idx % 4 === 2 ? 'bg-pink-600' :
                          'bg-orange-600'
                        }`} />
                        
                        <div className="flex items-start justify-between mb-10 relative z-10">
                          <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500 ${
                            idx % 4 === 0 ? 'bg-blue-50 text-blue-600' :
                            idx % 4 === 1 ? 'bg-purple-50 text-purple-600' :
                            idx % 4 === 2 ? 'bg-pink-50 text-pink-600' :
                            'bg-orange-50 text-orange-600'
                          }`}>
                            {subject === 'গণিত' ? <Calculator className="w-10 h-10" /> : 
                             subject === 'বিজ্ঞান' ? <Zap className="w-10 h-10" /> :
                             subject === 'পদার্থবিজ্ঞান' ? <Zap className="w-10 h-10" /> :
                             subject === 'রসায়ন' ? <Cloud className="w-10 h-10" /> :
                             subject === 'জীববিজ্ঞান' ? <Search className="w-10 h-10" /> :
                             subject === 'ইংরেজি' ? <Languages className="w-10 h-10" /> :
                             <BookOpen className="w-10 h-10" />}
                          </div>
                          <div className="px-5 py-2 bg-slate-50 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100 shadow-sm">
                            {subject}
                          </div>
                        </div>
                        
                        <h4 className="text-3xl font-black text-slate-900 mb-3 relative z-10 tracking-tight group-hover:text-indigo-600 transition-colors">{subject}</h4>
                        <p className="text-slate-500 font-bold text-base mb-10 relative z-10 leading-relaxed">
                          {subject} বিষয়ের গুরুত্বপূর্ণ MCQ এবং সংক্ষিপ্ত প্রশ্ন প্র্যাকটিস করে নিজেকে ঝালিয়ে নাও।
                        </p>
                        
                        <div className="flex gap-4 relative z-10">
                          <motion.button 
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleQuickPractice(subject, 'MCQ')}
                            disabled={isGenerating}
                            className="flex-1 py-5 bg-slate-900 text-white rounded-[1.25rem] text-sm font-black transition-all hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl disabled:opacity-50"
                          >
                            {generatingItemId === `${subject}-MCQ` ? <Loader2 className="w-5 h-5 animate-spin" /> : 'MCQ প্র্যাকটিস'}
                          </motion.button>
                          <motion.button 
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleQuickPractice(subject, 'SHORT')}
                            disabled={isGenerating}
                            className="flex-1 py-5 bg-white text-slate-900 border-2 border-slate-100 rounded-[1.25rem] text-sm font-black transition-all hover:border-indigo-200 hover:text-indigo-600 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                          >
                            {generatingItemId === `${subject}-SHORT` ? <Loader2 className="w-5 h-5 animate-spin" /> : 'সংক্ষিপ্ত প্রশ্ন'}
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Sidebar Stats & Activity */}
                <div className="space-y-10">
                  {/* Progress Chart Card */}
                  <div className="glass-card p-10 rounded-[3.5rem] border-slate-100 shadow-ultra">
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4 tracking-tight">
                        <BarChart3 className="w-8 h-8 text-indigo-600" /> তোমার অগ্রগতি
                      </h3>
                    </div>
                    <div className="h-64 w-full">
                      {practiceSessions.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={practiceSessions.slice(-7)}>
                            <defs>
                              <linearGradient id="studentProgress" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <Tooltip 
                              contentStyle={{ 
                                borderRadius: '24px', 
                                border: 'none', 
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                                padding: '20px',
                                fontWeight: '900'
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#6366f1" 
                              strokeWidth={6}
                              fillOpacity={1} 
                              fill="url(#studentProgress)" 
                              animationDuration={2000}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                          <BarChart3 className="w-16 h-16 mb-4 text-slate-200" />
                          <p className="text-sm font-black text-slate-400">এখনো কোনো ডাটা নেই</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-10 grid grid-cols-2 gap-6">
                      <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100 shadow-inner">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">গড় স্কোর</p>
                        <p className="text-3xl font-black text-indigo-600 tracking-tighter">
                          {practiceSessions.length > 0 
                            ? Math.round((practiceSessions.reduce((acc, s) => acc + (s.score / s.totalMarks), 0) / practiceSessions.length) * 100)
                            : 0}%
                        </p>
                      </div>
                      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 shadow-inner">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">মোট সেশন</p>
                        <p className="text-3xl font-black text-emerald-600 tracking-tighter">{practiceSessions.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Math Challenge Card */}
                  <div className="glass-card p-12 rounded-[3.5rem] bg-slate-900 text-white border-none relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                    <div className="relative z-10">
                      <div className="w-20 h-20 bg-yellow-400 rounded-[1.5rem] flex items-center justify-center mb-10 shadow-2xl shadow-yellow-400/20 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                        <Zap className="w-12 h-12 text-slate-900" />
                      </div>
                      <h3 className="text-4xl font-black mb-6 tracking-tight">গণিত চ্যালেঞ্জ!</h3>
                      <p className="text-slate-400 font-bold text-xl leading-relaxed mb-10">
                        ১০টি দ্রুত গণিত সমাধান করে তোমার মস্তিষ্ককে সচল রাখো। প্রতিদিনের চ্যালেঞ্জ নাও।
                      </p>
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleQuickMath}
                        disabled={isGenerating}
                        className="w-full py-6 bg-white text-slate-900 rounded-[1.5rem] font-black text-xl hover:bg-indigo-50 transition-all shadow-2xl flex items-center justify-center gap-4 disabled:opacity-50"
                      >
                        {generatingItemId === 'quick-math' ? <Loader2 className="w-7 h-7 animate-spin" /> : 'চ্যালেঞ্জ শুরু করো'}
                      </motion.button>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="glass-card p-10 rounded-[3.5rem] border-slate-100 shadow-ultra">
                    <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-4 tracking-tight">
                      <History className="w-8 h-8 text-indigo-600" /> সাম্প্রতিক ফলাফল
                    </h3>
                    <div className="space-y-5">
                      {practiceSessions.slice(0, 5).map((session, i) => (
                        <motion.div 
                          key={session.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          onClick={() => setViewingSession(session)}
                          className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-md transition-all group cursor-pointer"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                              <CheckCircle2 className="w-6 h-6 text-emerald-500 group-hover:text-white" />
                            </div>
                            <div>
                              <p className="text-base font-black text-slate-800 truncate max-w-[160px]">{session.paperName || 'অনুশীলন'}</p>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{new Date(session.date).toLocaleDateString('bn-BD')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-black text-indigo-600 tracking-tighter">{session.score}/{session.totalMarks}</p>
                          </div>
                        </motion.div>
                      ))}
                      {practiceSessions.length === 0 && (
                        <div className="text-center py-12 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                          <p className="text-slate-400 font-black text-base">এখনো কোনো অনুশীলন করা হয়নি</p>
                        </div>
                      )}
                      {practiceSessions.length > 5 && (
                        <button 
                          onClick={() => setActiveSection('progress')}
                          className="w-full py-5 rounded-[1.25rem] border-2 border-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                        >
                          সবগুলো দেখো
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'dashboard' && userRole === 'teacher' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="max-w-7xl mx-auto space-y-10"
            >
              {/* Hero Section */}
              <div className="relative overflow-hidden rounded-[3.5rem] bg-linear-to-br from-indigo-600 via-purple-600 to-pink-500 p-12 text-white shadow-ultra group">
                <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      rotate: [0, 90, 0],
                      x: [0, 50, 0],
                      y: [0, -30, 0]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-xl" 
                  />
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, -45, 0],
                      x: [0, -40, 0],
                      y: [0, 60, 0]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-lg" 
                  />
                </div>
                
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                  <div className="max-w-3xl">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="inline-flex items-center gap-3 px-6 py-2.5 bg-white/30 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-widest mb-8 border border-white/40 shadow-xl"
                    >
                      <Sparkles size={16} className="text-yellow-300 animate-pulse" />
                      পড়ালেখা.প্রো
                    </motion.div>
                    <motion.h2 
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, type: "spring", damping: 15 }}
                      className="text-6xl lg:text-7xl font-black mb-8 tracking-tighter leading-tight"
                    >
                      স্বাগতম, <span className="text-yellow-300 drop-shadow-lg">{settings.teacherName || 'শিক্ষক'}</span> 👋
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2, type: "spring", damping: 15 }}
                      className="text-white text-2xl font-medium leading-relaxed mb-12 max-w-2xl"
                    >
                      আপনার শিক্ষকতা জীবনকে আরও সহজ এবং আনন্দদায়ক করতে আমরা নিয়ে এসেছি আধুনিক এআই প্রযুক্তি। প্রশ্নপত্র তৈরি থেকে শুরু করে শিক্ষার্থীর অগ্রগতি পর্যবেক্ষণ - সবকিছুই এখন আপনার হাতের মুঠোয়।
                    </motion.p>
                    <div className="flex flex-wrap gap-6">
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -5, shadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveSection('generate')}
                        className="bg-white text-indigo-600 px-12 py-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-900/40 flex items-center gap-4 hover:bg-indigo-50 transition-all"
                      >
                        <Plus size={28} strokeWidth={3} />
                        নতুন প্রশ্ন তৈরি
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveSection('ai-assistant')}
                        className="bg-indigo-500/40 backdrop-blur-md text-white border-2 border-white/40 px-12 py-6 rounded-[2rem] font-black text-xl shadow-2xl flex items-center gap-4 hover:bg-indigo-500/50 transition-all"
                      >
                        <MessageSquare size={28} />
                        এআই চ্যাট
                      </motion.button>
                    </div>
                  </div>
                  <div className="hidden lg:block relative">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, rotate: -15 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      transition={{ delay: 0.3, type: "spring", damping: 12 }}
                      className="w-80 h-80 bg-white/10 backdrop-blur-2xl rounded-[5rem] border-2 border-white/20 flex items-center justify-center shadow-2xl relative group/cap"
                    >
                      <div className="absolute inset-8 border-4 border-dashed border-white/20 rounded-[4rem] animate-spin-slow group-hover:border-white/40 transition-colors" />
                      <GraduationCap size={140} className="text-white drop-shadow-2xl group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute -top-6 -right-6 w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center shadow-2xl rotate-12 animate-bounce">
                        <Star size={40} className="text-indigo-900" fill="currentColor" />
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { icon: FileText, value: savedPapers.length, label: 'মোট প্রশ্নপত্র', color: 'text-blue-600', bg: 'bg-blue-50', trend: '+১২% এই মাসে' },
                  { icon: GraduationCap, value: practiceSessions.length, label: 'প্র্যাকটিস সেশন', color: 'text-indigo-600', bg: 'bg-indigo-50', trend: '+৮% এই সপ্তাহে' },
                  { icon: Trophy, value: practiceSessions.filter(s => s.score === s.totalMarks).length, label: 'পূর্ণ নম্বর প্রাপ্ত', color: 'text-emerald-600', bg: 'bg-emerald-50', trend: 'সেরা ফলাফল' }
                ].map((stat, i) => (
                  <motion.div 
                    key={i}
                    whileHover={{ y: -10 }}
                    className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-ultra flex items-center gap-6 group"
                  >
                    <div className={cn("w-20 h-20 rounded-[1.5rem] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500", stat.bg)}>
                      <stat.icon size={36} className={stat.color} />
                    </div>
                    <div>
                      <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{stat.value}</p>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                      <p className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full inline-block">{stat.trend}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">শিক্ষার্থীর সামগ্রিক অগ্রগতি</h3>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      লাইভ আপডেট
                    </div>
                  </div>
                  <div className="glass-card p-10 rounded-[3rem] border-slate-100 shadow-ultra h-[450px]">
                    {practiceSessions.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="dashboardScore" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }}
                            dy={15}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }}
                            dx={-15}
                            domain={[0, 100]}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#fff', 
                              borderRadius: '24px', 
                              border: 'none', 
                              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)',
                              fontWeight: 'bold',
                              padding: '20px'
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#6366f1" 
                            strokeWidth={6}
                            fillOpacity={1} 
                            fill="url(#dashboardScore)" 
                            animationDuration={2500}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-10">
                        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border-2 border-slate-100 shadow-inner">
                          <BarChart3 size={48} className="text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-black text-xl max-w-sm">পর্যাপ্ত ডাটা নেই। শিক্ষার্থীরা প্র্যাকটিস শুরু করলে এখানে চার্ট দেখা যাবে।</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-8">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">সাম্প্রতিক প্র্যাকটিস</h3>
                  <div className="space-y-4">
                    {practiceSessions.slice(0, 5).map((session, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-card p-6 rounded-[2rem] border-slate-100 shadow-sm flex items-center justify-between hover:border-indigo-200 hover:bg-slate-50/50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner">
                            <User size={24} />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-base">{session.studentName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{session.paperName || 'সাধারণ অনুশীলন'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-indigo-600 tracking-tighter">{session.score}/{session.totalMarks}</p>
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{Math.round((session.score / session.totalMarks) * 100)}%</p>
                        </div>
                      </motion.div>
                    ))}
                    {practiceSessions.length === 0 && (
                      <div className="p-12 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 font-black text-base">কোনো প্র্যাকটিস সেশন নেই</p>
                      </div>
                    )}
                    {practiceSessions.length > 5 && (
                      <button 
                        onClick={() => setActiveSection('progress')}
                        className="w-full py-5 rounded-[1.5rem] border-2 border-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                      >
                        সবগুলো দেখো
                      </button>
                    )}
                  </div>

                  <div className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-ultra bg-linear-to-br from-slate-900 to-slate-800 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                    <h4 className="font-black text-base mb-4 flex items-center gap-3 relative z-10">
                      <Sparkles size={20} className="text-yellow-400" />
                      এআই টিপস
                    </h4>
                    <p className="text-sm font-medium text-slate-300 leading-relaxed relative z-10">
                      "সৃজনশীল প্রশ্ন তৈরির সময় বাস্তব জীবনের উদাহরণ ব্যবহার করলে শিক্ষার্থীরা বিষয়টি আরও সহজে বুঝতে পারে। এটি তাদের চিন্তাশক্তি বৃদ্ধিতে সাহায্য করে।"
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Papers Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">সাম্প্রতিক প্রশ্নপত্র</h3>
                  <motion.button 
                    whileHover={{ x: 5 }}
                    onClick={() => setActiveSection('saved')}
                    className="text-indigo-600 font-black text-base hover:underline flex items-center gap-2 group"
                  >
                    সবগুলো দেখুন <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {savedPapers.slice(0, 3).map((paper) => (
                    <motion.div
                      key={paper.id}
                      whileHover={{ y: -10 }}
                      className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-ultra group"
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                          <FileText size={32} />
                        </div>
                        <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {paper.className}
                        </div>
                      </div>
                      <h4 className="text-2xl font-black text-slate-900 mb-2 line-clamp-1 tracking-tight">{paper.examName}</h4>
                      <p className="text-slate-500 font-bold text-sm mb-6">{paper.subject}</p>
                      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock size={16} />
                          <span className="text-xs font-black">{new Date(paper.createdAt).toLocaleDateString('bn-BD')}</span>
                        </div>
                        <button 
                          onClick={() => downloadPaper(paper)}
                          className="p-3 bg-slate-50 text-slate-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          <Download size={20} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {savedPapers.length === 0 && (
                    <div className="col-span-full p-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
                      <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <FilePlus size={48} className="text-slate-200" />
                      </div>
                      <p className="text-slate-400 font-black text-xl">এখনও কোনো প্রশ্নপত্র তৈরি করা হয়নি</p>
                      <button 
                        onClick={() => setActiveSection('generate')}
                        className="mt-6 text-indigo-600 font-black text-lg hover:underline"
                      >
                        প্রথম প্রশ্নপত্র তৈরি করুন
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'generate' && userRole === 'teacher' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="max-w-4xl mx-auto"
            >
              <div className="glass-card p-8 rounded-2xl border-slate-100 shadow-sm mb-10 relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-linear-to-br from-indigo-500/5 to-purple-500/5 rounded-full transition-transform duration-1000 group-hover:scale-110" />
                
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-linear-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                    <FilePlus size={24} strokeWidth={2.5} />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">নতুন প্রশ্ন তৈরি করুন</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">শ্রেণি নির্বাচন করুন</label>
                    <select 
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-sm appearance-none cursor-pointer hover:border-indigo-300"
                    >
                      {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">বিষয় নির্বাচন করুন</label>
                    <select 
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-sm appearance-none cursor-pointer hover:border-indigo-300"
                    >
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2 mb-8">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">অধ্যায় বা টপিকের নাম লিখুন</label>
                  <div className="relative group">
                    <input 
                      type="text"
                      placeholder="যেমন: আমাদের পরিবেশ, গুণিতক ও গুণনীয়ক"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-base pl-12 hover:border-indigo-300"
                    />
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={20} />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                  {[
                    { key: 'MCQ', label: 'MCQ', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                    { key: 'SHORT', label: 'সংক্ষিপ্ত', color: 'bg-purple-50 text-purple-600 border-purple-100' },
                    { key: 'CQ', label: 'সৃজনশীল', color: 'bg-pink-50 text-pink-600 border-pink-100' },
                    { key: 'FILL_BLANKS', label: 'শুন্যস্থান', color: 'bg-blue-50 text-blue-600 border-blue-100' },
                    { key: 'MATCHING', label: 'মিলানো', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
                    { key: 'DESCRIPTIVE', label: 'বর্ণনামূলক', color: 'bg-amber-50 text-amber-600 border-amber-100' },
                    { key: 'MATH', label: 'গণিত (সহজ)', color: 'bg-orange-50 text-orange-600 border-orange-100' }
                  ].map(({ key, label, color }) => (
                    <motion.div 
                      key={key} 
                      whileHover={{ y: -2 }}
                      className="space-y-1.5"
                    >
                      <div className={cn("px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tighter text-center border shadow-xs", color)}>
                        {label}
                      </div>
                      <input 
                        type="number"
                        min="0"
                        max="20"
                        value={counts[key as keyof typeof counts]}
                        onChange={(e) => setCounts({ ...counts, [key]: parseInt(e.target.value) || 0 })}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-center font-black text-slate-700 text-xs focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/5 transition-all outline-none"
                      />
                    </motion.div>
                  ))}
                </div>

                <div className="flex gap-4">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleQuickMath}
                    className="bg-linear-to-r from-orange-500 to-red-600 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg flex items-center gap-2"
                  >
                    <Zap size={18} />
                    কুইক ম্যাথ
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleGenerate}
                    disabled={isGenerating || !topic}
                    className="w-full btn-primary py-4 rounded-xl font-black text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 transition-all shadow-md"
                  >
                  {generatingItemId === 'generate' ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      প্রশ্ন তৈরি হচ্ছে...
                    </>
                  ) : (
                    <>
                      <FilePlus size={20} strokeWidth={3} />
                      প্রশ্ন তৈরি করো
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {generatedQuestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">তৈরিকৃত প্রশ্নসমূহ <span className="text-indigo-600">({generatedQuestions.length})</span></h3>
                    <div className="flex items-center gap-3">
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSelectAll}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all flex items-center gap-2"
                      >
                        {selectedQuestionIds.size === generatedQuestions.length ? <X size={14} /> : <CheckCircle2 size={14} />}
                        {selectedQuestionIds.size === generatedQuestions.length ? 'সবগুলো আনসেলেক্ট করুন' : 'সবগুলো সিলেক্ট করুন'}
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCreatePaper}
                        className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-100"
                      >
                        <CheckCircle2 size={18} />
                        প্রশ্নপত্র তৈরি করুন ({selectedQuestionIds.size})
                      </motion.button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {generatedQuestions.map((q, i) => (
                      <motion.div 
                        key={q.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => toggleQuestionSelection(q.id)}
                        className={cn(
                          "bg-white p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex gap-4 group relative",
                          selectedQuestionIds.has(q.id) 
                            ? "border-indigo-600 bg-indigo-50/30 shadow-sm" 
                            : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200",
                          selectedQuestionIds.has(q.id) 
                            ? "bg-indigo-600 border-indigo-600 text-white scale-105" 
                            : "border-slate-200 bg-white group-hover:border-indigo-300"
                        )}>
                          {selectedQuestionIds.has(q.id) && <CheckCircle2 size={14} strokeWidth={3} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {q.type}
                            </span>
                            <div className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold text-slate-400">মান: {q.marks}</span>
                          </div>
                          <p className="text-slate-900 font-bold text-base leading-relaxed">{q.question}</p>
                          
                          {q.options && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                              {q.options.map((opt, i) => (
                                <div key={i} className="text-xs font-semibold text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
                                  <span className="text-indigo-600 mr-1.5">{String.fromCharCode(97 + i)})</span> {opt}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {q.matchingPairs && (
                            <div className="mt-4 grid grid-cols-1 gap-1.5">
                              {q.matchingPairs.map((pair, i) => (
                                <div key={i} className="grid grid-cols-2 gap-3 text-xs font-semibold">
                                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">{pair.left}</div>
                                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">{pair.right}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <motion.div 
                            initial={false}
                            animate={{ height: selectedQuestionIds.has(q.id) ? 'auto' : 0, opacity: selectedQuestionIds.has(q.id) ? 1 : 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1.5">সঠিক উত্তর:</p>
                              <p className="text-slate-600 font-medium italic bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50 text-sm">{q.answer}</p>
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeSection === 'create-paper' && (
            <motion.div
              key="create-paper"
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -50 }}
              transition={{ duration: 0.6, ease: "circOut" }}
              className="max-w-4xl mx-auto"
            >
              <div className="glass-card p-10 rounded-[2.5rem] border-white/50 shadow-2xl shadow-slate-200/40 mb-12 relative overflow-hidden">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-linear-to-br from-brand-primary/10 to-brand-accent/10 rounded-full" />
                
                <h2 className="text-3xl font-black text-slate-900 mb-10 tracking-tight relative">প্রশ্নপত্রের তথ্য প্রদান করুন</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 relative">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">স্কুলের নাম</label>
                    <input 
                      type="text"
                      value={paperInfo.schoolName}
                      onChange={(e) => setPaperInfo({ ...paperInfo, schoolName: e.target.value })}
                      className="w-full p-5 bg-slate-50/50 backdrop-blur-sm border-2 border-slate-100 rounded-2xl focus:border-brand-primary focus:ring-8 focus:ring-brand-primary/5 outline-none transition-all font-bold text-slate-700"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">পরীক্ষার নাম</label>
                    <input 
                      type="text"
                      placeholder="যেমন: প্রথম সাময়িক পরীক্ষা ২০২৪"
                      value={paperInfo.examName}
                      onChange={(e) => setPaperInfo({ ...paperInfo, examName: e.target.value })}
                      className="w-full p-5 bg-slate-50/50 backdrop-blur-sm border-2 border-slate-100 rounded-2xl focus:border-brand-primary focus:ring-8 focus:ring-brand-primary/5 outline-none transition-all font-bold text-slate-700"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">সময়</label>
                    <input 
                      type="text"
                      value={paperInfo.time}
                      onChange={(e) => setPaperInfo({ ...paperInfo, time: e.target.value })}
                      className="w-full p-5 bg-slate-50/50 backdrop-blur-sm border-2 border-slate-100 rounded-2xl focus:border-brand-primary focus:ring-8 focus:ring-brand-primary/5 outline-none transition-all font-bold text-slate-700"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">পূর্ণমান</label>
                    <input 
                      type="number"
                      value={paperInfo.totalMarks}
                      onChange={(e) => setPaperInfo({ ...paperInfo, totalMarks: parseInt(e.target.value) })}
                      className="w-full p-5 bg-slate-50/50 backdrop-blur-sm border-2 border-slate-100 rounded-2xl focus:border-brand-primary focus:ring-8 focus:ring-brand-primary/5 outline-none transition-all font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-10 flex flex-col sm:flex-row gap-5 relative">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={savePaper}
                    className="flex-1 bg-emerald-500 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3"
                  >
                    <CheckCircle2 size={24} />
                    সংরক্ষণ করুন
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveSection('generate')}
                    className="flex-1 bg-slate-100 text-slate-500 py-5 rounded-2xl font-black text-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3"
                  >
                    <X size={24} />
                    বাতিল করুন
                  </motion.button>
                </div>
              </div>

              {/* Preview */}
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-[850px] mx-auto relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-brand-primary via-brand-accent to-brand-secondary" />
                <div className="text-center mb-12">
                  <h1 className="text-3xl font-black text-slate-900 mb-2">{paperInfo.schoolName || 'স্কুলের নাম'}</h1>
                  <h2 className="text-xl font-bold text-slate-600 mb-6">{paperInfo.examName || 'পরীক্ষার নাম'}</h2>
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 border-y-2 border-slate-900 py-4 font-bold text-slate-800">
                    <span>শ্রেণি: {selectedClass} | বিষয়: {selectedSubject}</span>
                    <span>সময়: {paperInfo.time} | পূর্ণমান: {paperInfo.totalMarks}</span>
                  </div>
                </div>
                
                <div className="space-y-10">
                  {generatedQuestions.filter(q => selectedQuestionIds.has(q.id)).map((q, i) => (
                    <div key={q.id} className="relative">
                      <div className="flex justify-between items-start gap-4">
                        <p className="font-bold text-lg text-slate-900 leading-relaxed flex-1">
                          <span className="text-brand-primary mr-2">{i + 1}.</span> {q.question}
                        </p>
                        <span className="font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-lg text-sm">[{q.marks}]</span>
                      </div>
                      {q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 mt-4 ml-8">
                          {q.options.map((opt, oi) => (
                            <p key={oi} className="text-slate-700 font-medium">
                              <span className="font-black text-brand-primary mr-2">{String.fromCharCode(97 + oi)})</span> {opt}
                            </p>
                          ))}
                        </div>
                      )}
                      {q.matchingPairs && (
                        <div className="mt-6 ml-8 grid grid-cols-1 gap-3">
                          {q.matchingPairs.map((pair, pi) => (
                            <div key={pi} className="grid grid-cols-2 gap-10 border-b border-slate-100 pb-2">
                              <p className="text-slate-700 font-medium">{pair.left}</p>
                              <p className="text-slate-700 font-medium">{pair.right}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeSection === 'ai-assistant' && (
            <motion.div
              key="ai-assistant"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="max-w-4xl mx-auto h-[calc(100vh-180px)] flex flex-col"
            >
              <div className="glass-card rounded-3xl border-slate-100 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-white/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-linear-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">এআই অ্যাসিস্ট্যান্ট</h2>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">পড়ালেখা.প্রো পার্টনার</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">অনলাইন</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-10">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                        <MessageSquare size={32} className="text-slate-300" />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 mb-2 tracking-tight">আমি আপনাকে কীভাবে সাহায্য করতে পারি?</h3>
                      <p className="text-slate-400 text-sm font-medium max-w-xs">প্রশ্ন তৈরি, সিলেবাস বা যেকোনো শিক্ষা বিষয়ক সহায়তার জন্য আমাকে জিজ্ঞাসা করুন।</p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm",
                          msg.role === 'user'
                            ? "bg-indigo-600 text-white rounded-tr-none shadow-indigo-200"
                            : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                        )}
                      >
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 flex gap-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white/80 backdrop-blur-md border-t border-slate-100">
                  <form onSubmit={handleSendMessage} className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="আপনার প্রশ্ন এখানে লিখুন..."
                      className="flex-1 bg-transparent px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none placeholder:text-slate-400"
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      disabled={!chatInput.trim() || isChatLoading}
                      className="bg-linear-to-br from-indigo-600 to-purple-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Send size={18} />
                    </motion.button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'practice' && (
            <motion.div
              key="practice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">প্র্যাকটিস জোন 🎯</h2>
                  <p className="text-slate-500 mt-2 font-bold text-lg">তোমার পছন্দের বিষয় বেছে নাও এবং নিজেকে আরও দক্ষ করে তোলো।</p>
                </div>
                {userRole === 'student' && (
                  <div className="flex gap-4">
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsSelfPracticeMode(!isSelfPracticeMode)}
                      className="bg-linear-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 flex items-center gap-2"
                    >
                      <Plus size={24} />
                      নিজেই প্র্যাকটিস করো
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleQuickMath}
                      className="bg-linear-to-r from-orange-500 to-red-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-orange-200 flex items-center gap-2"
                    >
                      <Zap size={24} />
                      ম্যাথ প্র্যাকটিস
                    </motion.button>
                  </div>
                )}
              </div>

              <AnimatePresence mode="wait">
                {isSelfPracticeMode ? (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="glass-card p-10 rounded-[3rem] border-slate-100 shadow-2xl mb-12 overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">শ্রেণি</label>
                        <select 
                          value={selectedClass}
                          onChange={(e) => setSelectedClass(e.target.value)}
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700"
                        >
                          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">বিষয়</label>
                        <select 
                          value={selectedSubject}
                          onChange={(e) => setSelectedSubject(e.target.value)}
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700"
                        >
                          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">অধ্যায়</label>
                        <input 
                          type="text"
                          placeholder="যেমন: ৩য় অধ্যায়"
                          value={selfPracticeChapter}
                          onChange={(e) => setSelfPracticeChapter(e.target.value)}
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">টপিক</label>
                        <input 
                          type="text"
                          placeholder="যেমন: কোষ বিভাজন"
                          value={selfPracticeTopic}
                          onChange={(e) => setSelfPracticeTopic(e.target.value)}
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700"
                        />
                      </div>
                    </div>

                    <div className="mt-10 space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">প্রশ্নের ধরন নির্বাচন করো</label>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { id: 'COMBINED', label: 'সম্মিলিত (সব)', icon: Sparkles },
                          { id: 'MCQ', label: 'MCQ', icon: ListChecks },
                          { id: 'FILL_BLANKS', label: 'শূন্যস্থান', icon: Type },
                          { id: 'MATCHING', label: 'বাম-দান', icon: Columns2 },
                          { id: 'SHORT', label: 'সংক্ষিপ্ত', icon: FileText },
                          { id: 'DESCRIPTIVE', label: 'বর্ণনামূলক', icon: AlignLeft }
                        ].map((type) => (
                          <motion.button
                            key={type.id}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelfPracticeType(type.id)}
                            className={cn(
                              "px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition-all border-2",
                              selfPracticeType === type.id 
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" 
                                : "bg-white border-slate-100 text-slate-600 hover:border-indigo-200"
                            )}
                          >
                            <type.icon size={18} />
                            {type.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end mt-10">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSelfPractice}
                        disabled={isSelfGenerating || !selfPracticeTopic.trim() || !selfPracticeChapter.trim()}
                        className="bg-linear-to-r from-indigo-600 to-purple-600 text-white px-12 py-5 rounded-2xl font-black text-xl shadow-2xl flex items-center gap-3 disabled:opacity-50"
                      >
                        {isSelfGenerating ? (
                          <>
                            <Loader2 className="animate-spin" /> জেনারেট হচ্ছে...
                          </>
                        ) : (
                          <>
                            <Sparkles /> প্র্যাকটিস শুরু করো
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="text"
                    placeholder="প্রশ্নপত্র খোঁজো..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700 shadow-sm"
                  />
                </div>
                <div className="flex gap-4">
                  <select 
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="p-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700 shadow-sm min-w-[150px]"
                  >
                    <option value="All">সব বিষয়</option>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPapers.map((paper, i) => (
                  <motion.div 
                    key={paper.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.05, 0.5) }}
                    className="glass-card p-6 rounded-3xl border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-500 group"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-linear-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 group-hover:rotate-6 transition-transform">
                        <BookOpen size={24} />
                      </div>
                      <div className="text-right">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-indigo-100">
                          {paper.className} শ্রেণি
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{paper.examName}</h3>
                    <p className="text-slate-500 text-sm font-bold mb-6 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      {paper.subject}
                    </p>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl mb-6 border border-slate-100">
                      <div className="text-center flex-1 border-r border-slate-200">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">প্রশ্ন</p>
                        <p className="text-base font-black text-slate-800">{paper.questions.length}</p>
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">মান</p>
                        <p className="text-base font-black text-slate-800">{paper.totalMarks}</p>
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => startPractice(paper)}
                      className="w-full bg-linear-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                    >
                      প্র্যাকটিস শুরু করো
                      <ArrowRight size={18} />
                    </motion.button>
                  </motion.div>
                ))}
                {savedPapers.length === 0 && (
                  <div className="col-span-full py-20 text-center glass-card rounded-3xl border-slate-100">
                    <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300 border border-slate-100">
                      <GraduationCap size={40} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">কোনো প্রশ্নপত্র পাওয়া যায়নি</h3>
                    <p className="text-slate-400 font-medium">শিক্ষক যখন প্রশ্নপত্র তৈরি করবেন, তখন তুমি এখানে প্র্যাকটিস করতে পারবে।</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'quiz' && activePaper && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto"
            >
              {!practiceResult ? (
                <div className="space-y-8">
                  <div className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-2xl shadow-indigo-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-8 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-indigo-600 via-purple-600 to-pink-500" />
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-1000" />
                    
                    <div className="relative z-10">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-2">{activePaper.examName}</h2>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-indigo-100">
                          {activePaper.subject}
                        </span>
                        <span className="px-3 py-1 bg-purple-50 text-purple-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-purple-100">
                          {activePaper.className} শ্রেণি
                        </span>
                      </div>
                    </div>
                    <div className="relative z-10 flex flex-col gap-3 min-w-[250px]">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">তোমার নাম লিখো</label>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="যেমন: আরিয়ান ইসলাম"
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-base pl-12 hover:border-indigo-300"
                        />
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {activePaper.questions.map((q, i) => (
                      <motion.div 
                        key={q.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-card p-8 rounded-[2rem] border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 relative group"
                      >
                        <div className="absolute top-8 left-0 w-1.5 h-10 bg-indigo-600 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex justify-between items-start gap-6 mb-6">
                          <div className="flex gap-4">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-indigo-600 font-black text-lg border border-slate-100 shadow-inner">
                              {i + 1}
                            </div>
                            <p className="font-bold text-xl text-slate-900 leading-relaxed flex-1 pt-1">
                              {q.question}
                            </p>
                          </div>
                          <span className="font-black text-slate-400 bg-slate-50 px-4 py-1.5 rounded-xl text-xs border border-slate-100">
                            [{q.marks} নম্বর]
                          </span>
                        </div>

                        <div className="ml-14">
                          {q.type === 'MCQ' && q.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {q.options.map((opt, oi) => (
                                <label 
                                  key={oi} 
                                  className={cn(
                                    "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer group/opt",
                                    studentAnswers[q.id] === opt 
                                      ? "bg-indigo-50 border-indigo-600 text-indigo-900 shadow-lg shadow-indigo-100" 
                                      : "bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-slate-50"
                                  )}
                                >
                                  <input 
                                    type="radio" 
                                    name={q.id} 
                                    value={opt}
                                    checked={studentAnswers[q.id] === opt}
                                    onChange={() => setStudentAnswers({ ...studentAnswers, [q.id]: opt })}
                                    className="hidden"
                                  />
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all",
                                    studentAnswers[q.id] === opt 
                                      ? "bg-indigo-600 text-white shadow-lg" 
                                      : "bg-slate-100 text-slate-400 group-hover/opt:bg-indigo-100 group-hover/opt:text-indigo-600"
                                  )}>
                                    {String.fromCharCode(65 + oi)}
                                  </div>
                                  <span className="font-bold text-base">{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {(q.type === 'SHORT' || q.type === 'FILL_BLANKS' || q.type === 'MATH' || q.type === 'DESCRIPTIVE') && (
                            <div className="relative">
                              <textarea 
                                placeholder="তোমার উত্তর এখানে লিখো..."
                                value={studentAnswers[q.id] || ''}
                                onChange={(e) => setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })}
                                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-base min-h-[120px] hover:border-indigo-200"
                              />
                              <div className="absolute bottom-4 right-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                {q.type === 'MATH' ? 'গণিত সমাধান' : 'উত্তরপত্র'}
                              </div>
                            </div>
                          )}

                          {q.type === 'MATCHING' && q.matchingPairs && (
                            <div className="space-y-3">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">সঠিক জোড়াগুলো লিখো (যেমন: ক-২, খ-১)</p>
                              <textarea 
                                placeholder="বাম পাশের সাথে ডান পাশের মিল করো..."
                                value={studentAnswers[q.id] || ''}
                                onChange={(e) => setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })}
                                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-base min-h-[120px] hover:border-indigo-200"
                              />
                            </div>
                          )}

                          {q.type === 'CQ' && (
                            <div className="space-y-4">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">ক, খ, গ, ঘ অংশের উত্তর দাও</p>
                              <textarea 
                                placeholder="সৃজনশীল প্রশ্নের উত্তর এখানে লিখো..."
                                value={studentAnswers[q.id] || ''}
                                onChange={(e) => setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })}
                                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-700 text-base min-h-[250px] hover:border-indigo-200"
                              />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-6 pt-10 border-t border-slate-200">
                    <button 
                      onClick={resetPractice}
                      className="px-8 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <ArrowLeft size={20} />
                      ফিরে যাও
                    </button>
                    <motion.button 
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={submitPractice}
                      className="bg-linear-to-r from-emerald-600 to-teal-600 text-white px-12 py-5 rounded-2xl font-black text-xl shadow-2xl shadow-emerald-200 flex items-center gap-3 transition-all"
                    >
                      <CheckCircle2 size={24} strokeWidth={3} />
                      উত্তরপত্র জমা দাও
                    </motion.button>
                  </div>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card p-12 rounded-[3rem] border-slate-100 shadow-2xl text-center relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-3 bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500" />
                  <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
                  
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                    className="w-32 h-32 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-inner border-4 border-white"
                  >
                    <Trophy size={64} className="text-emerald-600 drop-shadow-lg" />
                  </motion.div>

                  <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">অভিনন্দন, {studentName}!</h2>
                  <p className="text-slate-500 font-bold text-xl mb-12">তুমি সফলভাবে প্র্যাকটিস সম্পন্ন করেছো।</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">তোমার প্রাপ্ত নম্বর</p>
                      <p className="text-5xl font-black text-indigo-600 tracking-tighter">
                        {practiceResult.score} <span className="text-2xl text-slate-300">/ {practiceResult.total}</span>
                      </p>
                    </div>
                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">সাফল্যের হার</p>
                      <p className="text-5xl font-black text-emerald-600 tracking-tighter">
                        {Math.round((practiceResult.score / practiceResult.total) * 100)}%
                      </p>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden mb-12 border border-slate-200">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(practiceResult.score / practiceResult.total) * 100}%` }}
                      transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                      className="h-full bg-linear-to-r from-emerald-500 to-teal-500 shadow-lg"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                    <motion.button 
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={resetPractice}
                      className="w-full sm:w-auto bg-linear-to-r from-indigo-600 to-purple-600 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={20} />
                      আবার চেষ্টা করো
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveSection('progress')}
                      className="w-full sm:w-auto bg-white text-slate-700 border-2 border-slate-200 px-10 py-4 rounded-2xl font-black text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <BarChart3 size={20} />
                      অগ্রগতি দেখো
                    </motion.button>
                  </div>

                  <div className="text-left space-y-6">
                    <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-600" />
                      উত্তরপত্র পর্যালোচনা
                    </h3>
                    {activePaper.questions.map((q, i) => (
                      <div key={q.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 relative overflow-hidden">
                        <div className={cn(
                          "absolute top-0 left-0 w-2 h-full",
                          practiceResult.results[q.id] ? "bg-emerald-500" : "bg-red-500"
                        )} />
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <p className="font-bold text-lg text-slate-800">
                            <span className="text-slate-400 mr-2">{i + 1}.</span>
                            {q.question}
                          </p>
                          {practiceResult.results[q.id] ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-black text-xs uppercase tracking-widest">
                              <CheckCircle2 size={16} /> সঠিক
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 font-black text-xs uppercase tracking-widest">
                              <X size={16} /> ভুল
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-3 ml-6">
                          <div className="p-3 bg-white rounded-xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">তোমার উত্তর</p>
                            <p className="text-slate-700 font-bold">{studentAnswers[q.id] || 'উত্তর দেওয়া হয়নি'}</p>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">সঠিক উত্তর</p>
                            <p className="text-emerald-900 font-bold">{q.answer}</p>
                          </div>
                          {q.explanation && (
                            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">ব্যাখ্যা</p>
                              <p className="text-indigo-900 font-bold italic text-sm">{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeSection === 'progress' && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">তোমার অগ্রগতির চিত্র</h2>
                  <p className="text-slate-500 mt-2 font-bold text-lg">প্রতিদিনের প্র্যাকটিস তোমাকে আরও দক্ষ করে তুলবে।</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                      <Trophy size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">গড় নম্বর</p>
                      <p className="text-2xl font-black text-slate-900">
                        {practiceStats.averageScore}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-10">
                  <div className="glass-card p-10 rounded-[2.5rem] border-slate-100 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                      <BarChart3 size={24} className="text-indigo-600" />
                      পারফরম্যান্স ট্রেন্ড
                    </h3>
                    <div className="h-[400px]">
                      {practiceSessions.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                              dy={15}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                              dx={-15}
                              domain={[0, 100]}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                borderRadius: '20px', 
                                border: 'none', 
                                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                                fontWeight: 'bold',
                                padding: '15px'
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#6366f1" 
                              strokeWidth={5}
                              fillOpacity={1} 
                              fill="url(#colorScore)" 
                              animationDuration={2500}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-10">
                          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 text-slate-200 border border-slate-100">
                            <BarChart3 size={48} />
                          </div>
                          <p className="text-slate-400 font-black text-lg">এখনও কোনো প্র্যাকটিস ডাটা নেই।</p>
                        </div>
                      )}
                    </div>
                  </div>

                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                        <Clock size={24} className="text-purple-600" />
                        প্র্যাকটিস হিস্ট্রি
                      </h3>
                      {practiceSessions.length > 0 && (
                        <button 
                          onClick={() => {
                            if (window.confirm('আপনি কি নিশ্চিত যে আপনি সব হিস্ট্রি মুছে ফেলতে চান?')) {
                              setPracticeSessions([]);
                              localStorage.removeItem('teaching_assistant_sessions');
                            }
                          }}
                          className="text-xs font-black text-red-500 hover:text-red-600 flex items-center gap-1 uppercase tracking-widest"
                        >
                          <Trash2 size={14} />
                          সব মুছুন
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      {practiceSessions.map((session, i) => (
                        <motion.div 
                          key={session.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.05, 0.5) }}
                          onClick={() => setViewingSession(session)}
                          className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all group cursor-pointer"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                              <History size={24} />
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{session.paperName}</p>
                              <p className="text-sm text-slate-500 font-bold">{new Date(session.date).toLocaleDateString('bn-BD')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-slate-900 tracking-tight">
                              {session.score} <span className="text-sm text-slate-300">/ {session.totalMarks}</span>
                            </p>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">সাফল্য: {Math.round((session.score / session.totalMarks) * 100)}%</p>
                          </div>
                        </motion.div>
                      ))}
                      {practiceSessions.length === 0 && (
                        <p className="text-center py-10 text-slate-400 font-bold">কোনো হিস্ট্রি পাওয়া যায়নি।</p>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {viewingSession && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                      >
                        <motion.div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] shadow-2xl flex flex-col">
                          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white/50">
                            <div>
                              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{viewingSession.paperName}</h3>
                              <p className="text-slate-500 font-bold">{new Date(viewingSession.date).toLocaleDateString('bn-BD')}</p>
                            </div>
                            <button 
                              onClick={() => setViewingSession(null)}
                              className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all"
                            >
                              <X size={24} />
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                              <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 text-center">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">প্রাপ্ত নম্বর</p>
                                <p className="text-3xl font-black text-indigo-600">{viewingSession.score} / {viewingSession.totalMarks}</p>
                              </div>
                              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">সাফল্যের হার</p>
                                <p className="text-3xl font-black text-emerald-600">{Math.round((viewingSession.score / viewingSession.totalMarks) * 100)}%</p>
                              </div>
                              <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100 text-center">
                                <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">শিক্ষার্থী</p>
                                <p className="text-3xl font-black text-purple-600 truncate">{viewingSession.studentName}</p>
                              </div>
                            </div>

                            <div className="space-y-6">
                              {savedPapers.find(p => p.id === viewingSession.paperId)?.questions.map((q, i) => (
                                <div key={q.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 relative overflow-hidden">
                                  <div className={cn(
                                    "absolute top-0 left-0 w-2 h-full",
                                    viewingSession.results[q.id] ? "bg-emerald-500" : "bg-red-500"
                                  )} />
                                  <div className="flex justify-between items-start gap-4 mb-4">
                                    <p className="font-bold text-lg text-slate-800">
                                      <span className="text-slate-400 mr-2">{i + 1}.</span>
                                      {q.question}
                                    </p>
                                    {viewingSession.results[q.id] ? (
                                      <span className="flex items-center gap-1 text-emerald-600 font-black text-xs uppercase tracking-widest">
                                        <CheckCircle2 size={16} /> সঠিক
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-red-600 font-black text-xs uppercase tracking-widest">
                                        <X size={16} /> ভুল
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-3 ml-6">
                                    <div className="p-3 bg-white rounded-xl border border-slate-100">
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">তোমার উত্তর</p>
                                      <p className="text-slate-700 font-bold">{viewingSession.answers[q.id] || 'উত্তর দেওয়া হয়নি'}</p>
                                    </div>
                                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">সঠিক উত্তর</p>
                                      <p className="text-emerald-900 font-bold">{q.answer}</p>
                                    </div>
                                    {q.explanation && (
                                      <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">ব্যাখ্যা</p>
                                        <p className="text-indigo-900 font-bold italic text-sm">{q.explanation}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                <div className="space-y-8">
                  <div className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-sm bg-linear-to-br from-indigo-600 to-purple-700 text-white relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                    <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                      <Trophy size={24} className="text-yellow-300" />
                      অ্যাচিভমেন্টস
                    </h3>
                    <div className="space-y-6">
                      {[
                        { label: 'প্রথম প্র্যাকটিস', icon: Sparkles, achieved: practiceSessions.length >= 1 },
                        { label: '৫টি সেশন সম্পন্ন', icon: Target, achieved: practiceSessions.length >= 5 },
                        { label: '১০০% স্কোর', icon: Star, achieved: practiceSessions.some(s => s.score === s.totalMarks) },
                        { label: 'টপ পারফর্মার', icon: Zap, achieved: practiceSessions.length >= 10 }
                      ].map((achievement, i) => (
                        <div key={i} className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border transition-all",
                          achievement.achieved ? "bg-white/20 border-white/30" : "bg-black/10 border-white/5 opacity-40"
                        )}>
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
                            achievement.achieved ? "bg-yellow-400 text-indigo-900" : "bg-slate-700 text-slate-400"
                          )}>
                            <achievement.icon size={20} />
                          </div>
                          <span className="font-black text-sm tracking-tight">{achievement.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card p-8 rounded-[2.5rem] border-slate-100 shadow-sm text-center">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-xl">
                      <GraduationCap size={40} className="text-indigo-600" />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 mb-2">শিখতে থাকো!</h4>
                    <p className="text-sm text-slate-500 font-bold leading-relaxed">
                      "শিক্ষা হলো অন্ধকারের মাঝে আলোর মশাল।" নিয়মিত প্র্যাকটিস করো এবং নিজের লক্ষ্য অর্জন করো।
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeSection === 'saved' && userRole === 'teacher' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">সংরক্ষিত প্রশ্নপত্রসমূহ</h2>
                  <p className="text-slate-500 mt-1.5 font-medium text-base">আপনার তৈরি করা সব প্রশ্নপত্র এখানে খুঁজে পাবেন।</p>
                </div>
                <div className="flex glass-card p-1 rounded-xl border-slate-100 shadow-sm">
                  <div className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md shadow-indigo-500/20">Grid View</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {savedPapers.map((paper, i) => (
                  <motion.div 
                    key={paper.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.5 }}
                    whileHover={{ y: -6 }}
                    className="glass-card p-6 rounded-2xl border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-500 group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-linear-to-br from-indigo-500/10 to-purple-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700 blur-xl" />
                    
                    <div className="flex justify-between items-start mb-6 relative">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner border border-slate-100">
                        <FileText size={24} />
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(paper.createdAt).toLocaleDateString('bn-BD')}</p>
                        <div className="mt-2 inline-flex px-3 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded-full uppercase tracking-tighter border border-emerald-100">
                          মান: {paper.totalMarks}
                        </div>
                      </div>
                    </div>

                    <div className="mb-8">
                      <h3 className="text-xl font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors mb-2 tracking-tight">{paper.examName}</h3>
                      <div className="flex items-center gap-2 text-slate-500 font-bold text-xs mb-4">
                        <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center">
                          <User size={10} className="text-slate-400" />
                        </div>
                        <span className="truncate max-w-[180px]">{paper.schoolName}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-lg uppercase tracking-widest border border-indigo-100">{paper.className} শ্রেণি</span>
                        <span className="px-3 py-1 bg-purple-50 text-purple-600 text-[9px] font-black rounded-lg uppercase tracking-widest border border-purple-100">{paper.subject}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 relative">
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => downloadPaper(paper)}
                        className="flex items-center justify-center gap-2 py-3 bg-slate-50 hover:bg-indigo-600 hover:text-white text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-slate-100"
                      >
                        <Download size={14} />
                        ডাউনলোড
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => deletePaper(paper.id)}
                        className="flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-500 hover:text-white text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-red-100"
                      >
                        <Trash2 size={14} />
                        মুছুন
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
                {savedPapers.length === 0 && (
                  <div className="col-span-full py-20 text-center glass-card rounded-3xl border-slate-100">
                    <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300 border border-slate-100">
                      <FileText size={40} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">কোনো প্রশ্নপত্র পাওয়া যায়নি</h3>
                    <p className="text-slate-400 font-medium">নতুন প্রশ্নপত্র তৈরি করলে তা এখানে দেখতে পাবেন।</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl mx-auto"
            >
              <div className="glass-card p-8 rounded-3xl border-slate-100 shadow-sm">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 bg-linear-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <SettingsIcon size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">অ্যাপ সেটিংস</h2>
                    <p className="text-slate-500 font-medium text-sm">আপনার প্রোফাইল ও অ্যাপের পছন্দসমূহ নিয়ন্ত্রণ করুন।</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ডিফল্ট স্কুলের নাম</label>
                      <div className="relative group">
                        <input 
                          type="text"
                          value={settings.defaultSchoolName}
                          onChange={(e) => setSettings({ ...settings, defaultSchoolName: e.target.value })}
                          placeholder="আপনার স্কুলের নাম লিখুন"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">শিক্ষকের নাম</label>
                      <div className="relative group">
                        <input 
                          type="text"
                          value={settings.teacherName}
                          onChange={(e) => setSettings({ ...settings, teacherName: e.target.value })}
                          placeholder="আপনার নাম লিখুন"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-inner">
                        <Cloud size={20} />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        সুপাবেস (Supabase) ব্যাকএন্ড সিঙ্ক
                      </h3>
                    </div>
                    
                    {!supabase ? (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-xs font-bold leading-relaxed flex items-start gap-3">
                        <div className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center shrink-0 text-[10px]">!</div>
                        <p>সুপাবেস কনফিগারেশন পাওয়া যায়নি। দয়া করে <strong>VITE_SUPABASE_URL</strong> এবং <strong>VITE_SUPABASE_ANON_KEY</strong> এনভায়রনমেন্ট ভেরিয়েবল সেট করুন।</p>
                      </div>
                    ) : !user ? (
                      <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                            <User size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900 text-sm">লগইন প্রয়োজন</h4>
                            <p className="text-[10px] font-bold text-slate-400">আপনার ডাটা অনলাইনে সেভ করতে লগইন করুন।</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <input 
                            type="email"
                            placeholder="ইমেইল"
                            value={authEmail}
                            onChange={(e) => setAuthEmail(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-800 text-sm"
                          />
                          <input 
                            type="password"
                            placeholder="পাসওয়ার্ড"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-800 text-sm"
                          />
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <motion.button 
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleSignIn}
                              disabled={isAuthLoading}
                              className="btn-primary py-2.5 rounded-xl text-xs disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isAuthLoading ? <RefreshCw className="animate-spin" size={14} /> : <LogIn size={14} />}
                              লগইন
                            </motion.button>
                            <motion.button 
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleSignUp}
                              disabled={isAuthLoading}
                              className="bg-white text-slate-900 border border-slate-200 py-2.5 rounded-xl font-black text-xs shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isAuthLoading ? <RefreshCw className="animate-spin" size={14} /> : <User size={14} />}
                              সাইন আপ
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                              <User size={24} />
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">লগইন করা আছে</p>
                              <h4 className="text-base font-black text-slate-900">{user.email}</h4>
                            </div>
                          </div>
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSignOut}
                            className="px-6 py-2.5 bg-white text-red-500 border border-red-100 rounded-xl font-black text-xs hover:bg-red-500 hover:text-white transition-all shadow-sm"
                          >
                            লগ আউট
                          </motion.button>
                        </div>
                        
                        <motion.button 
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={syncToSupabase}
                          disabled={isSyncing}
                          className="w-full btn-primary py-4 rounded-xl font-black text-base flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          {isSyncing ? (
                            <RefreshCw className="animate-spin" size={20} />
                          ) : (
                            <RefreshCw size={20} />
                          )}
                          সুপাবেস-এর সাথে সিঙ্ক করুন
                        </motion.button>
                      </div>
                    )}

                    <div className="mt-8 flex items-center justify-between p-5 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="font-black text-emerald-900 text-sm">অটো-সেভ সক্রিয়</p>
                          <p className="text-[10px] font-bold text-emerald-700">আপনার সব ডাটা ব্রাউজারে সেভ হচ্ছে।</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={cn(
                "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 rounded-2xl font-black text-sm shadow-2xl flex items-center gap-3 border backdrop-blur-md",
                toast.type === 'success' ? "bg-emerald-600/90 text-white border-emerald-400/50" :
                toast.type === 'error' ? "bg-red-600/90 text-white border-red-400/50" :
                "bg-indigo-600/90 text-white border-indigo-400/50"
              )}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
               toast.type === 'error' ? <AlertCircle size={20} /> : <Info size={20} />}
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
