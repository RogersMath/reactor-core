import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, RotateCcw, Atom, Play, RefreshCcw, ScrollText, Calculator } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*                                AUDIO ENGINE                                */
/* -------------------------------------------------------------------------- */

let audioCtx = null;

const SoundEngine = {
  init: () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  },
  play: (frequency, duration, type = 'sine', vol = 0.3) => {
    try {
      SoundEngine.init();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    } catch (e) { console.error(e); }
  },
  effects: {
    cardTap: () => { SoundEngine.play(600, 0.1, 'sine'); setTimeout(() => SoundEngine.play(800, 0.1, 'sine'), 50); },
    stream: () => SoundEngine.play(300, 0.15, 'sine', 0.1),
    antimatterHit: () => SoundEngine.play(150, 0.2, 'sawtooth', 0.2),
    matterHit: () => SoundEngine.play(500, 0.2, 'sine', 0.2),
    balance: () => { [261, 329, 392, 523, 659].forEach((f, i) => setTimeout(() => SoundEngine.play(f, 0.8, 'sine'), i * 100)); },
    victory: () => { [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => SoundEngine.play(f, 0.4, 'triangle'), i * 150)); },
    undo: () => { SoundEngine.play(400, 0.15, 'triangle'); setTimeout(() => SoundEngine.play(300, 0.15, 'triangle'), 100); }
  }
};

/* -------------------------------------------------------------------------- */
/*                                SUB-COMPONENTS                              */
/* -------------------------------------------------------------------------- */

const UnitGrid = ({ value }) => {
  if (value === 0) return null;
  const absValue = Math.abs(value);
  const isPositive = value > 0;
  const color = isPositive ? 'green' : 'red';
  
  // Create squares of max 25
  const squares = [];
  let remaining = absValue;
  while (remaining > 0) {
    squares.push(Math.min(remaining, 25));
    remaining -= 25;
  }

  return (
    <div className="flex gap-2 flex-wrap items-center justify-center">
      {squares.map((size, index) => (
        <div 
          key={index} 
          className={`relative border-2 rounded-lg p-2 flex flex-col items-center justify-center backdrop-blur-sm shadow-lg
            ${isPositive ? 'bg-green-500/10 border-green-400/40 shadow-green-400/20' : 'bg-red-500/10 border-red-400/40 shadow-red-400/20'}`}
          style={{ minWidth: '60px', minHeight: '60px' }}
          aria-label={`${size} ${isPositive ? 'Matter' : 'Antimatter'} ${size === 1 ? 'unit' : 'units'}`}
        >
          <div className={`absolute top-0 right-0 bg-white/90 text-${color}-600 font-bold text-xs rounded-bl px-1.5 py-0.5`}>
            {size}
          </div>
          <div 
            className={`grid gap-0.5 text-${color}-300`}
            style={{ 
              gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(size))}, 1fr)`,
              fontSize: size === 1 ? '1.5rem' : '0.75rem'
            }}
            aria-hidden="true"
          >
            {Array(size).fill(0).map((_, i) => <span key={i} className="leading-none">⚛</span>)}
          </div>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                MAIN COMPONENT                              */
/* -------------------------------------------------------------------------- */

export default function App() {
  // State with localStorage persistence
  const [level, setLevel] = useState(() => parseInt(localStorage.getItem('rc_level') || '1'));
  const [puzzlesSolved, setPuzzlesSolved] = useState(() => parseInt(localStorage.getItem('rc_solved') || '0'));
  const [gameState, setGameState] = useState('menu');
  const [deck, setDeck] = useState([]);
  const [leftConstant, setLeftConstant] = useState(0);
  const [rightValue, setRightValue] = useState(0);
  const [moves, setMoves] = useState(0);
  const [minMoves, setMinMoves] = useState(0);
  const [moveHistory, setMoveHistory] = useState([]);
  const [undoAvailable, setUndoAvailable] = useState(1);
  
  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const [fallingCards, setFallingCards] = useState([]);
  const [streamingUnits, setStreamingUnits] = useState([]);
  const [particles, setParticles] = useState([]);
  const [flash, setFlash] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Refs for cleanup
  const timeoutsRef = useRef([]);
  const focusRef = useRef(null);

  // Focus Management
  useEffect(() => { if(focusRef.current) focusRef.current.focus(); }, [gameState]);
  
  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('rc_level', level.toString());
    localStorage.setItem('rc_solved', puzzlesSolved.toString());
  }, [level, puzzlesSolved]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [gameState]);

  const generateDeck = (lvl) => {
    const maxVal = Math.min(Math.floor(lvl / 2) + 3, 5);
    const create = (val, type) => ({
      id: Math.random().toString(36), 
      type, 
      value: val, 
      symbol: '⚛',
      name: `${val} ${type === 'matter' ? 'Matter' : 'Antimatter'}`,
      ariaLabel: val === 1 ? `1 unit of ${type}` : `${val} units of ${type}`
    });
    
    // Ensure odd/even mix
    const cards = [
      create(Math.floor(Math.random() * maxVal) + 1, 'antimatter'),
      create(Math.floor(Math.random() * maxVal) + 1, 'matter'),
      create(Math.floor(Math.random() * maxVal) + 1, Math.random() > 0.5 ? 'matter' : 'antimatter')
    ];
    return cards.sort(() => Math.random() - 0.5);
  };

  const calculateMinMoves = (target, availableCards) => {
    const queue = [{ current: 0, moves: 0 }];
    const visited = new Set(['0']);
    while (queue.length > 0) {
      const { current, moves } = queue.shift();
      if (current === target) return moves;
      for (const card of availableCards) {
        const delta = card.type === 'antimatter' ? -card.value : card.value;
        const next = current + delta;
        if (!visited.has(`${next}`) && Math.abs(next) <= Math.abs(target) + 15 && moves < 8) {
          visited.add(`${next}`);
          queue.push({ current: next, moves: moves + 1 });
        }
      }
    }
    return 1;
  };

  const initLevel = () => {
    const maxVal = Math.min(5, Math.floor(level / 2) + 3);
    const b = Math.floor(Math.random() * (maxVal * 2)) - maxVal;
    const solution = Math.floor(Math.random() * (maxVal * 2)) - maxVal;
    const c = solution + b;

    let newDeck, optimal;
    let attempts = 0;
    do {
      newDeck = generateDeck(level);
      optimal = calculateMinMoves(-b, newDeck);
      attempts++;
    } while (optimal > 6 && attempts < 20);

    setLeftConstant(b);
    setRightValue(c);
    setDeck(newDeck);
    setMinMoves(optimal);
    setMoves(0);
    setMoveHistory([]);
    setUndoAvailable(1);
    setFallingCards([]);
    setParticles([]);
    setStreamingUnits([]);
    setIsAnimating(false);
    setSelectedCardId(null);
    setGameState('playing');
  };

  const handleCardClick = async (card) => {
    if (isAnimating) return;
    
    // Clear any existing timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    
    setIsAnimating(true);
    setSelectedCardId(card.id);
    SoundEngine.effects.cardTap();
    setMoves(m => m + 1);
    setMoveHistory(prev => [...prev, { type: card.type, value: card.value, name: card.name }]);

    // Animations
    const others = deck.filter(c => c.id !== card.id).map((c, i) => ({ id: c.id, delay: i * 100 }));
    setFallingCards(others);
    
    const timeout1 = setTimeout(() => {
      // Streaming
      const streams = [];
      for(let i = 0; i < card.value; i++) {
        streams.push({ id: `L${i}`, side: 'left', type: card.type, symbol: card.symbol, delay: i * 150 });
        streams.push({ id: `R${i}`, side: 'right', type: card.type, symbol: card.symbol, delay: i * 150 });
        const soundTimeout = setTimeout(() => SoundEngine.effects.stream(), i * 150);
        timeoutsRef.current.push(soundTimeout);
      }
      setStreamingUnits(streams);

      const timeout2 = setTimeout(() => {
        // Impact
        setFlash(true);
        const flashTimeout = setTimeout(() => setFlash(false), 200);
        timeoutsRef.current.push(flashTimeout);
        card.type === 'antimatter' ? SoundEngine.effects.antimatterHit() : SoundEngine.effects.matterHit();
        
        setParticles(Array(12).fill(0).map((_, i) => ({
          id: i, x: (Math.random()-0.5)*100, y: (Math.random()-0.5)*100,
          symbol: card.type === 'matter' ? '+' : '−',
          color: card.type === 'matter' ? '#4ade80' : '#f87171'
        })));

        const timeout3 = setTimeout(() => {
          const delta = card.type === 'antimatter' ? -card.value : card.value;
          const newLeft = leftConstant + delta;
          setLeftConstant(l => l + delta);
          setRightValue(r => r + delta);
          
          setStreamingUnits([]);
          setFallingCards([]);
          setSelectedCardId(null);
          setParticles([]);
          setIsAnimating(false);

          // Check if solved
          if (newLeft === 0) {
            SoundEngine.effects.balance();
            const victoryTimeout = setTimeout(() => {
              SoundEngine.effects.victory();
              setGameState('victory');
            }, 1000);
            timeoutsRef.current.push(victoryTimeout);
          }
        }, 300);
        timeoutsRef.current.push(timeout3);
      }, 1500);
      timeoutsRef.current.push(timeout2);
    }, 300);
    timeoutsRef.current.push(timeout1);
  };

  const handleUndo = () => {
    if (moveHistory.length === 0 || isAnimating || undoAvailable <= 0) return;
    SoundEngine.effects.undo();
    const last = moveHistory[moveHistory.length - 1];
    const delta = last.type === 'antimatter' ? last.value : -last.value;
    setLeftConstant(l => l + delta);
    setRightValue(r => r + delta);
    setMoves(m => m - 1);
    setUndoAvailable(u => u - 1);
    setMoveHistory(prev => prev.slice(0, -1));
  };

  const getSymbolicEquation = () => {
    const left = leftConstant === 0 ? 'E' : leftConstant > 0 ? `E + ${leftConstant}` : `E − ${Math.abs(leftConstant)}`;
    return `${left} = ${rightValue}`;
  };

  const handleResetProgress = () => {
    if (window.confirm('Reset all progress? This cannot be undone.')) {
      localStorage.removeItem('rc_level');
      localStorage.removeItem('rc_solved');
      setLevel(1);
      setPuzzlesSolved(0);
    }
  };

  // --- RENDER VIEWS ---

  if (gameState === 'menu') {
    return (
      <div 
        className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex flex-col items-center justify-center p-4 font-sans"
        role="main"
      >
        <div className="text-center mb-8 space-y-6">
          <div className="text-8xl animate-pulse" role="img" aria-label="Reactor Core">⚡</div>
          <h1 className="text-6xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-wider">
            REACTOR CORE
          </h1>
          <p className="text-xl text-cyan-200/60 tracking-widest">ENERGY EQUATION SYSTEM</p>
          
          <button 
            onClick={initLevel} 
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-12 py-5 rounded-2xl text-2xl font-bold shadow-[0_0_30px_rgba(8,145,178,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(8,145,178,0.8)] flex items-center gap-3 mx-auto focus:outline-none focus:ring-4 focus:ring-cyan-400/50"
            ref={focusRef}
            aria-label="Initialize reactor core and start game"
          >
            <Zap className="fill-current" aria-hidden="true" /> INITIALIZE CORE
          </button>

          <div className="flex justify-center gap-8 text-cyan-400/60 font-mono mt-8">
             <div className="flex items-center gap-2" aria-label={`Current level: ${level}`}>
               <Zap size={16} aria-hidden="true" /> LVL {level}
             </div>
             <div className="flex items-center gap-2" aria-label={`Puzzles solved: ${puzzlesSolved}`}>
               <Atom size={16} aria-hidden="true" /> {puzzlesSolved} SOLVED
             </div>
          </div>

          {/* Instructions Panel */}
          <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-6 max-w-lg border-2 border-cyan-400/20 mt-8">
            <div className="text-center mb-4 text-3xl" role="img" aria-label="Reactor">🔋</div>
            <h2 className="text-cyan-300 font-bold text-xl mb-3 text-center">Core Operations:</h2>
            <div className="text-cyan-100/80 space-y-2 text-base text-left">
              <p>• <span className="text-green-400">Matter ⚛ (+)</span> adds positive energy</p>
              <p>• <span className="text-red-400">Antimatter ⚛ (−)</span> adds negative energy</p>
              <p>• <span className="text-yellow-400">E</span> represents unknown energy level</p>
              <p>• Tap any card - streams to BOTH sides!</p>
              <p>• Watch the energy streams collide!</p>
              <p>• Isolate E to balance the reactor</p>
            </div>
          </div>

          {(level > 1 || puzzlesSolved > 0) && (
            <button
              onClick={handleResetProgress}
              className="mt-4 text-cyan-400/40 hover:text-cyan-400/60 text-xs underline transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/50 rounded"
              aria-label="Reset all progress"
            >
              Reset Progress
            </button>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'victory') {
    const stars = moves === minMoves ? 3 : moves === minMoves + 1 ? 2 : 1;
    
    return (
      <div 
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center"
        role="main"
      >
        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 mb-6 drop-shadow-[0_0_15px_rgba(74,222,128,0.3)]">
          REACTOR STABILIZED
        </h1>
        <div className="text-7xl mb-4" role="img" aria-label={`${stars} out of 3 stars earned`}>
          {[1,2,3].map(i => (
            <span key={i} className={i <= stars ? "text-yellow-400 drop-shadow-lg" : "text-slate-800"}>★</span>
          ))}
        </div>
        <p className="text-2xl text-cyan-200 mb-2">{moves} {moves === 1 ? 'operation' : 'operations'}</p>
        {moves === minMoves && (
          <p className="text-lg text-green-400 mb-2">🎯 Optimal efficiency achieved!</p>
        )}
        {moves === minMoves + 1 && (
          <p className="text-lg text-cyan-400 mb-2">✨ Near-optimal performance!</p>
        )}
        {moves > minMoves + 1 && (
          <p className="text-lg text-cyan-300/80 mb-2">💭 Optimal: {minMoves} {minMoves === 1 ? 'operation' : 'operations'}</p>
        )}
        <div className="text-5xl mb-8" role="img" aria-label="Success">⚡</div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => { setLevel(l => l+1); setPuzzlesSolved(p => p+1); initLevel(); }} 
            className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-xl shadow-lg transition-transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-400/50"
            ref={focusRef}
            aria-label="Proceed to next reactor core"
          >
            NEXT CORE
          </button>
          <button 
            onClick={() => setGameState('menu')} 
            className="bg-slate-800 text-cyan-100 px-8 py-4 rounded-xl font-bold text-xl border border-cyan-500/20 hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-cyan-400/30"
            aria-label="Return to main menu"
          >
            MENU
          </button>
        </div>
      </div>
    );
  }

  // PLAYING STATE
  return (
    <div 
      className={`min-h-screen bg-slate-950 p-4 flex flex-col overflow-hidden relative transition-all duration-100 ${flash ? 'brightness-150' : ''}`}
      style={{ fontFamily: "'Orbitron', system-ui, sans-serif" }}
      role="main"
    >
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" aria-hidden="true" />

      {/* Particle Effects Layer */}
      {particles.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-40" aria-hidden="true">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute text-3xl font-bold"
              style={{
                left: '50%',
                top: '50%',
                color: particle.color,
                animation: 'particle 0.8s ease-out forwards',
                '--x': `${particle.x}px`,
                '--y': `${particle.y}px`
              }}
            >
              {particle.symbol}
            </div>
          ))}
        </div>
      )}

      {/* Streaming Units Animation Layer */}
      {streamingUnits.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
          {streamingUnits.map((unit) => (
            <div
              key={unit.id}
              className={`absolute text-4xl ${unit.type === 'matter' ? 'text-green-400' : 'text-red-400'}`}
              style={{
                left: unit.side === 'left' ? '30%' : '70%',
                bottom: '0%',
                animation: `streamUp 1.5s ease-out forwards`,
                animationDelay: `${unit.delay}ms`,
                textShadow: unit.type === 'matter' ? '0 0 10px #4ade80' : '0 0 10px #f87171'
              }}
            >
              {unit.symbol}
            </div>
          ))}
        </div>
      )}

      {/* HEADER */}
      <header className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-cyan-500/30 shadow-lg mb-4">
        <div className="flex items-center gap-3 text-cyan-400">
          <Zap className="fill-current" aria-hidden="true" />
          <span className="text-2xl font-bold" aria-label={`Level ${level}`}>LVL {level}</span>
        </div>
        <div className="font-mono text-cyan-200" aria-label={`Operations used: ${moves}`}>OPS: {moves}</div>
        <button 
          onClick={() => setGameState('menu')} 
          className="bg-slate-800/80 px-4 py-2 rounded-lg text-xs text-cyan-400 border border-cyan-500/20 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          aria-label="Abort mission and return to menu"
        >
          ABORT
        </button>
      </header>

      {/* DASHBOARD ROW: EQUATION + LOG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Equation Display Box */}
        <section 
          className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/20 shadow-lg"
          aria-labelledby="equation-title"
        >
          <h2 id="equation-title" className="text-cyan-500 text-xs font-bold flex items-center gap-2 mb-2 uppercase tracking-wider">
            <Calculator size={14} aria-hidden="true" /> Equation Protocol
          </h2>
          <div className="bg-slate-950/80 rounded-lg p-3 border border-cyan-900/50 text-center">
            <span className="text-xl md:text-2xl font-mono text-cyan-100 tracking-wide" aria-label={`Current equation: ${getSymbolicEquation()}`}>
              {getSymbolicEquation()}
            </span>
          </div>
        </section>

        {/* Operation Log Box */}
        <section 
          className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/20 shadow-lg"
          aria-labelledby="log-title"
        >
          <h2 id="log-title" className="text-cyan-500 text-xs font-bold flex items-center gap-2 mb-2 uppercase tracking-wider">
            <ScrollText size={14} aria-hidden="true" /> System Log
          </h2>
          <div className="bg-slate-950/80 rounded-lg p-2 h-14 overflow-hidden border border-cyan-900/50 flex flex-col justify-center">
            {moveHistory.length === 0 ? (
              <span className="text-slate-600 text-xs text-center italic">No operations recorded...</span>
            ) : (
              <div className="flex gap-2 overflow-x-auto px-2" role="list" aria-label="Recent operations">
                {moveHistory.slice().reverse().map((m, i) => (
                  <span 
                    key={i} 
                    className={`text-xs px-2 py-1 rounded border ${m.type === 'matter' ? 'bg-green-900/30 border-green-700/50 text-green-300' : 'bg-red-900/30 border-red-700/50 text-red-300'}`}
                    role="listitem"
                    aria-label={`Operation ${moveHistory.length - i}: ${m.name}`}
                  >
                    {m.type === 'matter' ? '+' : '-'}{m.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* MAIN VISUAL CORE */}
      <section 
        className="flex-1 flex items-center justify-center mb-4 relative"
        aria-labelledby="reactor-title"
      >
        <h2 id="reactor-title" className="sr-only">Reactor Core Equation Visualization</h2>
        <div className="w-full max-w-5xl bg-slate-900/40 backdrop-blur-sm rounded-3xl p-6 md:p-12 border-2 border-cyan-500/20 shadow-[0_0_50px_-10px_rgba(8,145,178,0.1)]">
          <div className="flex items-center justify-between text-3xl md:text-6xl">
            {/* Left Side */}
            <div 
              className="flex-1 flex justify-end items-center gap-4 min-h-[100px]"
              role="region"
              aria-label={`Left side: E ${leftConstant !== 0 ? (leftConstant > 0 ? `plus ${leftConstant}` : `minus ${Math.abs(leftConstant)}`) : ''}`}
            >
              <span className="text-yellow-400 font-bold drop-shadow-[0_0_15px_rgba(250,204,21,0.6)] animate-pulse" aria-label="Unknown energy E">E</span>
              {leftConstant !== 0 && (
                <>
                  <span className="text-cyan-500 font-light" aria-hidden="true">{leftConstant > 0 ? '+' : '−'}</span>
                  <div className="scale-75 md:scale-100 transition-all"><UnitGrid value={leftConstant} /></div>
                </>
              )}
            </div>

            {/* Equals */}
            <div className="px-4 md:px-12 text-cyan-400" aria-label="equals">=</div>

            {/* Right Side */}
            <div 
              className="flex-1 flex justify-start items-center min-h-[100px]"
              role="region"
              aria-label={`Right side: ${rightValue}`}
            >
               <div className="scale-75 md:scale-100 transition-all"><UnitGrid value={rightValue} /></div>
            </div>
          </div>
        </div>
      </section>

      {/* CARD BANK */}
      <section 
        className="bg-slate-900/80 backdrop-blur-md rounded-t-3xl p-6 border-t border-cyan-500/30 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]"
        aria-labelledby="cards-title"
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-end mb-4">
            <h3 id="cards-title" className="text-cyan-400 text-sm font-bold tracking-[0.2em] flex items-center gap-2">
              <Atom size={16} className="animate-spin-slow" aria-hidden="true" /> ENERGY CARDS
            </h3>
            <button 
              onClick={handleUndo} 
              disabled={moveHistory.length === 0 || isAnimating || undoAvailable <= 0} 
              className={`text-xs flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 rounded px-2 py-1 ${
                moveHistory.length > 0 && !isAnimating && undoAvailable > 0
                  ? 'text-purple-300 hover:text-purple-200 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed opacity-50'
              }`}
              aria-label={`Time warp, ${undoAvailable} remaining. Undo last operation.`}
            >
              <RotateCcw size={12} aria-hidden="true" /> TIME WARP ({undoAvailable})
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-3 md:gap-6" role="list" aria-label="Available energy cards">
            {deck.map((card) => {
              const isFalling = fallingCards.some(fc => fc.id === card.id);
              const delay = fallingCards.find(fc => fc.id === card.id)?.delay || 0;
              const isSelected = selectedCardId === card.id;

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  disabled={isAnimating}
                  style={{ animationDelay: `${delay}ms` }}
                  className={`
                    relative group transition-all duration-200 active:scale-95
                    h-28 md:h-36 rounded-xl border-2 overflow-hidden
                    focus:outline-none focus:ring-4 focus:ring-cyan-400
                    ${isFalling ? 'animate-fallDown pointer-events-none' : ''}
                    ${isSelected ? 'ring-4 ring-cyan-400 scale-105 z-10' : 'hover:-translate-y-1 hover:shadow-xl'}
                    ${card.type === 'matter' 
                      ? 'bg-gradient-to-br from-green-900/80 to-slate-900 border-green-500/50 shadow-green-500/10' 
                      : 'bg-gradient-to-br from-red-900/80 to-slate-900 border-red-500/50 shadow-red-500/10'}
                  `}
                  role="listitem"
                  aria-label={card.ariaLabel}
                >
                  {/* Badge */}
                  <div className={`absolute top-0 right-0 px-2 py-1 rounded-bl-lg font-bold text-sm ${card.type === 'matter' ? 'bg-green-500 text-green-950' : 'bg-red-500 text-red-950'}`} aria-hidden="true">
                    {card.value}
                  </div>
                  
                  {/* Symbol Grid */}
                  <div className="h-full flex flex-col items-center justify-center p-2">
                    <div className={`grid gap-1 ${card.type === 'matter' ? 'text-green-400' : 'text-red-400'}`}
                         style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(card.value))}, 1fr)`, fontSize: card.value === 1 ? '2rem' : '1rem' }}
                         aria-hidden="true">
                      {Array(card.value).fill(0).map((_, i) => <span key={i} className="leading-none drop-shadow-md">⚛</span>)}
                    </div>
                    <div className={`mt-2 text-xs uppercase font-bold tracking-wider ${card.type === 'matter' ? 'text-green-200' : 'text-red-200'}`} aria-hidden="true">
                      {card.type}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes streamUp { 0% { transform: translateY(0); opacity:1; } 100% { transform: translateY(-400px) scale(0.5); opacity:0; } }
        @keyframes fallDown { 0% { transform:translateY(0); opacity:1; } 100% { transform:translateY(200px) rotate(10deg); opacity:0; } }
        @keyframes particle { 0% { transform:translate(0,0) scale(1); } 100% { transform:translate(var(--x), var(--y)) scale(0); } }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
      `}</style>
    </div>
  );
}