import React, { useEffect, useMemo, useRef, useState } from 'react';

type Cell = { chosen: string[]; remaining: string[]; x: number; y: number; parentX?: number; parentY?: number; radius: number };
const initialLevels = (items: string[]): Cell[][] => [[{ chosen: [], remaining: items, x: 0, y: 0, radius: 42 }]];

export default function DivisionExplorer() {
  const [input, setInput] = useState('Chei, Telefon, Laptop');
  const [items, setItems] = useState(['Chei', 'Telefon', 'Laptop']);
  const [step, setStep] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useMemo(() => {
    const result = initialLevels(items);
    for (let depth = 0; depth < step; depth++) {
      const current = result[depth] ?? [];
      result.push(current.flatMap(cell => {
        const choice = items[depth];
        const remaining = cell.remaining.slice(1);
        return [
          { chosen: [...cell.chosen, choice], remaining, x: 0, y: 0, parentX: cell.x, parentY: cell.y, radius: 42 },
          { chosen: [...cell.chosen], remaining, x: 0, y: 0, parentX: cell.x, parentY: cell.y, radius: 42 },
        ];
      }));
    }
    const width = 1100, height = 600;
    result.forEach((cells, depth) => cells.forEach((cell, index) => {
      cell.x = width / (items.length + 1) * (depth + 0.5);
      cell.y = height / (cells.length + 1) * (index + 1);
      cell.radius = cells.length > 16 ? 16 : cells.length > 8 ? 24 : cells.length > 4 ? 32 : 42;
    }));
    return result;
  }, [items, step]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    levels.slice(1).forEach(cells => cells.forEach(cell => {
      ctx.beginPath(); ctx.moveTo(cell.parentX ?? cell.x, cell.parentY ?? cell.y); ctx.lineTo(cell.x, cell.y);
      ctx.strokeStyle = '#334155'; ctx.stroke();
    }));
    levels.forEach((cells, depth) => cells.forEach(cell => {
      ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.radius, 0, Math.PI * 2);
      ctx.fillStyle = depth === step ? '#1e293b' : '#0f172a'; ctx.strokeStyle = depth === step ? '#38bdf8' : '#475569'; ctx.lineWidth = depth === step ? 2.5 : 1.5; ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${Math.max(7, cell.radius * 0.26)}px sans-serif`;
      const label = cell.chosen.length ? cell.chosen.join('+') : '∅';
      ctx.fillText(cell.radius >= 24 ? (label || 'GOL') : cell.chosen.map(item => item[0]).join('') || '∅', cell.x, cell.y + 3);
      if (cell.radius >= 24) { ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.max(8, cell.radius * 0.24)}px sans-serif`; ctx.fillText('Membrană', cell.x, cell.y - cell.radius * 0.35); }
    }));
  }, [levels, step]);

  function applyItems() {
    const parsed = input.split(',').map(item => item.trim()).filter(Boolean);
    if (!parsed.length) return;
    setItems(parsed); setStep(0);
  }

  return <main style={{ minHeight: '100vh', background: '#121826', color: '#e2e8f0', padding: 20, fontFamily: 'Segoe UI, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
    <h1 style={{ margin: 0, color: '#38bdf8' }}>Simularea Diviziunii Celulare 2D (Sistem P)</h1>
    <p style={{ margin: 0, color: '#94a3b8' }}>Adaugă obiecte și urmărește generarea arborelui combinațiilor.</p>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <label htmlFor="objects">Obiecte (separate prin virgulă):</label>
      <input id="objects" value={input} onChange={event => setInput(event.target.value)} style={{ padding: 9, width: 280 }} />
      <button onClick={applyItems}>Aplică obiectele</button>
      <button onClick={() => setStep(value => Math.min(value + 1, items.length))} disabled={step >= items.length}>Pasul următor →</button>
      <button onClick={() => setStep(0)}>Resetare</button>
    </div>
    <p style={{ background: '#1e293b', padding: '12px 20px', borderRadius: 8, width: 'min(1100px, 100%)', textAlign: 'center' }}>
      {step < items.length ? <>Pasul {step}: decizie pentru <strong>{items[step]}</strong> · {levels[step]?.length ?? 0} celule</> : <>Complet · {levels[step]?.length ?? 0} combinații paralele generate</>}
    </p>
    <div style={{ width: 'min(1100px, 100%)', overflowX: 'auto', background: '#0f172a', borderRadius: 16, border: '1px solid #334155' }}>
      <canvas ref={canvasRef} width={1100} height={600} style={{ display: 'block' }} />
    </div>
  </main>;
}
