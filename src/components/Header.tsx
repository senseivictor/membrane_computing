import React from 'react';

function Header() {
  return (
    <>
      <header>
        <h1>P-System Membrane Visualizer <span>Membrane Computing — Păun 1998</span></h1>
        <div className="sep"></div>
      
        <button className="hbtn primary" id="btnOpenConfig" style={{background: "#059669", borderColor: "#059669", fontWeight: "600"}}>⚡ Configure &amp; Run</button>
        <button className="hbtn" id="btnQuickRun" title="Re-run live simulation with current objects">↺ Re-run</button>
        <div className="sep"></div>
      
        <button className="hbtn primary" id="btnPlay">▶ Play</button>
        <button className="hbtn" id="btnPause" disabled>⏸ Pause</button>
        <button className="hbtn" id="btnPrev">◀ Prev</button>
        <button className="hbtn" id="btnNext">Next ▶</button>
        <button className="hbtn danger" id="btnReset">↺ Reset</button>
      
        <div className="speed-wrap">
          <label>Speed</label>
          <input type="range" id="speedSlider" min="1" max="10" defaultValue="4" />
          <span id="speedVal">1.5s</span>
        </div>
      </header>
    </>
  );
}

export default Header;
