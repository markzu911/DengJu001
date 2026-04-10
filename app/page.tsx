'use client';

import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Sparkles, RefreshCw, Download, Info, X, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';

export default function Page() {
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [roomImagePreview, setRoomImagePreview] = useState<string | null>(null);
  
  const [lampImage, setLampImage] = useState<File | null>(null);
  const [lampImagePreview, setLampImagePreview] = useState<string | null>(null);

  const [lightingState, setLightingState] = useState<'on' | 'off'>('on');
  const [timeOfDay, setTimeOfDay] = useState<'daytime' | 'nighttime'>('daytime');
  const [notes, setNotes] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roomInputRef = useRef<HTMLInputElement>(null);
  const lampInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'room' | 'lamp') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'room') {
        setRoomImage(file);
        setRoomImagePreview(reader.result as string);
      } else {
        setLampImage(file);
        setLampImagePreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (type: 'room' | 'lamp') => {
    if (type === 'room') {
      setRoomImage(null);
      setRoomImagePreview(null);
      if (roomInputRef.current) roomInputRef.current.value = '';
    } else {
      setLampImage(null);
      setLampImagePreview(null);
      if (lampInputRef.current) lampInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const generatePreview = async () => {
    if (!roomImage || !lampImage) {
      setError('Please upload both a room photo and a lamp photo.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

      setLoadingStep('Analyzing lamp details...');
      const lampBase64 = await fileToBase64(lampImage);
      
      const analysisResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: lampBase64,
                mimeType: lampImage.type,
              }
            },
            {
              text: "Describe this lighting product in extreme detail. Focus on its shape, color, material, texture, design style, and any unique features. Also, explicitly state what type of lamp it is (e.g., pendant, floor, table, wall). This description will be used to recreate the lamp in another image, so be as precise as possible. Do not describe the background, only the lamp itself."
            }
          ]
        }
      });

      const lampDescription = analysisResponse.text;

      setLoadingStep('Integrating lamp into room...');
      const roomBase64 = await fileToBase64(roomImage);

      const editPrompt = [
        'You are an expert interior designer and photo editor.',
        'Task: Add the exact lamp from the second reference image into the first room image.',
        `Lamp Description and Type: ${lampDescription}`,
        `Lighting State: ${lightingState === 'on' ? 'Turn on the lamp (illuminated)' : 'Turn off the lamp (unlit)'}`,
        `Time of Day: ${timeOfDay === 'daytime' ? 'Daytime (natural light)' : 'Nighttime (evening/nighttime atmosphere)'}`,
        notes ? `Additional Instructions: ${notes}` : '',
        '',
        'CORE PRINCIPLE:',
        '- The lamp is the main subject and visual hero.',
        '- The room is supporting background only.',
        '',
        '1. PRODUCT FIDELITY (HIGHEST PRIORITY):',
        '- Preserve the uploaded lamp exactly as shown in the reference image.',
        '- Do not change the lamp’s shape, style, silhouette, material, color, finish, structure, or decorative details.',
        '- Do not add or remove parts. Do not generate a different but similar-looking lamp.',
        '- Do not beautify the lamp by redesigning it. If uncertain, preserve it as-is.',
        '- CRITICAL EXCEPTION: You MUST completely erase any watermarks, text, or logos (e.g., "豆包AI生成") from the reference images. The final image must NOT contain any text.',
        '',
        '2. SIZE CONTROL:',
        '- Keep lamp scale realistic and conservative.',
        '- Do not arbitrarily enlarge or shrink the lamp. Do not oversize for visual drama.',
        '- Keep the lamp proportional to the visible room area, furniture scale, ceiling height, and perspective.',
        '- If uncertain, choose a slightly smaller but believable size rather than an exaggerated size.',
        '',
        '3. COMPOSITION & ROOM HANDLING:',
        '- Prioritize the lamp as the visual focus. The room serves only as a supporting background.',
        '- It is ALLOWED to crop, zoom, or reframe the room photo so that only part of the room is shown.',
        '- Do not force the full room to stay in frame if that makes the lamp too small or visually weak.',
        '- Mild room enhancement is allowed (brightness, clarity, color balance, composition optimization).',
        '- Do not alter walls, windows, doors, ceiling/floor structure, or major furniture layout EXCEPT through natural cropping.',
        '',
        '4. PLACEMENT & REALISM:',
        '- Keep placement realistic and physically believable (e.g., pendant to ceiling, table lamp to table).',
        '- Maintain realistic perspective, depth, occlusion, shadows, reflections, and lighting direction.',
        '- The final image must look like a real interior photo, not a fake CGI render.',
        ...(timeOfDay === 'nighttime' ? [
          '',
          '5. NIGHT MODE:',
          '- Moderately darken the room scene to create a realistic evening or nighttime atmosphere.',
          '- Turn on the lamp lighting effect naturally.',
          '- Emphasize the lamp’s glow, warmth, elegance, and nighttime ambience.',
          '- Keep the room visible enough to remain beautiful and realistic. Do not make it excessively dark.',
          '- Do not overexpose the lamp glow.'
        ] : [])
      ].filter(Boolean).join('\n');

      const editResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: roomBase64,
                mimeType: roomImage.type,
              },
            },
            {
              inlineData: {
                data: lampBase64,
                mimeType: lampImage.type,
              },
            },
            {
              text: editPrompt,
            },
          ],
        },
      });

      let generatedImageUrl = null;
      for (const part of editResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (generatedImageUrl) {
        setResultImage(generatedImageUrl);
      } else {
        throw new Error('Failed to generate image. No image data returned.');
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
      setLoadingStep('');
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `lighting-preview-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    removeImage('room');
    removeImage('lamp');
    setLightingState('on');
    setTimeOfDay('daytime');
    setNotes('');
    setResultImage(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#fcfbf9] text-[#1a1a1a] selection:bg-[#e0dcd3]">
      
      {/* Left Sidebar: Controls */}
      <aside className="w-full lg:w-[400px] xl:w-[480px] shrink-0 border-r border-[#e5e5e5] bg-white flex flex-col h-auto lg:h-screen lg:sticky lg:top-0 overflow-y-auto">
        <div className="p-8 lg:p-10 flex-1 flex flex-col">
          
          <header className="mb-12">
            <h1 className="font-serif text-3xl tracking-tight mb-2">Lighting Studio</h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Upload your space and a product photo to visualize the perfect lighting arrangement.
            </p>
          </header>

          <div className="space-y-10 flex-1">
            
            {/* Uploads */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">1. Source Images</h2>
              </div>
              
              <div className="space-y-4">
                {/* Room Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Interior Space</label>
                  <div className={`relative aspect-[4/3] rounded-sm border transition-colors ${roomImagePreview ? 'border-transparent' : 'border-[#e5e5e5] hover:border-gray-400 bg-[#fcfbf9]'}`}>
                    {roomImagePreview ? (
                      <div className="relative w-full h-full group">
                        <img src={roomImagePreview} alt="Room" className="w-full h-full object-cover rounded-sm" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-sm">
                          <button 
                            onClick={() => removeImage('room')}
                            className="text-white text-xs uppercase tracking-wider font-medium hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group">
                        <ImageIcon className="w-5 h-5 text-gray-300 mb-2 group-hover:text-gray-500 transition-colors" />
                        <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Upload Room Photo</span>
                        <input type="file" accept="image/*" className="hidden" ref={roomInputRef} onChange={(e) => handleImageUpload(e, 'room')} />
                      </label>
                    )}
                  </div>
                </div>

                {/* Lamp Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Lighting Product</label>
                  <div className={`relative aspect-[4/3] rounded-sm border transition-colors ${lampImagePreview ? 'border-transparent' : 'border-[#e5e5e5] hover:border-gray-400 bg-[#fcfbf9]'}`}>
                    {lampImagePreview ? (
                      <div className="relative w-full h-full group">
                        <img src={lampImagePreview} alt="Lamp" className="w-full h-full object-contain bg-white rounded-sm" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-sm">
                          <button 
                            onClick={() => removeImage('lamp')}
                            className="text-white text-xs uppercase tracking-wider font-medium hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group">
                        <Upload className="w-5 h-5 text-gray-300 mb-2 group-hover:text-gray-500 transition-colors" />
                        <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Upload Product Photo</span>
                        <input type="file" accept="image/*" className="hidden" ref={lampInputRef} onChange={(e) => handleImageUpload(e, 'lamp')} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Optional Details */}
            <section className="space-y-6">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">2. Specifications (Optional)</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Lighting State</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLightingState('on')}
                        className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium border rounded-sm transition-colors ${lightingState === 'on' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-transparent text-gray-500 border-[#e5e5e5] hover:border-gray-400'}`}
                      >
                        Turn On
                      </button>
                      <button
                        onClick={() => setLightingState('off')}
                        className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium border rounded-sm transition-colors ${lightingState === 'off' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-transparent text-gray-500 border-[#e5e5e5] hover:border-gray-400'}`}
                      >
                        Turn Off
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Time of Day</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTimeOfDay('daytime')}
                        className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium border rounded-sm transition-colors ${timeOfDay === 'daytime' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-transparent text-gray-500 border-[#e5e5e5] hover:border-gray-400'}`}
                      >
                        Daytime
                      </button>
                      <button
                        onClick={() => setTimeOfDay('nighttime')}
                        className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium border rounded-sm transition-colors ${timeOfDay === 'nighttime' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-transparent text-gray-500 border-[#e5e5e5] hover:border-gray-400'}`}
                      >
                        Nighttime
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Placement Notes</label>
                  <textarea 
                    placeholder="e.g. Center above the dining table" 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={1}
                    className="w-full px-3 py-2.5 text-sm bg-transparent border-b border-[#e5e5e5] focus:border-[#1a1a1a] focus:outline-none transition-colors resize-none rounded-none"
                  />
                </div>
              </div>
            </section>

          </div>

          {/* Actions */}
          <div className="mt-12 space-y-4">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-600 text-sm flex items-start gap-2 mb-4"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={generatePreview}
              disabled={isGenerating || !roomImage || !lampImage}
              className="w-full py-4 bg-[#1a1a1a] hover:bg-black disabled:bg-[#e5e5e5] disabled:text-gray-400 text-white text-xs uppercase tracking-widest font-medium transition-colors flex items-center justify-center gap-2 rounded-sm"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Generate Preview'
              )}
            </button>

            {(roomImage || lampImage || resultImage) && (
              <button
                onClick={handleReset}
                disabled={isGenerating}
                className="w-full py-3 text-xs uppercase tracking-widest font-medium text-gray-500 hover:text-[#1a1a1a] transition-colors"
              >
                Reset All
              </button>
            )}
          </div>

        </div>
      </aside>

      {/* Right Area: Result Canvas */}
      <main className="flex-1 min-h-[600px] lg:h-screen relative flex flex-col bg-[#f5f2ed]">
        
        {/* Top Bar for Result Actions */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-end z-10 pointer-events-none">
          <AnimatePresence>
            {resultImage && (
              <motion.button
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={handleDownload}
                className="pointer-events-auto flex items-center gap-2 text-xs uppercase tracking-widest font-medium bg-white/90 backdrop-blur-md border border-[#e5e5e5] px-4 py-2.5 rounded-sm shadow-sm hover:bg-white transition-all"
              >
                <Download className="w-4 h-4" />
                Download Image
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16 relative overflow-hidden">
          
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center space-y-6 z-20">
              <div className="w-12 h-12 relative">
                <div className="absolute inset-0 border-[1px] border-gray-300 rounded-full"></div>
                <div className="absolute inset-0 border-[1px] border-[#1a1a1a] rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <p className="font-serif text-xl mb-2">{loadingStep}</p>
                <p className="text-xs uppercase tracking-widest text-gray-500">Crafting your visualization</p>
              </div>
            </div>
          ) : resultImage ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full h-full flex items-center justify-center group"
            >
              <img 
                src={resultImage} 
                alt="Generated Preview" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
              />
              
              {/* Before/After Hint */}
              {roomImagePreview && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="bg-black/80 backdrop-blur-md text-white text-xs uppercase tracking-widest px-4 py-2 rounded-full shadow-lg">
                    Final Render
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center max-w-md">
              <div className="w-24 h-24 mb-8 opacity-20">
                <Sparkles className="w-full h-full" strokeWidth={1} />
              </div>
              <h2 className="font-serif text-3xl mb-4 text-gray-400">The Canvas is Empty</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Upload your interior space and a lighting product on the left. We will seamlessly integrate them to create a photorealistic preview.
              </p>
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
