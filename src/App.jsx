import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const IsofonicApp = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showGraph, setShowGraph] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [waveformType, setWaveformType] = useState('sine');
  
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef({});
  
  const testFrequencies = [20, 50, 100, 200, 500, 2000, 5000, 8000, 10000, 20000];
  const referenceFreq = 1000;
  
  const [toneSettings, setToneSettings] = useState(() => {
    const settings = {};
    [...testFrequencies, referenceFreq].forEach(freq => {
      settings[freq] = {
        dbSPL: freq === referenceFreq ? 65 : 50,
        isMuted: true
      };
    });
    return settings;
  });

  const dbToGain = (dbSPL) => {
    const normalizedDb = Math.max(20, Math.min(100, dbSPL));
    return 0.001 * Math.pow(10, (normalizedDb - 20) / 20) * 0.1;
  };

  const createWhiteNoise = (context, duration = 2) => {
    const bufferSize = context.sampleRate * duration;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  };

  useEffect(() => {
    const initAudio = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        
        [...testFrequencies, referenceFreq].forEach(freq => {
          audioNodesRef.current[freq] = {
            oscillator: null,
            noiseSource: null,
            gainNode: null,
            filter: null,
            whiteNoiseBuffer: createWhiteNoise(audioContextRef.current)
          };
          
          const gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = 0;
          gainNode.connect(audioContextRef.current.destination);
          audioNodesRef.current[freq].gainNode = gainNode;
          
          const oscillator = audioContextRef.current.createOscillator();
          oscillator.frequency.value = freq;
          oscillator.type = 'sine';
          oscillator.connect(gainNode);
          oscillator.start();
          audioNodesRef.current[freq].oscillator = oscillator;
        });
      }
    };
    
    initAudio();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const updateAudio = () => {
    if (!audioContextRef.current) return;

    const fadeTime = 0.1;
    const currentTime = audioContextRef.current.currentTime;

    [...testFrequencies, referenceFreq].forEach(freq => {
      const setting = toneSettings[freq];
      const nodes = audioNodesRef.current[freq];
      
      if (!nodes || !nodes.gainNode) return;

      if (!setting.isMuted) {
        const targetVolume = dbToGain(setting.dbSPL);
        
        if (waveformType === 'noise') {
          // Disconnetti completamente l'oscillatore
          if (nodes.oscillator) {
            try {
              nodes.oscillator.disconnect();
            } catch (e) {}
          }
          
          // Ferma rumore precedente
          if (nodes.noiseSource) {
            try {
              nodes.noiseSource.stop();
            } catch (e) {}
          }
          
          // Crea nuovo rumore filtrato dopo un breve delay
          setTimeout(() => {
            if (!audioContextRef.current || setting.isMuted) return;
            
            const noiseSource = audioContextRef.current.createBufferSource();
            const filter = audioContextRef.current.createBiquadFilter();
            
            filter.type = 'bandpass';
            filter.frequency.value = freq;
            filter.Q.value = 3;
            
            noiseSource.buffer = nodes.whiteNoiseBuffer;
            noiseSource.loop = true;
            
            noiseSource.connect(filter);
            filter.connect(nodes.gainNode);
            noiseSource.start();
            
            nodes.noiseSource = noiseSource;
            
            // Fade-in graduale
            const startTime = audioContextRef.current.currentTime;
            nodes.gainNode.gain.cancelScheduledValues(startTime);
            nodes.gainNode.gain.setValueAtTime(0.001, startTime);
            nodes.gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, targetVolume), startTime + fadeTime);
          }, 50);
          
        } else {
          // Ferma rumore se attivo
          if (nodes.noiseSource) {
            try {
              nodes.noiseSource.stop();
              nodes.noiseSource = null;
            } catch (e) {}
          }
          
          // Riconnetti oscillatore solo se necessario
          try {
            nodes.oscillator.disconnect();
            nodes.oscillator.connect(nodes.gainNode);
          } catch (e) {
            // Ricrea oscillatore se necessario
            const newOsc = audioContextRef.current.createOscillator();
            newOsc.frequency.value = freq;
            newOsc.type = 'sine';
            newOsc.connect(nodes.gainNode);
            newOsc.start();
            nodes.oscillator = newOsc;
          }
          
          // Fade-in graduale
          nodes.gainNode.gain.cancelScheduledValues(currentTime);
          nodes.gainNode.gain.setValueAtTime(0.001, currentTime);
          nodes.gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, targetVolume), currentTime + fadeTime);
        }
      } else {
        // MUTING: disconnetti tutto completamente
        
        // Fade-out prima di disconnettere
        nodes.gainNode.gain.cancelScheduledValues(currentTime);
        nodes.gainNode.gain.setValueAtTime(Math.max(0.001, nodes.gainNode.gain.value), currentTime);
        nodes.gainNode.gain.exponentialRampToValueAtTime(0.001, currentTime + fadeTime);
        
        // Disconnetti tutto dopo il fade
        setTimeout(() => {
          // Ferma e disconnetti il rumore
          if (nodes.noiseSource) {
            try {
              nodes.noiseSource.stop();
              nodes.noiseSource = null;
            } catch (e) {}
          }
          
          // Disconnetti l'oscillatore (ma non fermarlo per evitare di ricrearlo)
          if (nodes.oscillator) {
            try {
              nodes.oscillator.disconnect();
            } catch (e) {}
          }
          
          // Assicurati che il gain sia a zero
          if (nodes.gainNode) {
            nodes.gainNode.gain.setValueAtTime(0.001, audioContextRef.current.currentTime);
          }
        }, fadeTime * 1000 + 10);
      }
    });
  };

  useEffect(() => {
    updateAudio();
  }, [toneSettings, waveformType]);

  const handleVolumeChange = (freq, dbSPL) => {
    const newDbSPL = Math.max(20, Math.min(100, dbSPL));
    
    setToneSettings(prev => ({
      ...prev,
      [freq]: { ...prev[freq], dbSPL: newDbSPL }
    }));
    
    // Applica fade solo se il tono è attivo (non mutato)
    if (!toneSettings[freq].isMuted && audioContextRef.current) {
      const nodes = audioNodesRef.current[freq];
      if (nodes && nodes.gainNode) {
        const fadeTime = 0.05; // Fade veloce per responsività
        const currentTime = audioContextRef.current.currentTime;
        const newVolume = dbToGain(newDbSPL);
        
        // Assicurati che il volume non vada mai a zero per evitare problemi
        const safeVolume = Math.max(0.001, newVolume);
        
        nodes.gainNode.gain.cancelScheduledValues(currentTime);
        nodes.gainNode.gain.setValueAtTime(Math.max(0.001, nodes.gainNode.gain.value), currentTime);
        nodes.gainNode.gain.exponentialRampToValueAtTime(safeVolume, currentTime + fadeTime);
      }
    }
  };

  const toggleMute = async (freq) => {
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    setToneSettings(prev => ({
      ...prev,
      [freq]: { ...prev[freq], isMuted: !prev[freq].isMuted }
    }));
  };

  const calculatePhon = (freq, dbSPL) => {
    if (freq === referenceFreq) {
      return dbSPL;
    }
    return toneSettings[referenceFreq].dbSPL;
  };

  const nextStep = () => {
    if (currentStep < testFrequencies.length - 1) {
      setCurrentStep(currentStep + 1);
      setToneSettings(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(freq => {
          updated[freq] = { ...updated[freq], isMuted: true };
        });
        return updated;
      });
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setToneSettings(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(freq => {
          updated[freq] = { ...updated[freq], isMuted: true };
        });
        return updated;
      });
    }
  };

  const finishTest = () => {
    setShowGraph(true);
    setToneSettings(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(freq => {
        updated[freq] = { ...updated[freq], isMuted: true };
      });
      return updated;
    });
  };

  const resetTest = () => {
    setCurrentStep(0);
    setShowGraph(false);
    setIsCalibrated(false);
    setToneSettings(() => {
      const reset = {};
      [...testFrequencies, referenceFreq].forEach(freq => {
        reset[freq] = {
          dbSPL: freq === referenceFreq ? 65 : 50,
          isMuted: true
        };
      });
      return reset;
    });
  };

  const downloadChart = async () => {
    try {
      // Trova il contenitore SVG del grafico
      const svgElement = document.querySelector('.recharts-wrapper svg');
      if (!svgElement) {
        alert('Grafico non trovato. Assicurati che il grafico sia visibile.');
        return;
      }

      // Clona l'SVG per manipolarlo
      const svgClone = svgElement.cloneNode(true);
      
      // Imposta dimensioni esplicite
      svgClone.setAttribute('width', '800');
      svgClone.setAttribute('height', '600');
      
      // Aggiungi sfondo bianco
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', 'white');
      svgClone.insertBefore(rect, svgClone.firstChild);
      
      // Serializza l'SVG
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      
      // Crea blob SVG
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      
      // Converti in PNG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 800;
      canvas.height = 600;
      
      const img = new Image();
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        // Disegna sfondo bianco
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Disegna l'immagine
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Download
        canvas.toBlob((blob) => {
          const link = document.createElement('a');
          link.download = 'curva-isofonica-personale.png';
          link.href = URL.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Cleanup
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      
      img.onerror = () => {
        console.error('Errore nel caricamento dell\'immagine SVG');
        alert('Errore durante la conversione del grafico. Riprova.');
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
      
    } catch (error) {
      console.error('Errore durante il download:', error);
      alert('Errore durante il download del grafico. Riprova.');
    }
  };

  const WaveformSelector = () => (
    <div className="flex justify-center mb-6">
      <div className="bg-white rounded-lg p-1 shadow-md border-2 border-gray-200">
        <button
          onClick={() => setWaveformType('sine')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            waveformType === 'sine'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🎵 Tono Puro
        </button>
        <button
          onClick={() => setWaveformType('noise')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            waveformType === 'noise'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🔊 Rumore Filtrato
        </button>
      </div>
    </div>
  );

  const FrequencyControl = ({ frequency, label, color = "gray", isReference = false, isCalibration = false }) => {
    const phon = calculatePhon(frequency, toneSettings[frequency].dbSPL);
    
    const getColorClasses = (color) => {
      switch(color) {
        case 'blue':
          return {
            border: 'border-blue-200',
            bg: 'bg-blue-50',
            text: 'text-blue-700',
            button: 'bg-blue-500 hover:bg-blue-600'
          };
        case 'orange':
          return {
            border: 'border-orange-200',
            bg: 'bg-orange-50',
            text: 'text-orange-700',
            button: 'bg-orange-500 hover:bg-orange-600'
          };
        default:
          return {
            border: 'border-gray-200',
            bg: 'bg-gray-50',
            text: 'text-gray-700',
            button: 'bg-gray-500 hover:bg-gray-600'
          };
      }
    };
    
    const classes = getColorClasses(color);
    const canAdjustVolume = isCalibration || !isReference;
    
    return (
      <div className={`p-6 rounded-lg border-2 ${classes.border} ${classes.bg}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-xl font-bold ${classes.text}`}>
              {frequency}Hz {label && `(${label})`}
            </h3>
            <p className={`text-sm ${classes.text} opacity-75 mt-1`}>
              {phon.toFixed(1)} Phon
            </p>
          </div>
          <button
            onClick={() => toggleMute(frequency)}
            className={`p-3 rounded-lg transition-colors ${
              toneSettings[frequency].isMuted
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : `${classes.button} text-white`
            }`}
            title={toneSettings[frequency].isMuted ? "Play" : "Pause"}
          >
            {toneSettings[frequency].isMuted ? <Play size={20} /> : <Pause size={20} />}
          </button>
        </div>
        
        <div className="space-y-4">
          {canAdjustVolume ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Livello (dB SPL)
                </label>
                <input
                  type="number"
                  value={Math.round(toneSettings[frequency].dbSPL)}
                  onChange={(e) => handleVolumeChange(frequency, parseInt(e.target.value) || 20)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                  min="20"
                  max="100"
                  step="1"
                />
              </div>
              
              <input
                type="range"
                value={toneSettings[frequency].dbSPL}
                onChange={(e) => handleVolumeChange(frequency, parseInt(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                min="20"
                max="100"
                step="1"
              />
            </>
          ) : (
            <div className="bg-gray-100 p-4 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-center text-gray-600 text-sm mb-2">
                <strong>Livello di riferimento fisso</strong>
              </p>
              <p className="text-center text-xs text-gray-500">
                Impostato durante la calibrazione
              </p>
            </div>
          )}
          
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-700">
              {toneSettings[frequency].dbSPL.toFixed(1)} dB SPL
            </div>
            <div className="text-sm text-gray-500">
              Loudness: {(Math.pow(2, (phon - 40) / 10)).toFixed(2)} sone
            </div>
          </div>
        </div>
      </div>
    );
  };

  const CalibrationScreen = () => (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Calibrazione Audio
        </h1>
        
        <div className="max-w-2xl mx-auto text-center mb-8">
          <p className="text-lg text-gray-700 mb-4">
            Per ottenere misurazioni accurate, è necessario calibrare il sistema audio.
          </p>
          <p className="text-gray-600 mb-6">
            Regola il volume del tono sottostante a un <strong>livello confortevole</strong> 
            che potresti ascoltare per alcuni minuti senza affaticamento.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              <strong>Importante:</strong> Usa cuffie di buona qualità per risultati migliori. 
              Evita altoparlanti che possono essere influenzati dall'ambiente.
            </p>
          </div>
        </div>

        <WaveformSelector />

        <div className="max-w-md mx-auto mb-8">
          <FrequencyControl 
            frequency={referenceFreq} 
            label="Tono di Calibrazione" 
            color="blue"
            isCalibration={true}
          />
        </div>

        <div className="text-center">
          <p className="text-gray-600 mb-4">
            Quando il livello ti sembra confortevole, procedi con il test.
            <br />
            <span className="text-sm">
              (Assumeremo che questo livello corrisponda a circa 65 dB SPL)
            </span>
          </p>
          <button
            onClick={() => {
              setIsCalibrated(true);
              setToneSettings(prev => {
                const updated = { ...prev };
                Object.keys(updated).forEach(freq => {
                  updated[freq] = { ...updated[freq], isMuted: true };
                });
                return updated;
              });
            }}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition-colors"
          >
            Inizia Test Curve Isofoniche
          </button>
        </div>
      </div>
    </div>
  );

  if (!isCalibrated) {
    return <CalibrationScreen />;
  }

  if (showGraph) {
    const graphData = [...testFrequencies, referenceFreq]
      .sort((a, b) => a - b)
      .map(freq => ({
        freq: `${freq}Hz`,
        dbSPL: toneSettings[freq].dbSPL,
        phon: calculatePhon(freq, toneSettings[freq].dbSPL),
        freqNum: freq
      }));

    return (
      <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-center mb-4 text-gray-800">
            La Tua Curva Isofonica
          </h1>
          
          <div className="mb-6 text-center">
            <button
              onClick={downloadChart}
              className="mr-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors inline-flex items-center gap-2"
            >
              <Download size={20} />
              Scarica PNG
            </button>
            <button
              onClick={resetTest}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
            >
              Nuovo Test
            </button>
          </div>

          <div className="w-full mb-8" style={{ height: '500px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="freq" angle={-45} textAnchor="end" height={60} />
                <YAxis domain={[20, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="dbSPL" stroke="#2563eb" strokeWidth={2} name="dB SPL" />
                <Line type="monotone" dataKey="phon" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" name="Phon" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="font-bold text-lg mb-4 text-gray-800">Interpretazione dei Risultati</h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-blue-700 mb-2">📊 Curva Blu (dB SPL)</h4>
                <p className="text-sm text-gray-700">
                  Rappresenta il <strong>livello fisico</strong> necessario per percepire ogni frequenza 
                  alla stessa intensità del riferimento a 1kHz.
                </p>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-red-700 mb-2">📈 Curva Rossa (Phon)</h4>
                <p className="text-sm text-gray-700">
                  Mostra il <strong>livello di loudness percepita</strong>. 
                  È costante per definizione in questo test (equalizzazione percettiva).
                </p>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-green-700 mb-2">🎯 Valori Misurati</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Loudness Level:</strong> {toneSettings[referenceFreq].dbSPL.toFixed(1)} Phon</p>
                  <p><strong>Loudness Soggettiva:</strong> {Math.pow(2, (toneSettings[referenceFreq].dbSPL - 40) / 10).toFixed(2)} sone</p>
                  <p><strong>Frequenze testate:</strong> {testFrequencies.length + 1}</p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
              <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Note Importanti</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• I valori sono approssimativi e dipendono dalla calibrazione del sistema audio</li>
                <li>• Per misurazioni cliniche precise è necessaria strumentazione professionale</li>
                <li>• Le frequenze estreme (20Hz, 20kHz) potrebbero non essere udibili su tutti i dispositivi</li>
                <li>• Consigliato l'uso di cuffie di qualità per risultati più accurati</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentFreq = testFrequencies[currentStep];
  const isLastStep = currentStep === testFrequencies.length - 1;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Test Curve Isofoniche
        </h1>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">Progresso</span>
            <span className="text-sm text-gray-600">{currentStep + 1} di {testFrequencies.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / testFrequencies.length) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-xl text-gray-700 mb-2">
            Regola <strong>{currentFreq}Hz</strong> fino a percepirlo alla stessa intensità del riferimento
          </h2>
          <p className="text-gray-600 mb-2">
            Usa i pulsanti <strong>Play/Pause</strong> per alternare tra i toni e trova il livello che li fa suonare uguali
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 inline-block">
            <p className="text-green-800 text-sm">
              <strong>Target:</strong> {toneSettings[referenceFreq].dbSPL.toFixed(1)} Phon 
              ({Math.pow(2, (toneSettings[referenceFreq].dbSPL - 40) / 10).toFixed(2)} sone)
            </p>
          </div>
        </div>

        <WaveformSelector />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <FrequencyControl 
            frequency={currentFreq} 
            label="Frequenza Test" 
            color="orange"
          />
          
          <FrequencyControl 
            frequency={referenceFreq} 
            label="Riferimento" 
            color="blue"
            isReference={true}
          />
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
              currentStep === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            <ChevronLeft size={20} />
            Indietro
          </button>

          <div className="text-center">
            <span className="text-gray-600 text-lg font-medium">
              {currentFreq}Hz
            </span>
          </div>

          {isLastStep ? (
            <button
              onClick={finishTest}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
            >
              Termina Test
              <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={nextStep}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Avanti
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IsofonicApp;
