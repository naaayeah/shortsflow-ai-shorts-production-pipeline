'use client';

import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Play, 
  FileText, 
  Image as ImageIcon, 
  Subtitles, 
  Download, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  Copy,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef } from 'react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });

interface Scene {
  sceneNumber: number;
  script: string;
  imagePrompt: string;
}

interface PipelineResult {
  script: string[];
  scenes: Scene[];
  srt: string;
  srtFileName: string;
}

export default function ShortsPipeline() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<number>(0); // 0: idle, 1: script, 2: scenes, 3: srt
  const [scriptLines, setScriptLines] = useState<string[]>([]);
  const [isScriptEditing, setIsScriptEditing] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focusIndex !== null) {
      const inputs = document.querySelectorAll('input[data-script-input]');
      const target = inputs[focusIndex] as HTMLInputElement;
      if (target) {
        target.focus();
        target.setSelectionRange(0, 0);
      }
      setFocusIndex(null);
    }
  }, [focusIndex, scriptLines]);

  const generateScript = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setScriptLines([]);
    setIsScriptEditing(false);
    
    try {
      // STEP 1: Script Generation
      setStep(1);
      const scriptResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: `Convert the following SOURCE CONTENT into a YouTube Shorts storytelling script.
        
        SOURCE CONTENT:
        ${input}

        [영상 스타일]
        - length: 25~35 seconds
        - 1 sentence = 1 subtitle line
        - short rhythmic sentences
        - immersive storytelling

        [말투 규칙]
        - community storytelling tone
        - avoid formal news tone
        - use casual storytelling style
        - avoid "~했습니다"

        [서술 방식]
        - preferably first-person perspective
        - emotional reactions allowed (Examples: 소름 돋음, 멘붕 옴, 오열함)

        [구조]
        1 Hook (Title-style, noun style, no punctuation, single line)
        2 Situation
        3 Story development
        4 Twist
        5 Ending + question 

        Return ONLY the script lines, one per line.`,
      });

      const scriptText = scriptResponse.text;
      if (!scriptText) throw new Error("Failed to generate script.");
      const lines = scriptText.split('\n').filter(line => line.trim() !== '');
      setScriptLines(lines);
      setIsScriptEditing(true);
      setStep(0); // Reset step for next phase
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during script generation.");
    } finally {
      setLoading(false);
    }
  };

  const generateAssets = async () => {
    if (scriptLines.length === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const hook = scriptLines[0] || "Untitled Shorts";

      // STEP 2: Scene Generation
      setStep(2);
      const scenesResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: `1️⃣ Split the following script into 5-8 scenes based on story flow (each scene 3-5s).
        2️⃣ Generate a concise, word-focused image prompt for each scene in English.
        
        SCRIPT:
        ${scriptLines.join('\n')}

        [Prompt Structure]
        Include: subject, action, environment, lighting, mood, camera.
        Example: dark bedroom, east asian man sleeping in bed, white cat jumping on man's face, smoke in air, cute animation style, korean webtoon style, dramatic lighting, close-up shot

        [Style Rules (MANDATORY)]
        - cute animation style
        - korean webtoon style
        - high detail
        - East Asian characters
        - Expressive facial emotions
        - Consistent character design (Describe the character's fixed appearance in EVERY prompt)
        - Dramatic and tense scenes
        - Strong visual impact for Shorts

        [Negative Constraints (STRICTLY FORBIDDEN)]
        - NO text (Korean/English)
        - NO speech bubbles
        - NO subtitles
        - NO UI elements
        - NO logos/watermarks
        - NO writing inside the image
        The image must be a PURE illustration of the scene and characters.

        Return the result as a JSON array of objects with:
        - sceneNumber (number)
        - script (string, the part of the script for this scene)
        - imagePrompt (string)
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.NUMBER },
                script: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
              },
              required: ["sceneNumber", "script", "imagePrompt"]
            }
          }
        }
      });

      const scenesText = scenesResponse.text;
      if (!scenesText) throw new Error("Failed to generate scenes.");
      const scenes: Scene[] = JSON.parse(scenesText);

      // STEP 3: SRT Generation
      setStep(3);
      const today = new Date().toISOString().split('T')[0];
      
      // We'll ask Gemini to generate the SRT based on the rules
      const srtResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: `Generate an SRT subtitle file from the following script.
        
        SCRIPT:
        ${scriptLines.join('\n')}

        Rules:
        - 1 sentence = 1 subtitle line
        - no line breaks
        - do not modify the script

        Timing rules (0.5s shorter than standard):
        - Short sentence (1–6 chars): 0.3–0.5 sec
        - Normal sentence (7–12 chars): 0.7–1.1 sec
        - Long sentence (13–20 chars): 1.1–1.5 sec
        - Very long sentence (21+ chars): 1.5–2.0 sec
        - Hook (first line): about 1.5 sec
        - Last question: 1.7–2.3 sec

        Return ONLY the SRT content.`,
      });

      const srtText = srtResponse.text;
      if (!srtText) throw new Error("Failed to generate SRT.");

      // Generate filename
      const titleSlug = hook
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(' ')
        .slice(0, 5)
        .join('_')
        .toLowerCase() || 'shorts_content';
      
      const srtFileName = `${today}_${titleSlug}.srt`;

      setResult({
        script: scriptLines,
        scenes,
        srt: srtText,
        srtFileName
      });
      setIsScriptEditing(false);
      setStep(4); // Finished
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during asset generation.");
    } finally {
      setLoading(false);
    }
  };

  const handleScriptLineChange = (index: number, value: string) => {
    const newLines = [...scriptLines];
    newLines[index] = value;
    setScriptLines(newLines);
  };

  const addScriptLine = (index: number) => {
    const newLines = [...scriptLines];
    newLines.splice(index + 1, 0, '');
    setScriptLines(newLines);
  };

  const removeScriptLine = (index: number) => {
    if (scriptLines.length <= 1) return;
    const newLines = [...scriptLines];
    newLines.splice(index, 1);
    setScriptLines(newLines);
  };

  const moveLine = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === scriptLines.length - 1) return;
    
    const newLines = [...scriptLines];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newLines[index], newLines[targetIndex]] = [newLines[targetIndex], newLines[index]];
    setScriptLines(newLines);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.currentTarget;
      const selectionStart = input.selectionStart || 0;
      const currentLine = scriptLines[index];
      const before = currentLine.slice(0, selectionStart);
      const after = currentLine.slice(selectionStart);
      
      const newLines = [...scriptLines];
      newLines[index] = before;
      newLines.splice(index + 1, 0, after);
      setScriptLines(newLines);
      setFocusIndex(index + 1);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadSRT = () => {
    if (!result) return;
    const blob = new Blob([result.srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.srtFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [activeTab, setActiveTab] = useState<'visual' | 'raw'>('visual');

  const getFullPackageText = () => {
    if (!result) return '';
    let text = `SECTION 1\nSHORTS SCRIPT\n\n${result.script.join('\n')}\n\n`;
    text += `------------------------------------------------\n\n`;
    text += `SECTION 2\nIMAGE PROMPTS\n\n`;
    result.scenes.forEach(scene => {
      text += `Scene ${scene.sceneNumber}\n`;
      text += `Script\n${scene.script}\n\n`;
      text += `Image prompt\n${scene.imagePrompt}\n\n`;
    });
    text += `------------------------------------------------\n\n`;
    text += `SECTION 3\nSRT FILE\n\n${result.srt}\n\n`;
    text += `------------------------------------------------`;
    return text;
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-current" />
              </div>
              <span className="text-xs font-mono font-bold tracking-widest uppercase opacity-50">Production Pipeline</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">ShortsFlow</h1>
          </div>
          <p className="text-sm text-[#666] max-w-xs font-medium">
            Professional YouTube Shorts content production pipeline.
          </p>
        </header>

        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#eee] p-6 mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#999] mb-3">Source Content</label>
          <textarea
            className="w-full h-40 p-4 bg-[#fcfcfc] border border-[#eee] rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all resize-none text-lg leading-relaxed"
            placeholder="Paste community post or text here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={generateScript}
              disabled={loading || !input.trim()}
              className={`
                flex items-center gap-2 px-8 py-4 rounded-full font-bold transition-all
                ${loading || !input.trim() 
                  ? 'bg-[#eee] text-[#aaa] cursor-not-allowed' 
                  : 'bg-black text-white hover:scale-105 active:scale-95 shadow-lg shadow-black/10'}
              `}
            >
              {loading && step === 1 ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              {loading && step === 1 ? 'Generating Script...' : 'Generate Script'}
            </button>
          </div>
        </section>

        {/* Script Editing Section */}
        <AnimatePresence>
          {isScriptEditing && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-sm border border-[#eee] p-6 mb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    <FileText className="w-6 h-6" />
                    Edit Script
                  </h2>
                  <button 
                    onClick={() => copyToClipboard(scriptLines.join('\n'))}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#eee] rounded-lg transition-colors text-xs font-bold text-[#666]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Script
                  </button>
                </div>
                <span className="text-xs font-bold text-[#999] uppercase tracking-widest">Stage 1 Complete</span>
              </div>
              <div className="space-y-3 mb-6">
                {scriptLines.map((line, index) => (
                  <div key={index} className="flex gap-3 items-center group">
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveLine(index, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:bg-[#eee] rounded text-[#999] disabled:opacity-20"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => moveLine(index, 'down')}
                        disabled={index === scriptLines.length - 1}
                        className="p-1 hover:bg-[#eee] rounded text-[#999] disabled:opacity-20"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-xs font-mono text-[#ccc] w-4 text-right">{index + 1}</span>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        data-script-input
                        value={line}
                        onChange={(e) => handleScriptLineChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={`w-full p-3 bg-[#fcfcfc] border border-[#eee] rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all ${index === 0 ? 'font-bold' : ''}`}
                      />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => addScriptLine(index)}
                        className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                        title="Add line below"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeScriptLine(index)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                        disabled={scriptLines.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={generateAssets}
                  disabled={loading}
                  className={`
                    flex items-center gap-2 px-8 py-4 rounded-full font-bold transition-all
                    ${loading 
                      ? 'bg-[#eee] text-[#aaa] cursor-not-allowed' 
                      : 'bg-black text-white hover:scale-105 active:scale-95 shadow-lg shadow-black/10'}
                  `}
                >
                  {loading && step > 1 ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {loading && step > 1 ? 'Converting to Assets...' : 'Convert to Assets (변환)'}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Progress Tracker */}
        {loading && (
          <div className="mb-8 grid grid-cols-3 gap-4">
            {[
              { id: 1, label: 'Scripting', icon: FileText },
              { id: 2, label: 'Scenes', icon: ImageIcon },
              { id: 3, label: 'Subtitles', icon: Subtitles },
            ].map((s) => (
              <div 
                key={s.id}
                className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
                  step === s.id ? 'bg-black text-white border-black' : 
                  step > s.id ? 'bg-green-50 text-green-700 border-green-200' : 
                  'bg-white text-[#999] border-[#eee]'
                }`}
              >
                {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className={`w-5 h-5 ${step === s.id ? 'animate-pulse' : ''}`} />}
                <span className="text-sm font-bold">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 pb-20"
            >
              {/* Tabs */}
              <div className="flex border-b border-[#eee]">
                <button 
                  onClick={() => setActiveTab('visual')}
                  className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'visual' ? 'border-black text-black' : 'border-transparent text-[#999]'}`}
                >
                  Visual Pipeline
                </button>
                <button 
                  onClick={() => setActiveTab('raw')}
                  className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'raw' ? 'border-black text-black' : 'border-transparent text-[#999]'}`}
                >
                  Full Package (Raw)
                </button>
              </div>

              {activeTab === 'visual' ? (
                <div className="space-y-12">
                  {/* Section 1: Script */}
                  <section id="section-1">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#eee] rounded-lg flex items-center justify-center text-sm">01</span>
                        SHORTS SCRIPT
                      </h2>
                      <button 
                        onClick={() => copyToClipboard(result.script.join('\n'))}
                        className="p-2 hover:bg-[#eee] rounded-lg transition-colors text-[#666]"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="bg-white rounded-2xl border border-[#eee] p-8 font-serif italic text-xl leading-relaxed space-y-4 shadow-sm">
                      {result.script.map((line, i) => (
                        <p key={i} className={i === 0 ? "font-bold not-italic text-2xl mb-6 text-black" : "text-[#444]"}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </section>

                  {/* Section 2: Scene Prompts */}
                  <section id="section-2">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#eee] rounded-lg flex items-center justify-center text-sm">02</span>
                        IMAGE PROMPTS
                      </h2>
                      <button 
                        onClick={() => copyToClipboard(result.scenes.map(s => s.imagePrompt).join('\n\n'))}
                        className="flex items-center gap-2 px-4 py-2 bg-[#eee] text-black rounded-lg font-bold text-xs hover:bg-[#e0e0e0] transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy All Image Prompts
                      </button>
                    </div>
                    <div className="grid gap-6">
                      {result.scenes.map((scene, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-[#eee] overflow-hidden shadow-sm">
                          <div className="bg-[#fafafa] px-6 py-3 border-bottom border-[#eee] flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#999]">Scene {scene.sceneNumber}</span>
                            <button 
                              onClick={() => copyToClipboard(scene.imagePrompt)}
                              className="p-1.5 hover:bg-[#eee] rounded-md transition-colors text-[#999] hover:text-black"
                              title="Copy individual prompt"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="p-6 space-y-6">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#bbb] block mb-1">Script</label>
                              <p className="text-lg font-medium">{scene.script}</p>
                            </div>
                            <div className="p-4 bg-[#f8f9fa] rounded-xl border border-[#eee]">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#bbb] block mb-2">Image Prompt</label>
                              <p className="text-sm text-[#555] leading-relaxed">{scene.imagePrompt}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Section 3: SRT */}
                  <section id="section-3">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#eee] rounded-lg flex items-center justify-center text-sm">03</span>
                        SRT FILE
                      </h2>
                      <button 
                        onClick={downloadSRT}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-bold text-sm hover:scale-105 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        Download SRT
                      </button>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-2xl p-6 font-mono text-sm text-[#aaa] overflow-x-auto max-h-96 shadow-xl">
                      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                        <span className="text-white/50">{result.srtFileName}</span>
                        <button 
                          onClick={() => copyToClipboard(result.srt)}
                          className="text-white/30 hover:text-white transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap leading-relaxed">
                        {result.srt}
                      </pre>
                    </div>
                  </section>
                </div>
              ) : (
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">FULL PRODUCTION PACKAGE</h2>
                    <button 
                      onClick={() => copyToClipboard(getFullPackageText())}
                      className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-bold text-sm hover:scale-105 transition-all"
                    >
                      <Copy className="w-4 h-4" />
                      Copy All
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#eee] p-8 font-mono text-sm leading-relaxed shadow-sm overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-[#444]">
                      {getFullPackageText()}
                    </pre>
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>


        {/* Empty State */}
        {!result && !loading && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-[#eee] rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-[#aaa]" />
            </div>
            <h3 className="text-xl font-bold mb-2">Ready to produce?</h3>
            <p className="text-[#999] max-w-sm mx-auto">
              Enter your source content above to generate a full YouTube Shorts production package.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
