import React from 'react';

function ConfigurationDialog() {
  return (
    <>
      <div className="modal-overlay" id="configModal">
        <div className="modal-card">
          <div className="modal-header">
            <h2><span>⚙</span> Configure Objects &amp; Simulation Parameters</h2>
            <button className="close-btn" id="btnCloseConfig">✕</button>
          </div>
          <div className="modal-body">
            {/* Items table */}
            <div className="cfg-sec">
              <div className="cfg-sec-title">
                <span>Candidate Objects / Items (Knapsack)</span>
                <div style={{display: "flex", gap: "6px"}}>
                  <button className="btn-small" id="btnAddProp">+ Add Property</button>
                  <button className="btn-small" id="btnAddItem">+ Add Item</button>
                </div>
              </div>
              <div style={{overflowX: "auto"}}>
                <table className="cfg-table" id="itemsTable">
                  <thead id="itemsTableHead"></thead>
                  <tbody id="itemsTableBody"></tbody>
                </table>
              </div>
              <div id="gardenHelp" className="garden-help" hidden>
                Each vegetable is one planting lot. Profit is yield × sell price − purchase and growing costs. Crops grow concurrently, so harvest time is the slowest selected crop. The preset picks highest profit, then the fastest harvest. Sample figures are editable; internally each space token represents 10 m², so the limit of 20 tokens is 200 m².
              </div>
            </div>
      
            {/* Constraints section */}
            <div className="cfg-sec">
              <div className="cfg-sec-title">
                <span>Filter Constraints (Evaluator Rules)</span>
                <button className="btn-small" id="btnAddConstraint">+ Add Constraint</button>
              </div>
              <div id="constraintsList"></div>
            </div>
      
            {/* Quick presets */}
            <div className="cfg-sec">
              <div className="cfg-sec-title"><span>Quick Presets</span></div>
              <div className="preset-pills">
                <button className="preset-btn" id="preset3">Standard (3 Items, W≤5)</button>
                <button className="preset-btn" id="preset4">4 Items (16 Membranes, W≤6)</button>
                <button className="preset-btn" id="presetMulti">3 Properties (W+Cost+Vol)</button>
                <button className="preset-btn" id="presetGreenhouse">Greenhouse Profit (6 Vegetables, ≤200 m²)</button>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <div className="info-chip" id="cfgMemEstimate">3 items → 8 parallel membranes</div>
            <div style={{display: "flex", gap: "8px"}}>
              <button className="hbtn" id="btnCancelConfig">Cancel</button>
              <button className="hbtn primary" id="btnRunConfig" style={{background: "#059669", borderColor: "#059669", fontWeight: "600"}}>⚡ Run Simulation</button>
            </div>
          </div>
        </div>
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════════ */}
    </>
  );
}

export default ConfigurationDialog;
