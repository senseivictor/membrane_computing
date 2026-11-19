import React from 'react';

function EventLogAndWorkspace() {
  return (
    <>
      <div className="workspace">
        {/* Event log */}
        <div className="log-col">
          <div id="gardenResult" className="garden-result" hidden></div>
          <div className="panel-title">Event Log</div>
          <div className="log-body" id="logBody"></div>
        </div>
      
        {/* Main canvas */}
        <div className="canvas-col">
          <canvas id="mainCanvas"></canvas>
        </div>
      
        {/* Full-screen cell view (hidden until cell clicked) */}
        <div className="detail-col" id="detailCol">
          <div className="detail-inner">
            <div className="detail-header">
              <span className="detail-title" id="detailTitle">Membrane</span>
              <div className="detail-step-control">
                <label htmlFor="scrubberDetail">Step</label>
                <input type="range" id="scrubberDetail" min="0" max="0" defaultValue="0" />
                <span id="stepLabelDetail">0 / 0</span>
              </div>
              <div className="object-size-wrap detail-object-size">
                <label htmlFor="objectSizeDetail">Objects</label>
                <input type="range" id="objectSizeDetail" min="50" max="200" step="10" defaultValue="100" />
                <span id="objectSizeDetailValue">100%</span>
              </div>
              <button className="close-btn" id="detailClose" aria-label="Back to membrane overview" title="Back to membrane overview">✕</button>
            </div>
            <div className="detail-canvas-wrap">
              <canvas id="detailCanvas" width="276" height="200"></canvas>
            </div>
            <div className="detail-scroll" id="detailScroll">
              <div className="detail-section" id="detailObjects"></div>
              <div className="detail-section" id="detailRules"></div>
              <div className="ev-hist" id="detailHistory"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default EventLogAndWorkspace;
