import React from 'react';

function Timeline() {
  return (
    <>
      <div className="scrubber-bar">
        <span id="stepLabel">Step — / —</span>
        <input type="range" id="scrubber" min="0" max="0" defaultValue="0" />
      </div>
    </>
  );
}

export default Timeline;
