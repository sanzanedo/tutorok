import React, { useState, useRef, useEffect } from 'react';
import { AppState, Topic, FeedbackResponse } from './types';
import { generateImageForTopic, evaluateDescription, transcribeAudio } from './services/geminiService';
import { TopicCard } from './components/TopicCard';
import { LoadingScreen } from './components/LoadingScreen';
import { BookOpen, RefreshCw, Send, ChevronRight, CheckCircle2, AlertCircle, Sparkles, Lightbulb, Mic, Square, Loader2, GraduationCap, XCircle, ArrowRight, Quote, BarChart3 } from 'lucide-react';

// Predefined topics suitable for DELE B2
const TOPICS: Topic[] = [
  { 
    id: 'environment', 
    title: 'El Medio Ambiente', 
    description: 'Problemas ecológicos, reciclaje, cambio climático y naturaleza.', 
    icon: '🌍',
    vocabulary: ['Sostenibilidad', 'Contaminación', 'Reciclaje', 'Energías renovables', 'Cambio climático', 'Biodiversidad', 'Residuos']
  },
  { 
    id: 'technology', 
    title: 'Nuevas Tecnologías', 
    description: 'El impacto de internet, móviles, redes sociales y el futuro.', 
    icon: '💻',
    vocabulary: ['Inteligencia artificial', 'Digitalización', 'Redes sociales', 'Dispositivo', 'Automatización', 'Ciberseguridad', 'Innovación']
  },
  { 
    id: 'health', 
    title: 'Salud y Bienestar', 
    description: 'Estilos de vida, deporte, alimentación y medicina.', 
    icon: '🏥',
    vocabulary: ['Dieta equilibrada', 'Sedentarismo', 'Bienestar mental', 'Hábitos saludables', 'Prevención', 'Sistema sanitario', 'Ejercicio físico']
  },
  { 
    id: 'work', 
    title: 'El Mundo Laboral', 
    description: 'Entrevistas, teletrabajo, desempleo y carreras profesionales.', 
    icon: '💼',
    vocabulary: ['Teletrabajo', 'Conciliación', 'Productividad', 'Cualificación', 'Desempleo', 'Emprendimiento', 'Jornada laboral']
  },
  { 
    id: 'travel', 
    title: 'Viajes y Turismo', 
    description: 'Vacaciones, turismo sostenible, cultura y experiencias.', 
    icon: '✈️',
    vocabulary: ['Turismo sostenible', 'Patrimonio', 'Alojamiento', 'Destino exótico', 'Temporada alta', 'Itinerario', 'Experiencia local']
  },
  { 
    id: 'housing', 
    title: 'Vivienda y Ciudad', 
    description: 'Vida urbana vs rural, problemas de alquiler, convivencia.', 
    icon: '🏘️',
    vocabulary: ['Alquiler', 'Zona residencial', 'Calidad de vida', 'Urbanización', 'Áreas verdes', 'Transporte público', 'Convivencia']
  },
];

const App: React.FC = () => {
  const [currentState, setCurrentState] = useState<AppState>(AppState.TOPIC_SELECTION);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [studentDescription, setStudentDescription] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTopicSelect = async (topic: Topic) => {
    setSelectedTopic(topic);
    setCurrentState(AppState.GENERATING_IMAGE);
    setError(null);
    try {
      const base64Image = await generateImageForTopic(topic.title);
      setGeneratedImage(base64Image);
      setCurrentState(AppState.DESCRIBING);
    } catch (err) {
      console.error(err);
      setError('Hubo un error al generar la imagen. Por favor, intenta de nuevo.');
      setCurrentState(AppState.TOPIC_SELECTION);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscribe(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsTranscribing(true);
    }
  };

  const handleTranscribe = async (audioBlob: Blob) => {
    try {
      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        // Remove the Data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Audio = base64String.split(',')[1];
        const mimeType = base64String.split(';')[0].split(':')[1];

        const text = await transcribeAudio(base64Audio, mimeType);
        
        setStudentDescription(prev => {
          const newText = prev ? `${prev} ${text}` : text;
          return newText;
        });
        setIsTranscribing(false);
      };
    } catch (err) {
      console.error("Transcription error:", err);
      setError("Hubo un problema transcribiendo el audio.");
      setIsTranscribing(false);
    }
  };

  const handleSubmitDescription = async () => {
    if (!generatedImage || !selectedTopic) return;
    if (studentDescription.trim().length < 10) {
      setError('Por favor, escribe una descripción más detallada (mínimo 10 caracteres).');
      return;
    }

    setCurrentState(AppState.ANALYZING);
    setError(null);
    try {
      const feedbackResult = await evaluateDescription(generatedImage, studentDescription, selectedTopic.title);
      setFeedback(feedbackResult);
      setCurrentState(AppState.FEEDBACK);
    } catch (err) {
      console.error(err);
      setError('Error analizando tu respuesta. Inténtalo de nuevo.');
      setCurrentState(AppState.DESCRIBING);
    }
  };

  const handleReset = () => {
    setGeneratedImage(null);
    setStudentDescription('');
    setFeedback(null);
    setSelectedTopic(null);
    setCurrentState(AppState.TOPIC_SELECTION);
    setError(null);
    setIsRecording(false);
    setIsTranscribing(false);
  };

  const handleRetrySameTopic = async () => {
    if (!selectedTopic) return;
    setStudentDescription('');
    setFeedback(null);
    setCurrentState(AppState.GENERATING_IMAGE);
    try {
      const base64Image = await generateImageForTopic(selectedTopic.title);
      setGeneratedImage(base64Image);
      setCurrentState(AppState.DESCRIBING);
    } catch (err) {
      setError('Error regenerando la imagen.');
      setCurrentState(AppState.TOPIC_SELECTION);
    }
  };

  // Helper for score color
  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-600';
    if (score >= 7) return 'text-indigo-600';
    if (score >= 5) return 'text-amber-600';
    return 'text-red-600';
  };

  const ScoreBar = ({ label, score, colorClass }: { label: string, score: number, colorClass: string }) => (
    <div className="mb-3">
      <div className="flex justify-between items-end mb-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`text-sm font-bold ${colorClass}`}>{score}/10</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${colorClass.replace('text-', 'bg-')}`} 
          style={{ width: `${score * 10}%` }}
        ></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 bg-opacity-90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600 cursor-pointer" onClick={handleReset}>
            <BookOpen className="w-6 h-6" />
            <span className="font-bold text-xl tracking-tight">DELE Tutor B2</span>
          </div>
          {currentState !== AppState.TOPIC_SELECTION && (
            <button 
              onClick={handleReset}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Cambiar Tema
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* State: Topic Selection */}
        {currentState === AppState.TOPIC_SELECTION && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
                Practica para el examen oral
              </h1>
              <p className="text-lg text-slate-600">
                Selecciona un tema común del examen DELE B2. Generaremos una imagen única para que practiques tu descripción y recibas correcciones instantáneas.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {TOPICS.map((topic) => (
                <TopicCard key={topic.id} topic={topic} onClick={handleTopicSelect} />
              ))}
            </div>
          </div>
        )}

        {/* State: Generating Image */}
        {currentState === AppState.GENERATING_IMAGE && (
          <LoadingScreen message={`Generando una imagen sobre "${selectedTopic?.title}"...`} />
        )}

        {/* State: Describing */}
        {currentState === AppState.DESCRIBING && generatedImage && selectedTopic && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in duration-500">
            {/* Image & Scaffolding Column */}
            <div className="space-y-6">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
                  <img 
                    src={`data:image/png;base64,${generatedImage}`} 
                    alt={selectedTopic.title}
                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-700"
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center text-sm text-slate-500 px-1">
                <span>Tema: <span className="font-medium text-slate-900">{selectedTopic.title}</span></span>
                <button 
                  onClick={handleRetrySameTopic}
                  className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Nueva imagen
                </button>
              </div>

              {/* Scaffolding Section */}
              <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-2 mb-4 text-indigo-800">
                  <Lightbulb className="w-5 h-5 fill-indigo-100" />
                  <h3 className="font-bold text-sm uppercase tracking-wide">Banco de Recursos (Ayuda)</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-500 uppercase mb-2">Vocabulario Sugerido</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTopic.vocabulary.map(word => (
                        <span key={word} className="text-xs font-medium bg-white text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 shadow-sm">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-indigo-500 uppercase mb-2">Conectores</h4>
                      <ul className="text-sm text-slate-700 space-y-1">
                        <li>• En primer plano / Al fondo</li>
                        <li>• A la derecha / izquierda</li>
                        <li>• En el centro / Arriba</li>
                        <li>• Por un lado / Por otro</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-indigo-500 uppercase mb-2">Estructuras</h4>
                      <ul className="text-sm text-slate-700 space-y-1">
                        <li>• Me parece que...</li>
                        <li>• Se puede observar...</li>
                        <li>• Es probable que (+ subj)</li>
                        <li>• Me llama la atención...</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Input Column */}
            <div className="flex flex-col space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                   <h2 className="text-2xl font-bold text-slate-900">Describe la imagen</h2>
                   
                   {/* Recording Controls */}
                   <div className="flex items-center gap-2">
                      {isTranscribing ? (
                         <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-full animate-pulse">
                           <Loader2 className="w-4 h-4 animate-spin" />
                           Transcribiendo...
                         </div>
                      ) : (
                        <button
                          onClick={isRecording ? stopRecording : startRecording}
                          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                            isRecording 
                              ? 'bg-red-100 text-red-600 border border-red-200 hover:bg-red-200' 
                              : 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100'
                          }`}
                        >
                          {isRecording ? (
                            <>
                              <Square className="w-4 h-4 fill-current" />
                              <span className="animate-pulse">Grabando (clic para parar)</span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-4 h-4" />
                              Dictar respuesta
                            </>
                          )}
                        </button>
                      )}
                   </div>
                </div>

                <p className="text-slate-600 mb-6">
                  Escribe o dicta una descripción detallada. Usa los recursos de abajo si necesitas ayuda para enriquecer tu respuesta.
                </p>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={studentDescription}
                    onChange={(e) => setStudentDescription(e.target.value)}
                    placeholder="En la imagen puedo ver..."
                    className={`w-full h-80 p-5 rounded-xl border transition-all resize-none text-base leading-relaxed ${
                      isRecording 
                        ? 'border-red-400 ring-4 ring-red-50' 
                        : 'border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50'
                    }`}
                    spellCheck="false"
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-slate-400 pointer-events-none bg-white/80 px-2 py-1 rounded">
                    {studentDescription.length} caracteres
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmitDescription}
                disabled={studentDescription.trim().length === 0 || isRecording || isTranscribing}
                className="group flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-xl active:scale-[0.99]"
              >
                Enviar Respuesta
                <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* State: Analyzing */}
        {currentState === AppState.ANALYZING && (
          <LoadingScreen message="El tutor está analizando tu respuesta..." />
        )}

        {/* State: Feedback */}
        {currentState === AppState.FEEDBACK && generatedImage && feedback && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {/* Side Image (Smaller on feedback screen) */}
            <div className="lg:col-span-4 space-y-6">
               <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                <img 
                  src={`data:image/png;base64,${generatedImage}`} 
                  alt="Referencia"
                  className="rounded-lg w-full h-auto object-cover"
                />
              </div>
              <div className="bg-slate-100 p-4 rounded-xl">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tu Respuesta Original</h3>
                 <p className="text-slate-700 text-sm leading-relaxed italic border-l-2 border-slate-300 pl-3">
                    "{studentDescription}"
                 </p>
              </div>
              
               {/* Score Card Breakdown */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex items-center gap-2 mb-4 text-slate-700">
                     <BarChart3 className="w-5 h-5" />
                     <h3 className="text-sm font-bold uppercase tracking-wide">Boletín de Notas</h3>
                  </div>
                  
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-slate-500 text-sm">Nota Global</span>
                    <span className={`text-4xl font-bold ${getScoreColor(feedback.score)}`}>{feedback.score}</span>
                  </div>

                  {feedback.scoreBreakdown && (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <ScoreBar 
                        label="Gramática" 
                        score={feedback.scoreBreakdown.grammar} 
                        colorClass="text-indigo-600" 
                      />
                      <ScoreBar 
                        label="Vocabulario" 
                        score={feedback.scoreBreakdown.vocabulary} 
                        colorClass="text-emerald-600" 
                      />
                      <ScoreBar 
                        label="Coherencia" 
                        score={feedback.scoreBreakdown.coherence} 
                        colorClass="text-amber-600" 
                      />
                    </div>
                  )}
               </div>

               <button
                onClick={handleReset}
                className="w-full py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:border-indigo-600 hover:text-indigo-600 transition-all"
              >
                Practicar otro tema
              </button>
            </div>

            {/* Main Feedback Content */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* General Advice */}
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
                <div className="relative z-10">
                   <div className="flex items-center gap-2 mb-2">
                     <Sparkles className="w-5 h-5 text-indigo-200" />
                     <h2 className="font-bold text-lg">Evaluación General</h2>
                   </div>
                   <p className="text-indigo-50 leading-relaxed font-medium">
                     {feedback.generalAdvice}
                   </p>
                </div>
                <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4">
                  <GraduationCap className="w-32 h-32" />
                </div>
              </div>

              {/* Grammar Corrections */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                  <div className="bg-red-100 p-1.5 rounded-lg text-red-600">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  Correcciones Gramaticales
                </h3>
                
                {feedback.grammarCorrections.length === 0 ? (
                   <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-100 flex items-center gap-3">
                     <CheckCircle2 className="w-5 h-5" />
                     <p>¡Excelente! No se han encontrado errores gramaticales graves.</p>
                   </div>
                ) : (
                  <div className="space-y-4">
                    {feedback.grammarCorrections.map((item, index) => (
                      <div key={index} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-3">
                           <div className="flex items-center gap-2 text-red-500 font-medium bg-red-50 px-3 py-1 rounded-lg line-through decoration-red-400 decoration-2">
                             <XCircle className="w-4 h-4 flex-shrink-0" />
                             {item.error}
                           </div>
                           <ArrowRight className="hidden sm:block text-slate-300 w-5 h-5" />
                           <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-lg">
                             <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                             {item.correction}
                           </div>
                        </div>
                        <p className="text-slate-600 text-sm pl-1 border-l-2 border-indigo-200">
                          <span className="font-semibold text-indigo-900 text-xs uppercase mr-1">Explicación:</span>
                          {item.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vocabulary Suggestions */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                  <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  Vocabulario Recomendado (Nivel C1)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {feedback.vocabularySuggestions.map((vocab, index) => (
                      <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                         <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                         <span className="text-slate-700 font-medium">{vocab}</span>
                      </div>
                   ))}
                </div>
              </div>

              {/* Coherence Check */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
                 <h3 className="flex items-center gap-2 text-md font-bold text-amber-800 mb-2">
                   <Lightbulb className="w-5 h-5" />
                   Coherencia Visual
                 </h3>
                 <p className="text-amber-900 text-sm">
                   {feedback.coherenceCheck}
                 </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  onClick={() => {
                    setStudentDescription('');
                    setFeedback(null);
                    setCurrentState(AppState.DESCRIBING);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reintentar misma imagen
                </button>
                <button
                   onClick={handleReset}
                   className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-md"
                >
                  Siguiente Ejercicio <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
