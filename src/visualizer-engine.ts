// @ts-nocheck
export function initVisualizer() {

"use strict";

// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    this.moveTo(x+r, y);
    this.lineTo(x+w-r, y); this.arcTo(x+w, y, x+w, y+r, r);
    this.lineTo(x+w, y+h-r); this.arcTo(x+w, y+h, x+w-r, y+h, r);
    this.lineTo(x+r, y+h); this.arcTo(x, y+h, x, y+h-r, r);
    this.lineTo(x, y+r); this.arcTo(x, y, x+r, y, r);
    this.closePath();
  };
}

// ══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIG — dynamic, metadata-driven
// ══════════════════════════════════════════════════════════════════════════

// Fixed semantic tokens
const SEMANTIC = {
  color: {
    eval:     '#a855f7',
    solution: '#eab308',
    SAFE:     '#10b981',
    'δ':      '#ef4444',
  },
  label: {
    eval:     '⚖',
    solution: '★',
    SAFE:     '🛡',
    'δ':      'δ',
  }
};

// Property token palette — assigned dynamically as new properties appear
const PROP_PALETTE = [
  '#64748b',  // slate   — weight
  '#f59e0b',  // amber   — cost
  '#14b8a6',  // teal    — volume
  '#ec4899',  // pink    — 4th property
  '#8b5cf6',  // violet  — 5th property
  '#06b6d4',  // cyan    — 6th property
];
const PROP_ICONS = ['⚖','$','📦','♻','⚡','🔷'];
const propColorMap = {};   // property name → color
const propLabelMap = {};   // property name → short label
let enzymePositionMap = {};
let   propPaletteIdx = 0;

function registerProperty(name) {
  if (!propColorMap[name]) {
    const normalized = name.trim().toLowerCase();
    const semanticStyle = normalized === 'weight' || normalized === 'mass'
      ? { color: '#64748b', icon: '⚖' }
      : ['value', 'val', 'cost', 'price'].includes(normalized)
        ? { color: '#f59e0b', icon: '$' }
        : ['volume', 'vol'].includes(normalized)
          ? { color: '#14b8a6', icon: '📦' }
          : ['time', 'duration'].includes(normalized)
            ? { color: '#ec4899', icon: '◷' }
            : null;
    if (semanticStyle) {
      propColorMap[name] = semanticStyle.color;
      propLabelMap[name] = semanticStyle.icon;
    } else {
      const idx = propPaletteIdx++;
      propColorMap[name] = PROP_PALETTE[idx % PROP_PALETTE.length];
      propLabelMap[name] = PROP_ICONS[idx % PROP_ICONS.length];
    }
  }
}

function isPropertyToken(key) {
  return !key.startsWith('d_') && !key.startsWith('enzyme_') && !(key in SEMANTIC.color);
}

function objColor(key) {
  if (key.startsWith('d_'))   return '#f59e0b';
  if (key.startsWith('enzyme_')) return '#06b6d4';
  if (key in SEMANTIC.color)  return SEMANTIC.color[key];
  // Property token
  registerProperty(key);
  return propColorMap[key];
}

function objLabel(key) {
  if (key.startsWith('d_'))   return 'D' + key.split('_')[1];
  if (key.startsWith('enzyme_')) {
    const separator = key.lastIndexOf('_');
    const property = key.slice('enzyme_'.length, separator);
    return `E${property.charAt(0).toUpperCase()}${key.slice(separator + 1)}`;
  }
  if (key in SEMANTIC.label)  return SEMANTIC.label[key];
  // Property token: short label
  registerProperty(key);
  return propLabelMap[key] || key[0].toUpperCase();
}

// Particle size: property tokens are smaller than choice/semantic markers
function objRadius(key) {
  if (key === 'eval' || key === 'solution' || key === 'SAFE' || key === 'δ' || key.startsWith('enzyme_')) return 13;
  if (key.startsWith('d_'))                            return 12;
  return 8;  // property tokens — small, like atoms
}

// ══════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════
let simData    = null;   // loaded JSON
let curStep    = 0;
let animT      = 1.0;    // 0..1 within-step animation
let playing    = false;
let lastTs     = null;
let stepDurMs  = 1500;

let selectedId = null;   // selected membrane mem_id
let objectSizeScale = 1;

// Per-membrane physics: memId → {particles: Particle[]}
const physics = {};

// Layout cache: stepIdx → {memId: {x,y,r}}
const layoutCache = {};

// Active animations
let ruleAnims = [];  // rule-fire animations

// Hover state
let hoverMemId = null;

// ══════════════════════════════════════════════════════════════════════════
// CANVAS SETUP
// ══════════════════════════════════════════════════════════════════════════
const canvas   = document.getElementById('mainCanvas');
const ctx      = canvas.getContext('2d');
const dctx     = document.getElementById('detailCanvas').getContext('2d');

function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}
window.addEventListener('resize', () => {
  resizeCanvas();
  layoutCache.length = 0;
  if (selectedId) {
    resizeDetailCanvas();
    drawDetailCanvas();
  }
});
resizeCanvas();

// ══════════════════════════════════════════════════════════════════════════
// LIVE P-SYSTEM ENGINE & CONFIGURATION STATE
// ══════════════════════════════════════════════════════════════════════════

let currentConfig = {
  items: [
    { weight: 2, cost: 3 },
    { weight: 3, cost: 4 },
    { weight: 4, cost: 5 }
  ],
  constraints: {
    weight: { max: 5 }
  },
  properties: ["weight", "cost"],
  itemNames: null,
  modelProperties: null,
  preset: null
};

// Pure JavaScript P-System simulation engine (faithful to Păun's active membrane model)
function runSimulationFromConfig(items, constraints, itemNames = [], modelProperties = null, preset = null) {
  let idCounter = 0;
  function nextId(label) {
    idCounter++;
    return `${label}#${idCounter}`;
  }

  const deltaObject = String.fromCharCode(0x03b4);
  const enzymeKey = (property, count) => `enzyme_${property}_${count}`;
  const constraintSpecs = Object.entries(constraints)
    .filter(([, condition]) => condition.min != null || condition.max != null)
    .map(([property, condition]) => {
    const min = condition.min == null ? null : Math.ceil(Number(condition.min));
    const max = condition.max == null ? null : Math.floor(Number(condition.max));
    const capacity = max != null ? Math.max(1, max + 1) : Math.max(0, min || 0);
    return {
      property,
      min,
      max,
      capacity,
      metKey: `met_${property}`,
      states: Array.from({ length: capacity + 1 }, (_, count) => enzymeKey(property, count))
    };
  });
  enzymePositionMap = Object.fromEntries(constraintSpecs.map((spec, index) => {
    const angle = constraintSpecs.length > 1
      ? (Math.PI * 2 * index / constraintSpecs.length) - Math.PI / 2
      : 0;
    return [spec.property, { x: Math.cos(angle), y: Math.sin(angle) }];
  }));
  const bindingRules = [];
  const bindingRulesByState = new Map();
  constraintSpecs.forEach(spec => {
    for (let count = 0; count < spec.capacity; count++) {
      const finalBinding = spec.max != null && count + 1 === spec.capacity;
      const nextKey = enzymeKey(spec.property, count + 1);
      const remainingMinimum = spec.min == null ? 0 : Math.max(0, spec.min - count);
      const minimumKey = remainingMinimum > 0 ? `need_${spec.property}_${remainingMinimum}` : spec.metKey;
      const nextMinimumKey = remainingMinimum > 1 ? `need_${spec.property}_${remainingMinimum - 1}` : spec.metKey;
      const rhs = { [nextKey]: 1 };
      if (!finalBinding) rhs[nextMinimumKey] = 1;
      if (finalBinding) rhs[deltaObject] = 1;
      const rule = {
        name: `Enzyme_Binding_${spec.property}_${count}`,
        type: "evolution",
        lhs: { [enzymeKey(spec.property, count)]: 1, [spec.property]: 1, [minimumKey]: 1 },
        rhs,
        target: "here",
        applies_to: "gen",
        description: finalBinding
          ? `${spec.property} enzyme reached capacity ${spec.capacity} and emitted ${deltaObject}.`
          : `${spec.property} token bound to its enzyme.`
      };
      bindingRules.push(rule);
      bindingRulesByState.set(enzymeKey(spec.property, count), rule);
    }
  });
  const checkRulesByState = new Map();
  constraintSpecs.forEach(spec => {
    checkRulesByState.set(spec.metKey, {
      name: `Check_${spec.property}_Minimum_Met`, type: "evolution",
      lhs: { [spec.metKey]: 1, [`check_${spec.property}`]: 1 },
      rhs: { [spec.metKey]: 1, [`valid_${spec.property}`]: 1 }, target: "here", applies_to: "gen"
    });
    for (let remaining = 1; remaining <= (spec.min || 0); remaining++) {
      const needKey = `need_${spec.property}_${remaining}`;
      checkRulesByState.set(needKey, {
        name: `Check_${spec.property}_Minimum_Missing_${remaining}`, type: "evolution",
        lhs: { [needKey]: 1, [`check_${spec.property}`]: 1 },
        rhs: { [needKey]: 1, [deltaObject]: 1 }, target: "here", applies_to: "gen"
      });
    }
  });
  const constraintSignalsRule = {
    name: "Start_Constraint_Checks", type: "evolution", lhs: { eval: 1 },
    rhs: Object.fromEntries([
      ...constraintSpecs.map(spec => [`check_${spec.property}`, 1]),
      ...(constraintSpecs.length ? [["final_check", 1]] : [["SAFE", 1]])
    ]), target: "here", applies_to: "gen"
  };
  const acceptRule = {
    name: "Accept_Valid_Subset", type: "evolution",
    lhs: Object.fromEntries([["final_check", 1], ...constraintSpecs.map(spec => [`valid_${spec.property}`, 1])]),
    rhs: { SAFE: 1 }, target: "here", applies_to: "gen"
  };
  function ruleApplies(mem, rule) {
    return Object.entries(rule.lhs).every(([object, count]) => (mem.objects[object] || 0) >= count);
  }
  function applyRule(mem, rule, events) {
    if (!ruleApplies(mem, rule)) return false;
    Object.entries(rule.lhs).forEach(([object, count]) => {
      mem.objects[object] -= count;
      if (mem.objects[object] === 0) delete mem.objects[object];
    });
    const destination = rule.target === "out" && mem.parent ? mem.parent : mem;
    Object.entries(rule.rhs).forEach(([object, count]) => {
      destination.objects[object] = (destination.objects[object] || 0) + count;
    });
    events.push({
      event: "rule_fired", rule: rule.name, membrane_id: mem.id, membrane_label: mem.label,
      consumed: rule.lhs, produced: rule.rhs, target: rule.target, description: rule.description
    });
    return true;
  }
  const initialEnzymes = {};
  constraintSpecs.forEach(spec => {
    initialEnzymes[enzymeKey(spec.property, 0)] = 1;
    const initialMinimumKey = spec.min > 0 ? `need_${spec.property}_${spec.min}` : spec.metKey;
    initialEnzymes[initialMinimumKey] = 1;
  });

  // 1. Setup skin and initial gen membrane
  const skin = {
    id: nextId("skin"),
    label: "skin",
    parent: null,
    children: [],
    objects: {},
    alive: true,
    slotIdx: 0,
    slotCount: 1
  };
  const gen0 = {
    id: nextId("gen"),
    label: "gen",
    parent: skin,
    children: [],
    objects: { "d_1": 1, ...initialEnzymes },
    alive: true,
    slotIdx: 0,
    slotCount: 1
  };
  skin.children.push(gen0);

  const n = items.length;
  const allItemProps = Array.from(new Set(items.flatMap(it => Object.keys(it))));
  const simulationProps = modelProperties || allItemProps;
  const allProps = Array.from(new Set([...simulationProps, ...constraintSpecs.map(spec => spec.property)])).sort();
  const contributionFor = (item, property) => {
    if (preset === 'greenhouse' && property === 'space') return Math.ceil((Number(item.space) || 0) / 10);
    return Number(item[property]) || 0;
  };

  // Snapshot helper — preserves slotIdx, slotCount and alive status
  function snapshotTree(node) {
    return {
      id: node.id,
      label: node.label,
      slotIdx: node.slotIdx !== undefined ? node.slotIdx : 0,
      slotCount: node.slotCount !== undefined ? node.slotCount : 1,
      alive: node.alive !== false,
      dna: node.dna ? [...node.dna] : (typeof extractDna === 'function' ? extractDna(node) : []),
      objects: Object.assign({}, node.objects),
      children: (node.children || []).map(snapshotTree)
    };
  }

  const history = [];
  // Step 0: Initial State
  history.push({
    step: 0,
    title: "Initial State",
    events: [],
    tree: snapshotTree(skin)
  });

  // Collect living membranes helper
  function getLiving(node) {
    if (!node.alive) return [];
    let list = [node];
    for (const c of node.children) {
      list = list.concat(getLiving(c));
    }
    return list;
  }

  // Phase 1: Division steps (1 per item)
  for (let idx = 0; idx < n; idx++) {
    const num = idx + 1;
    const trigger = `d_${num}`;
    const nxt = (num === n) ? "eval" : `d_${num + 1}`;
    const item = items[idx];
    const events = [];

    // All currently living gen membranes containing the trigger object
    const living = getLiving(skin).filter(m => m.alive && m.label === "gen" && (m.objects[trigger] || 0) >= 1);
    const nextSlotCount = Math.pow(2, num);

    living.forEach(mem => {
      // Base objects minus trigger
      const baseObjs = Object.assign({}, mem.objects);
      delete baseObjs[trigger];

      // Daughter A (yes) — include this item & add its unary property tokens
      const aObjs = Object.assign({}, baseObjs);
      aObjs[nxt] = (aObjs[nxt] || 0) + 1;
      for (const p of simulationProps) {
        const amount = contributionFor(item, p);
        if (amount) aObjs[p] = (aObjs[p] || 0) + amount;
      }

      // Daughter B (no) — skip this item (no property tokens)
      const bObjs = Object.assign({}, baseObjs);
      bObjs[nxt] = (bObjs[nxt] || 0) + 1;

      // Inherit and extend DNA chromosome
      const pDna = mem.dna || [];
      const itemName = itemNames[num - 1] || `Item ${num}`;
      const daDna = pDna.concat([{ item: num, name: itemName, choice: true, label: `✓${itemName}` }]);
      const dbDna = pDna.concat([{ item: num, name: itemName, choice: false, label: `✗${itemName}` }]);

      const pSlot = mem.slotIdx !== undefined ? mem.slotIdx : 0;

      const da = {
        id: nextId("gen"),
        label: "gen",
        parent: mem.parent,
        children: [],
        objects: aObjs,
        dna: daDna,
        slotIdx: pSlot * 2,
        slotCount: nextSlotCount,
        alive: true
      };
      const db = {
        id: nextId("gen"),
        label: "gen",
        parent: mem.parent,
        children: [],
        objects: bObjs,
        dna: dbDna,
        slotIdx: pSlot * 2 + 1,
        slotCount: nextSlotCount,
        alive: true
      };

      // Replace mem with daughters in parent
      const pIdx = mem.parent.children.indexOf(mem);
      if (pIdx !== -1) {
        mem.parent.children.splice(pIdx, 1, da, db);
      }
      mem.alive = false;

      events.push({
        event: "membrane_divided",
        parent_id: mem.id,
        parent_label: mem.label,
        daughter_a_id: da.id,
        daughter_b_id: db.id,
        daughter_a_objects: Object.assign({}, aObjs),
        daughter_b_objects: Object.assign({}, bObjs)
      });
    });

    history.push({
      step: num,
      title: `Division (Item ${num})`,
      events: events,
      tree: snapshotTree(skin)
    });
  }

  // Phase 2: Run compiled multiset binding and constraint-check rules.
  let stepNumber = n;
  let bindingRound = 0;
  const evalLiving = () => getLiving(skin).filter(mem => mem.label === "gen" && ruleApplies(mem, { lhs: { eval: 1 } }));

  while (true) {
    const roundEvents = [];
    evalLiving().forEach(mem => constraintSpecs.forEach(spec => {
      const stateKey = spec.states.find(key => (mem.objects[key] || 0) > 0);
      const rule = bindingRulesByState.get(stateKey);
      if (rule) applyRule(mem, rule, roundEvents);
    }));
    if (roundEvents.length === 0) break;
    bindingRound++;
    stepNumber++;
    history.push({
      step: stepNumber,
      title: `Enzyme Binding - Round ${bindingRound}`,
      events: roundEvents,
      tree: snapshotTree(skin)
    });
  }

  const signalEvents = [];
  evalLiving().forEach(mem => applyRule(mem, constraintSignalsRule, signalEvents));
  stepNumber++;
  history.push({ step: stepNumber, title: "Constraint Signals", events: signalEvents, tree: snapshotTree(skin) });

  const checkEvents = [];
  getLiving(skin).filter(mem => mem.label === "gen").forEach(mem => constraintSpecs.forEach(spec => {
    const markerKeys = [spec.metKey, ...Array.from({ length: spec.min || 0 }, (_, index) => `need_${spec.property}_${index + 1}`)];
    const markerKey = markerKeys.find(key => (mem.objects[key] || 0) > 0);
    const rule = checkRulesByState.get(markerKey);
    if (rule) applyRule(mem, rule, checkEvents);
  }));
  stepNumber++;
  history.push({ step: stepNumber, title: "Constraint Rule Checks", events: checkEvents, tree: snapshotTree(skin) });

  const acceptanceEvents = [];
  getLiving(skin).filter(mem => mem.label === "gen").forEach(mem => applyRule(mem, acceptRule, acceptanceEvents));
  stepNumber++;
  history.push({ step: stepNumber, title: "Accept Valid Subsets", events: acceptanceEvents, tree: snapshotTree(skin) });

  // Phase 3: The P-system dissolution action is triggered by the delta object.
  const destrEvents = [];
  const actionLiving = getLiving(skin).filter(mem => mem.label === "gen");
  const solutionRule = {
    name: "Send_Solution_Out", type: "evolution", lhs: { SAFE: 1 }, rhs: { solution: 1 },
    target: "out", applies_to: "gen"
  };
  actionLiving.forEach(mem => {
    if (mem.objects[deltaObject]) {
      delete mem.objects[deltaObject];
      mem.alive = false;
      const releasedObjects = { ...mem.objects };
      Object.entries(releasedObjects).forEach(([object, count]) => {
        skin.objects[object] = (skin.objects[object] || 0) + count;
      });
      if (mem.parent) {
        const membraneIndex = mem.parent.children.indexOf(mem);
        if (membraneIndex !== -1) mem.parent.children.splice(membraneIndex, 1);
      }
      destrEvents.push({
        event: "membrane_dissolved", membrane_id: mem.id, membrane_label: mem.label,
        rule: "Cell_Dissolution (delta)", objects_released: releasedObjects,
        description: "The delta object dissolved this membrane; its remaining objects moved to the parent region."
      });
    } else {
      applyRule(mem, solutionRule, destrEvents);
      const accepted = destrEvents.some(event => event.membrane_id === mem.id && event.rule === solutionRule.name);
      if (accepted) destrEvents[destrEvents.length - 1].description = "Valid subset accepted; solution sent to the parent region.";
    }
  });
  stepNumber++;
  history.push({ step: stepNumber, title: "Cell Dissolution", events: destrEvents, tree: snapshotTree(skin) });

  let optimizationSummary = null;
  const optimizerRules = [];
  if (preset === 'greenhouse') {
    const compareUnary = (leftCount, rightCount, metric) => {
      const leftKey = `${metric}_left`;
      const rightKey = `${metric}_right`;
      const phaseKey = `${metric}_comparing`;
      const region = { id: `compare_${metric}`, label: 'optimizer', parent: null, children: [], alive: true,
        objects: { [leftKey]: Math.max(0, Math.floor(leftCount)), [rightKey]: Math.max(0, Math.floor(rightCount)), [phaseKey]: 1 } };
      const cancelRule = { name: `Cancel_One_${metric}_Token_Each`, type: 'evolution',
        lhs: { [leftKey]: 1, [rightKey]: 1, [phaseKey]: 1 }, rhs: { [phaseKey]: 1 }, target: 'here', applies_to: 'optimizer' };
      const scratchEvents = [];
      while (applyRule(region, cancelRule, scratchEvents)) scratchEvents.length = 0;
      const leftRule = { name: `Select_Left_On_More_${metric}`, type: 'evolution',
        lhs: { [leftKey]: 1, [phaseKey]: 1 }, rhs: { [`${metric}_left_wins`]: 1 }, target: 'here', applies_to: 'optimizer' };
      const rightRule = { name: `Select_Right_On_More_${metric}`, type: 'evolution',
        lhs: { [rightKey]: 1, [phaseKey]: 1 }, rhs: { [`${metric}_right_wins`]: 1 }, target: 'here', applies_to: 'optimizer' };
      const tieRule = { name: `Continue_On_Equal_${metric}`, type: 'evolution',
        lhs: { [phaseKey]: 1 }, rhs: { [`${metric}_equal`]: 1 }, target: 'here', applies_to: 'optimizer' };
      [cancelRule, leftRule, rightRule, tieRule].forEach(rule => {
        if (!optimizerRules.some(existing => existing.name === rule.name)) optimizerRules.push(rule);
      });
      if (applyRule(region, leftRule, [])) return 'left';
      if (applyRule(region, rightRule, [])) return 'right';
      applyRule(region, tieRule, []);
      return 'equal';
    };

    const validCandidates = getLiving(skin).filter(mem => mem.label === 'gen' && mem.dna);
    const plans = validCandidates.map(mem => {
      const selected = mem.dna.filter(gene => gene.choice).map(gene => gene.item - 1);
      let harvestDays = 0;
      let revenue = 0;
      let cost = 0;
      let totalSpace = 0;
      selected.forEach(index => {
        const item = items[index];
        const timeResult = compareUnary(item.grow_days || 0, harvestDays, 'Harvest_Time');
        if (timeResult === 'left') harvestDays = Number(item.grow_days) || 0;
        revenue += (Number(item.yield_kg) || 0) * (Number(item.sell_price) || 0);
        cost += (Number(item.buy_cost) || 0) + (Number(item.grow_cost) || 0);
        totalSpace += Number(item.space) || 0;
      });
      return {
        membraneId: mem.id,
        itemIds: selected.map(index => index + 1),
        crops: selected.map(index => itemNames[index] || `Item ${index + 1}`),
        space: totalSpace,
        harvestDays,
        revenue,
        cost,
        profit: revenue - cost
      };
    });

    let bestPlans = [];
    plans.forEach(plan => {
      if (!bestPlans.length) { bestPlans = [plan]; return; }
      const incumbent = bestPlans[0];
      // Compare profits by cross-adding nonnegative revenue and cost tallies,
      // then use a reversed time comparison so the shorter harvest wins.
      const profitResult = compareUnary(plan.revenue + incumbent.cost, incumbent.revenue + plan.cost, 'Net_Profit');
      if (profitResult === 'left') bestPlans = [plan];
      else if (profitResult === 'equal') {
        const timeResult = compareUnary(plan.harvestDays, incumbent.harvestDays, 'Harvest_Tie_Break');
        if (timeResult === 'right') bestPlans = [plan];
        else if (timeResult === 'equal') bestPlans.push(plan);
      }
    });
    const spaceLimit = constraints.space?.max == null ? null : Number(constraints.space.max) * 10;
    optimizationSummary = {
      plans: bestPlans,
      feasibleCount: plans.length,
      spaceLimit,
      bestMembraneId: bestPlans[0]?.membraneId || null
    };
    const best = bestPlans[0];
    const resultEvents = [{
      event: 'optimization_result',
      rule: 'Maximize_Profit_Then_Minimize_Harvest_Time',
      membrane_id: best?.membraneId,
      description: best
        ? `Selected ${best.crops.length ? best.crops.join(', ') : 'no crops'}: €${best.profit} estimated profit, ${best.space} m², ${best.harvestDays} days to first harvest.`
        : 'No feasible greenhouse plan survived the space constraint.'
    }];
    stepNumber++;
    history.push({ step: stepNumber, title: 'Greenhouse Optimization', events: resultEvents, tree: snapshotTree(skin) });
  }

  // Construct rules meta for display
  const rulesMeta = [];
  for (let idx = 0; idx < n; idx++) {
    const num = idx + 1;
    const item = items[idx];
    const nxt = (num === n) ? "eval" : `d_${num + 1}`;
    const dA = { [nxt]: 1 };
    for (const p of simulationProps) {
      const amount = contributionFor(item, p);
      if (amount) dA[p] = amount;
    }
    const dB = { [nxt]: 1 };
    rulesMeta.push({
      name: `Divide_Item${num}`,
      type: "division",
      trigger: `d_${num}`,
      daughter_a: dA,
      daughter_b: dB,
      applies_to: "gen"
    });
  }
  rulesMeta.push(...bindingRules);
  rulesMeta.push(constraintSignalsRule);
  rulesMeta.push(...checkRulesByState.values());
  rulesMeta.push(acceptRule, solutionRule, {
    name: "Cell_Dissolution (delta)", type: "dissolution",
    lhs: { [deltaObject]: 1 }, rhs: {}, target: "here", applies_to: "gen"
  });
  rulesMeta.push(...optimizerRules);
  return {
    title: `Knapsack · ${n} items · ` + Object.entries(constraints).map(([p, c]) => c.max != null ? `${p}≤${c.max}` : `${p}≥${c.min}`).join(", "),
    rules: rulesMeta,
    steps: history,
    metadata: {
      items: items,
      itemNames: itemNames,
      constraints: constraints,
      properties: allProps,
      preset: preset,
      optimization: optimizationSummary
    }
  };
}

function executeLiveSimulation() {
  simData = runSimulationFromConfig(
    currentConfig.items,
    currentConfig.constraints,
    currentConfig.itemNames || [],
    currentConfig.modelProperties,
    currentConfig.preset
  );
  initSim();
}

// ── Configuration Modal UI Logic ──────────────────────────────────────────
const modal = document.getElementById("configModal");

function openConfigModal() {
  renderConfigModal();
  modal.classList.add("open");
}
function closeConfigModal() {
  modal.classList.remove("open");
}

document.getElementById("btnOpenConfig").addEventListener("click", openConfigModal);
document.getElementById("btnCloseConfig").addEventListener("click", closeConfigModal);
document.getElementById("btnCancelConfig").addEventListener("click", closeConfigModal);
document.getElementById("btnQuickRun").addEventListener("click", () => {
  executeLiveSimulation();
  startPlay();
});

function renderConfigModal() {
  const props = currentConfig.properties;
  const items = currentConfig.items;

  // Table header
  const thead = document.getElementById("itemsTableHead");
  let thHtml = `<tr><th style="width:70px">Item</th>`;
  const propertyHeadings = {
    grow_days: 'Grow days', buy_cost: 'Buy cost (€)', grow_cost: 'Grow cost (€)',
    space: 'Space (m²)', yield_kg: 'Yield (kg)', sell_price: 'Sell price (€/kg)',
    profit: 'Profit (€)'
  };
  props.forEach(p => {
    thHtml += `<th>${propertyHeadings[p] || p.charAt(0).toUpperCase() + p.slice(1)}</th>`;
  });
  thHtml += `<th style="width:36px"></th></tr>`;
  thead.innerHTML = thHtml;

  // Table body
  const tbody = document.getElementById("itemsTableBody");
  tbody.innerHTML = "";
  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const itemName = currentConfig.itemNames?.[idx] || `Item ${idx + 1}`;
    let rowHtml = `<td style="font-weight:600;color:#93c5fd">${itemName}</td>`;
    props.forEach(p => {
      const val = item[p] != null ? item[p] : 1;
      const readOnly = currentConfig.preset === 'greenhouse' && p === 'profit' ? 'readonly title="Calculated from yield and costs"' : '';
      rowHtml += `<td><input type="number" min="0" value="${val}" data-idx="${idx}" data-prop="${p}" class="cfg-item-val" ${readOnly}></td>`;
    });
    rowHtml += `<td><button class="del-row-btn" data-del-item="${idx}" title="Remove item">✕</button></td>`;
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });

  // Constraints list
  const clist = document.getElementById("constraintsList");
  clist.innerHTML = "";
  const cEntries = Object.entries(currentConfig.constraints);
  if (!cEntries.length) {
    clist.innerHTML = `<div style="color:var(--muted);font-size:11px">(No active constraints — all combinations accepted)</div>`;
  } else {
    cEntries.forEach(([prop, cond]) => {
      const isMax = cond.max != null;
      const val = isMax ? cond.max : cond.min;
      const row = document.createElement("div");
      row.className = "c-row";
      const constraintLabel = currentConfig.preset === 'greenhouse' && prop === 'space'
        ? 'Space (10 m²/unit)' : prop;
      row.innerHTML = `
        <span style="min-width:70px;color:var(--blue);font-weight:600">${constraintLabel}</span>
        <select data-c-prop="${prop}" class="cfg-c-type">
          <option value="max" ${isMax ? "selected" : ""}>≤ (maximum threshold)</option>
          <option value="min" ${!isMax ? "selected" : ""}>≥ (minimum threshold)</option>
        </select>
        <input type="number" min="0" value="${val}" data-c-prop="${prop}" class="cfg-c-val" style="width:70px">
        <button class="del-row-btn" data-del-c="${prop}" title="Remove constraint">✕</button>
      `;
      clist.appendChild(row);
    });
  }

  // Update estimate
  const n = items.length;
  const count = Math.pow(2, n);
  const estEl = document.getElementById("cfgMemEstimate");
  estEl.textContent = `${n} items → 2^${n} = ${count} parallel membranes`;
  if (n > 5) {
    estEl.style.color = "var(--amber)";
    estEl.textContent += " (crowded layout)";
  } else {
    estEl.style.color = "var(--muted)";
  }
  document.getElementById('gardenHelp').hidden = currentConfig.preset !== 'greenhouse';
  if (currentConfig.preset === 'greenhouse') {
    estEl.textContent = `${n} vegetables → ${count} combinations · space ≤ 200 m²`;
    estEl.style.color = 'var(--muted)';
  }
}

// Read current inputs from modal and update currentConfig
function saveModalInputs() {
  // Read items
  document.querySelectorAll(".cfg-item-val").forEach(input => {
    const idx = parseInt(input.dataset.idx);
    const prop = input.dataset.prop;
    const val = parseInt(input.value) || 0;
    if (currentConfig.items[idx]) {
      currentConfig.items[idx][prop] = val;
    }
  });

  if (currentConfig.preset === 'greenhouse') {
    currentConfig.items.forEach(item => {
      item.profit = (Number(item.yield_kg) * Number(item.sell_price)) - Number(item.buy_cost) - Number(item.grow_cost);
    });
  }

  // Read constraints
  const newConstraints = {};
  document.querySelectorAll(".cfg-c-val").forEach(input => {
    const prop = input.dataset.cProp;
    const val = parseInt(input.value) || 0;
    const typeSelect = document.querySelector(`.cfg-c-type[data-c-prop="${prop}"]`);
    const isMax = typeSelect ? typeSelect.value === "max" : true;
    newConstraints[prop] = isMax ? { max: val } : { min: val };
  });
  currentConfig.constraints = newConstraints;
}

// Modal action listeners
document.getElementById("btnAddItem").addEventListener("click", () => {
  saveModalInputs();
  const newItem = {};
  currentConfig.properties.forEach(p => newItem[p] = 2);
  currentConfig.items.push(newItem);
  if (currentConfig.itemNames) currentConfig.itemNames.push(`Vegetable ${currentConfig.items.length}`);
  renderConfigModal();
});

document.getElementById("btnAddProp").addEventListener("click", () => {
  const pName = prompt("Enter new property name (e.g. 'volume', 'risk'):");
  if (!pName) return;
  const clean = pName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!clean || currentConfig.properties.includes(clean)) return;
  saveModalInputs();
  currentConfig.properties.push(clean);
  if (currentConfig.modelProperties) currentConfig.modelProperties.push(clean);
  currentConfig.items.forEach(it => it[clean] = 1);
  renderConfigModal();
});

document.getElementById("itemsTableBody").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-del-item]");
  if (delBtn) {
    saveModalInputs();
    const idx = parseInt(delBtn.dataset.delItem);
    if (currentConfig.items.length <= 1) {
      alert("You need at least 1 item!");
      return;
    }
    currentConfig.items.splice(idx, 1);
    if (currentConfig.itemNames) currentConfig.itemNames.splice(idx, 1);
    renderConfigModal();
  }
});

document.getElementById("btnAddConstraint").addEventListener("click", () => {
  saveModalInputs();
  const available = currentConfig.properties.filter(p => !currentConfig.constraints[p]);
  const prop = available[0] || currentConfig.properties[0];
  if (!prop) return;
  currentConfig.constraints[prop] = { max: 5 };
  renderConfigModal();
});

document.getElementById("constraintsList").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-del-c]");
  if (delBtn) {
    saveModalInputs();
    const prop = delBtn.dataset.delC;
    delete currentConfig.constraints[prop];
    renderConfigModal();
  }
});

// Presets
document.getElementById("preset3").addEventListener("click", () => {
  currentConfig = {
    items: [
      { weight: 2, cost: 3 },
      { weight: 3, cost: 4 },
      { weight: 4, cost: 5 }
    ],
    constraints: { weight: { max: 5 } },
    properties: ["weight", "cost"]
  };
  renderConfigModal();
});

document.getElementById("preset4").addEventListener("click", () => {
  currentConfig = {
    items: [
      { weight: 2, cost: 3 },
      { weight: 3, cost: 4 },
      { weight: 4, cost: 5 },
      { weight: 1, cost: 2 }
    ],
    constraints: { weight: { max: 6 } },
    properties: ["weight", "cost"]
  };
  renderConfigModal();
});

document.getElementById("presetMulti").addEventListener("click", () => {
  currentConfig = {
    items: [
      { weight: 2, cost: 3, volume: 4 },
      { weight: 3, cost: 4, volume: 2 },
      { weight: 4, cost: 5, volume: 5 }
    ],
    constraints: { weight: { max: 5 }, volume: { max: 6 } },
    properties: ["weight", "cost", "volume"]
  };
  renderConfigModal();
});

document.getElementById("presetGreenhouse").addEventListener("click", () => {
  currentConfig = {
    items: [
      { grow_days: 80, buy_cost: 20, grow_cost: 80, space: 50, yield_kg: 150, sell_price: 3, profit: 350 },
      { grow_days: 60, buy_cost: 15, grow_cost: 65, space: 40, yield_kg: 180, sell_price: 2, profit: 280 },
      { grow_days: 100, buy_cost: 25, grow_cost: 75, space: 60, yield_kg: 100, sell_price: 4, profit: 300 },
      { grow_days: 45, buy_cost: 10, grow_cost: 40, space: 30, yield_kg: 120, sell_price: 1, profit: 70 },
      { grow_days: 75, buy_cost: 10, grow_cost: 20, space: 40, yield_kg: 100, sell_price: 2, profit: 170 },
      { grow_days: 40, buy_cost: 10, grow_cost: 30, space: 20, yield_kg: 80, sell_price: 2, profit: 120 }
    ],
    itemNames: ['Tomato', 'Cucumber', 'Pepper', 'Lettuce', 'Carrot', 'Spinach'],
    constraints: { space: { max: 20 } },
    properties: ['grow_days', 'buy_cost', 'grow_cost', 'space', 'yield_kg', 'sell_price', 'profit'],
    modelProperties: ['space'],
    preset: 'greenhouse'
  };
  renderConfigModal();
});

// Run from modal
document.getElementById("btnRunConfig").addEventListener("click", () => {
  saveModalInputs();
  closeConfigModal();
  executeLiveSimulation();
  startPlay();
});

// ══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════════
// Start with the current browser-side configuration so threshold rules and
// cell dissolution are always represented in the timeline.
function initSim() {
  curStep = 0; animT = 1.0;
  Object.keys(physics).forEach(k => delete physics[k]);
  Object.keys(layoutCache).forEach(k => delete layoutCache[k]);
  ruleAnims = [];
  selectedId = null;
  document.getElementById('detailCol').classList.remove('open');

  const steps = simData.steps;
  document.getElementById('scrubber').max   = steps.length - 1;
  document.getElementById('scrubber').value = 0;
  document.getElementById('scrubberDetail').max = steps.length - 1;
  document.getElementById('scrubberDetail').value = 0;
  document.getElementById('stepLabelDetail').textContent = `0 / ${steps.length - 1}`;
  document.getElementById('stepLabel').textContent = `Step 0 / ${steps.length-1}`;

  buildLogPanel();
  renderGardenResult();
  // Pre-build physics for step 0
  const L = computeLayout(0);
  initPhysicsFromLayout(L);
  renderAll();
}

function renderGardenResult() {
  const box = document.getElementById('gardenResult');
  const result = simData?.metadata?.optimization;
  if (simData?.metadata?.preset !== 'greenhouse' || !result) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  const plan = result.plans[0];
  if (!plan) {
    box.innerHTML = '<strong>No valid plan</strong><div class="garden-meta">Every combination exceeds the greenhouse space limit.</div>';
    return;
  }
  const cropNames = plan.crops.length ? plan.crops.join(', ') : 'No crops';
  const itemCombination = plan.itemIds.length ? plan.itemIds.map(index => `it${index}`).join(' + ') : 'empty set';
  const ties = result.plans.length > 1 ? ` · ${result.plans.length} tied plans` : '';
  box.innerHTML = `<strong>Best greenhouse plan</strong>
    <div class="garden-crops"><b>${itemCombination}</b> — ${cropNames}</div>
    <div>(total space = ${plan.space} m², total profit = €${plan.profit})</div>
    <div>First harvest <b>${plan.harvestDays} days</b>${ties}</div>
    <div class="garden-meta">Revenue €${plan.revenue} − costs €${plan.cost}</div>
    <div class="garden-meta">${result.feasibleCount} space-valid combinations · profit first, harvest time as tie-break</div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// LOG PANEL
// ══════════════════════════════════════════════════════════════════════════
function buildLogPanel() {
  const body = document.getElementById('logBody');
  body.innerHTML = '';
  simData.steps.forEach((step, si) => {
    const hdr = document.createElement('div');
    hdr.className = 'log-step' + (si===0?' active':'');
    hdr.id = `ls${si}`;
    let title = `⟳ Step ${step.step}`;
    if (si === 0) title = '⚙ Initial State';
    else if (step.title) title = `⟳ Step ${step.step}: ${step.title}`;
    hdr.textContent = title;
    hdr.addEventListener('click', () => jumpToStep(si));
    body.appendChild(hdr);

    (step.events||[]).forEach(ev => {
      const el = document.createElement('div');
      if (ev.event === 'membrane_divided') {
        el.className = 'log-ev div';
        el.innerHTML = `✂ <b>DIVIDE</b> [${ev.parent_label}]
          <span class="sub">A: ${fmtObjs(ev.daughter_a_objects)}</span>
          <span class="sub">B: ${fmtObjs(ev.daughter_b_objects)}</span>`;
      } else if (ev.event === 'rule_fired') {
        if (ev.rule.includes('Enzyme_Full') || (ev.produced && ev.produced['δ'])) {
          el.className = 'log-ev diss';
          el.innerHTML = `🔒 <b>ENZYME FULL · δ EMITTED</b> [${ev.membrane_label}]
            <span class="sub">${fmtObjs(ev.consumed)} → ${fmtObjs(ev.produced)}</span>
            ${ev.description ? `<span class="sub" style="color:#ef4444">${ev.description}</span>` : ''}`;
        } else if (ev.produced && ev.produced.SAFE) {
          el.className = 'log-ev div';
          el.innerHTML = `🛡 <b>SAFE CELL</b> [${ev.membrane_label}]
            <span class="sub">${fmtObjs(ev.consumed)} → ${fmtObjs(ev.produced)}</span>
            ${ev.description ? `<span class="sub" style="color:#10b981">${ev.description}</span>` : ''}`;
        } else if (ev.rule.includes('Enzyme_Binding')) {
          el.className = 'log-ev rule';
          el.innerHTML = `🧬 <b>ENZYME BINDS WEIGHT</b> [${ev.membrane_label}]
            <span class="sub">${fmtObjs(ev.consumed)} → ${fmtObjs(ev.produced)}</span>
            ${ev.description ? `<span class="sub">${ev.description}</span>` : ''}`;
        } else {
          el.className = 'log-ev rule';
          el.innerHTML = `⚡ <b>${ev.rule}</b>
            <span class="sub">${fmtObjs(ev.consumed)} → ${fmtObjs(ev.produced)} [${ev.target}]</span>`;
        }
      } else if (ev.event === 'membrane_dissolved') {
        el.className = 'log-ev diss';
        el.innerHTML = `💥 <b>CELL DESTROYED (δ)</b> [${ev.membrane_label}]
          <span class="sub">${ev.description || 'Dissolved and deleted from interface'}</span>`;
      } else if (ev.event === 'optimization_result') {
        el.className = 'log-ev rule';
        el.innerHTML = `🏆 <b>OPTIMAL GREENHOUSE PLAN</b>
          <span class="sub">${ev.description}</span>`;
      }
      body.appendChild(el);
    });
  });
}

function fmtObjs(obj) {
  if (!obj || !Object.keys(obj).length) return '∅';
  return Object.entries(obj).map(([k,v]) => v>1?`${v}×${k}`:k).join(', ');
}

function highlightLogStep(si) {
  document.querySelectorAll('.log-step').forEach(e => e.classList.remove('active'));
  const el = document.getElementById(`ls${si}`);
  if (el) { el.classList.add('active'); el.scrollIntoView({behavior:'smooth', block:'nearest'}); }
}

// ══════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE
// ══════════════════════════════════════════════════════════════════════════
function computeLayout(si) {
  if (layoutCache[si]) return layoutCache[si];
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2;
  const skinR = Math.min(W, H) * 0.43;
  const positions = {};
  layoutNode(simData.steps[si].tree, cx, cy, skinR, positions);
  layoutCache[si] = positions;
  return positions;
}

function layoutNode(node, cx, cy, r, pos) {
  pos[node.id] = { x: cx, y: cy, r, label: node.label, objects: node.objects, alive: node.alive !== false };
  const ch = (node.children || []).filter(c => c);
  if (!ch.length) return;

  // Determine fixed ring slots count: use child's slotCount if available
  const ringSlots = (ch[0] && ch[0].slotCount) ? ch[0].slotCount : ch.length;
  let childR, arrR;
  if (ringSlots === 1) {
    childR = r * 0.52;
    arrR   = 0;
  } else {
    const sinPN = Math.sin(Math.PI / ringSlots);
    childR = Math.min(r * 0.9 * sinPN / (1 + sinPN), r * 0.42);
    arrR   = r * 0.9 - childR;
  }
  ch.forEach((child, i) => {
    const slot = (child.slotIdx !== undefined) ? child.slotIdx : i;
    const angle = (2 * Math.PI * slot / ringSlots) - Math.PI / 2;
    const px = (ringSlots === 1) ? cx : cx + arrR * Math.cos(angle);
    const py = (ringSlots === 1) ? cy : cy + arrR * Math.sin(angle);
    layoutNode(child, px, py, childR, pos);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PARTICLE PHYSICS
// ══════════════════════════════════════════════════════════════════════════
class Particle {
  constructor(key, cx, cy, memR) {
    this.key    = key;
    this.isProp = isPropertyToken(key);
    this.r      = objRadius(key);

    // Property tokens cluster near center; choice tokens spread wider
    const isEnzyme = key.startsWith('enzyme_');
    const spread = this.isProp ? 0.35 : 0.55;
    const d      = Math.random() * memR * spread;
    const angle  = Math.random() * Math.PI * 2;
    const enzymeProperty = isEnzyme ? key.slice('enzyme_'.length, key.lastIndexOf('_')) : '';
    const enzymeOffset = isEnzyme ? enzymePositionMap[enzymeProperty] : null;
    this.r = isEnzyme ? Math.min(this.r, memR * 0.2) : this.r;
    this.x  = isEnzyme ? cx + (enzymeOffset?.x || 0) * memR * 0.25 : cx + Math.cos(angle) * d;
    this.y  = isEnzyme ? cy + (enzymeOffset?.y || 0) * memR * 0.25 : cy + Math.sin(angle) * d;
    // Property tokens move slower (like heavier molecules)
    const spd = isEnzyme ? 0 : this.isProp ? 0.3 : 0.6;
    this.vx = (Math.random()-.5) * spd;
    this.vy = (Math.random()-.5) * spd;

    this.alpha = 0;        // fades in
    this.scale = 0.3;      // grows in
    this.state = 'spawn';  // 'spawn' | 'live' | 'binding' | 'bound' | 'die'
    this.stateT= 0;
    this.cx    = cx;
    this.cy    = cy;
    this.memR  = memR;
    this.flashT     = 0;
    this.flashColor = null;
  }

  update(dt) {
    this.stateT = Math.min(1, this.stateT + dt * 0.003);
    if (this.state === 'binding') {
      const progress = this.stateT;
      const eased = 1 - Math.pow(1 - progress, 3);
      this.x = this.bindStartX + (this.bindTargetX - this.bindStartX) * eased;
      this.y = this.bindStartY + (this.bindTargetY - this.bindStartY) * eased;
      this.alpha = 1;
      this.scale = 1 - 0.35 * eased;
      if (progress >= 1) {
        this.state = 'bound';
      }
    } else if (this.state === 'bound') {
      if (this.boundEnzyme) {
        const ringRadius = this.boundEnzyme.r + this.r + 2;
        this.x = this.boundEnzyme.x + Math.cos(this.bindAngle) * ringRadius;
        this.y = this.boundEnzyme.y + Math.sin(this.bindAngle) * ringRadius;
      }
      this.alpha = 1;
      this.scale = 1;
    } else if (this.state === 'spawn') {
      this.alpha = this.stateT;
      this.scale = 0.3 + 0.7 * this.stateT;
      if (this.stateT >= 1) this.state = 'live';
    } else if (this.state === 'die') {
      this.alpha = 1 - this.stateT;
      this.scale = 1 - 0.7*this.stateT;
    } else {
      this.alpha = 1;
      this.scale = 1;
    }

    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt * 0.004);

    if (this.state === 'spawn' || this.state === 'live') {
      this.x += this.vx * dt * 0.025;
      this.y += this.vy * dt * 0.025;
      const dx   = this.x - this.cx;
      const dy   = this.y - this.cy;
      const dist = Math.hypot(dx, dy);
      const max  = this.memR - this.r - 4;
      if (dist > max) {
        const nx = dx/dist, ny = dy/dist;
        const dot = this.vx*nx + this.vy*ny;
        this.vx -= 2*dot*nx;
        this.vy -= 2*dot*ny;
        this.x = this.cx + nx*(max-1);
        this.y = this.cy + ny*(max-1);
      }
    }
  }

  draw(c, sizeScale = 1) {
    if (this.alpha < 0.01) return;
    c.save();
    c.globalAlpha = Math.min(1, this.alpha);
    c.translate(this.x, this.y);
    c.scale(this.scale, this.scale);

    const col = this.flashT > 0 ? this.flashColor : objColor(this.key);
    const radius = this.r * sizeScale;

    // Glow (brighter for choice tokens, subtle for property tokens)
    if (this.flashT > 0 || this.state === 'spawn' || !this.isProp) {
      const glowR = this.isProp ? radius * 1.6 : radius * 2;
      const g = c.createRadialGradient(0,0,0, 0,0,glowR);
      g.addColorStop(0, col + (this.isProp ? '44' : '88'));
      g.addColorStop(1, 'transparent');
      c.beginPath(); c.arc(0,0,glowR,0,Math.PI*2);
      c.fillStyle = g; c.fill();
    }

    // Circle body
    c.beginPath(); c.arc(0,0,radius,0,Math.PI*2);
    c.fillStyle = this.isProp ? col + '22' : col + '33';
    c.fill();
    c.strokeStyle = col;
    c.lineWidth   = this.isProp ? 1 : 1.5;
    c.stroke();

    // Label
    c.fillStyle      = col;
    c.font           = `${this.isProp ? '' : 'bold '}${Math.max(6, radius*0.85)}px Segoe UI`;
    c.textAlign      = 'center';
    c.textBaseline   = 'middle';
    c.fillText(objLabel(this.key), 0, 0.5);
    c.restore();
  }
}

// Particle must be initialized before the simulation creates its first state.
executeLiveSimulation();

function ensurePhysics(memId, layout) {
  const pos = layout[memId]; if (!pos) return;
  if (!physics[memId]) {
    physics[memId] = { particles: [] };
    const objs = pos.objects || {};
    Object.entries(objs).forEach(([k, cnt]) => {
      for (let i=0; i<cnt; i++) {
        physics[memId].particles.push(new Particle(k, pos.x, pos.y, pos.r));
      }
    });
  } else {
    // Reposition particles to current membrane center
    physics[memId].particles.forEach(p => {
      p.cx = pos.x; p.cy = pos.y; p.memR = pos.r;
    });
  }
}

function initPhysicsFromLayout(layout) {
  Object.entries(layout).forEach(([id, pos]) => {
    if (pos.label !== 'skin') ensurePhysics(id, layout);
  });
}

function syncPhysicsToState(si) {
  const layout = computeLayout(si);
  const tree   = simData.steps[si].tree;
  const events = simData.steps[si].events || [];

  // Collect all living memIds from tree
  const liveIds = new Set();
  function collectIds(node) {
    if (node.alive !== false) liveIds.add(node.id);
    (node.children||[]).forEach(collectIds);
  }
  collectIds(tree);

  // Remove physics for dead membranes
  Object.keys(physics).forEach(id => {
    if (!liveIds.has(id)) delete physics[id];
  });

  // Ensure physics for all living
  liveIds.forEach(id => {
    if (id !== tree.id) ensurePhysics(id, layout);
  });

  // Apply event animations: flash consumed, spawn produced
  events.forEach(ev => {
    if (ev.event === 'rule_fired') {
      const ph = physics[ev.membrane_id];
      if (!ph) return;

      if (ev.rule.includes('Enzyme_Binding')) {
        const enzymeKey = Object.keys(ev.consumed || {}).find(key => key.startsWith('enzyme_'));
        const nextEnzymeKey = Object.keys(ev.produced || {}).find(key => key.startsWith('enzyme_'));
        const boundProperty = Object.keys(ev.consumed || {}).find(key => !key.startsWith('enzyme_'));
        const enzymeParticle = ph.particles.find(p => p.key === enzymeKey && p.state !== 'die');
        if (enzymeParticle && nextEnzymeKey) {
          enzymeParticle.key = nextEnzymeKey;
          enzymeParticle.flashT = 1;
          enzymeParticle.flashColor = '#06b6d4';

          const boundCount = Number(ev.consumed[boundProperty]) || 0;
          const weightParticles = ph.particles
            .filter(p => p.key === boundProperty && p.state !== 'die' && p.state !== 'bound' && p.state !== 'binding')
            .slice(0, boundCount);
          weightParticles.forEach((particle, index) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, weightParticles.length);
            const ringRadius = enzymeParticle.r + particle.r + 2;
            particle.bindStartX = particle.x;
            particle.bindStartY = particle.y;
            particle.boundEnzyme = enzymeParticle;
            particle.bindAngle = angle;
            particle.bindTargetX = enzymeParticle.x + Math.cos(angle) * ringRadius;
            particle.bindTargetY = enzymeParticle.y + Math.sin(angle) * ringRadius;
            particle.state = 'binding';
            particle.stateT = 0;
          });
        }
        Object.entries(ev.consumed || {}).forEach(([key, count]) => {
          if (key === enzymeKey || key === boundProperty) return;
          const persistentCount = Math.min(count, Number(ev.produced?.[key]) || 0);
          ph.particles.filter(p => p.key === key && p.state !== 'die')
            .slice(0, count - persistentCount)
            .forEach(particle => { particle.state = 'die'; particle.stateT = 0; });
        });
        const pos = layout[ev.membrane_id];
        if (pos) Object.entries(ev.produced || {}).forEach(([key, count]) => {
          if (key.startsWith('enzyme_')) return;
          for (let index = 0; index < count; index++) {
            const particle = new Particle(key, pos.x, pos.y, pos.r);
            particle.flashT = 1;
            particle.flashColor = objColor(key);
            ph.particles.push(particle);
          }
        });
        return;
      }

      // Flash consumed objects then remove
      Object.entries(ev.consumed || {}).forEach(([key, count]) => {
        const persistentCount = Math.min(count, Number(ev.produced?.[key]) || 0);
        ph.particles.filter(p => p.key === key && p.state !== 'die').slice(0, count - persistentCount).forEach(p => {
          p.state = 'die'; p.stateT = 0; p.flashT = 1; p.flashColor = '#ef4444';
        });
      });
      // Spawn produced objects
      const pos = layout[ev.membrane_id];
      if (pos) {
        const targetId = ev.target === 'out'
          ? findParentId(tree, ev.membrane_id)
          : ev.membrane_id;
        const targetPos = layout[targetId];
        if (targetPos && physics[targetId]) {
          Object.entries(ev.produced||{}).forEach(([k, producedCount]) => {
            const cnt = Math.max(0, producedCount - Math.min(producedCount, Number(ev.consumed?.[k]) || 0));
            for (let i=0; i<cnt; i++) {
              const np = new Particle(k, targetPos.x, targetPos.y, targetPos.r);
              np.flashT=1; np.flashColor=objColor(k);
              physics[targetId].particles.push(np);
            }
          });
        }
      }
    }
    if (ev.event === 'membrane_divided') {
      // Daughter particles will be initialized by ensurePhysics above
      // Flash daughters green
      [ev.daughter_a_id, ev.daughter_b_id].forEach(id => {
        if (physics[id]) {
          physics[id].particles.forEach(p => {
            p.flashT=1; p.flashColor=objColor(p.key);
          });
        }
      });
    }
  });
}

function findParentId(root, childId, parentId=null) {
  if (root.id === childId) return parentId;
  for (const c of root.children||[]) {
    const r = findParentId(c, childId, root.id);
    if (r !== undefined) return r;
  }
  return undefined;
}

function triggerRuleAnims(si) {
  ruleAnims = (simData.steps[si].events||[])
    .filter(e => e.event === 'rule_fired')
    .map(ev => ({ memId: ev.membrane_id, t: 0 }));
}

// ══════════════════════════════════════════════════════════════════════════
// DRAWING HELPERS
// ══════════════════════════════════════════════════════════════════════════
function drawGlow(c, cx, cy, r, color, spread=20, alpha=0.4) {
  const g = c.createRadialGradient(cx, cy, r*0.4, cx, cy, r+spread);
  g.addColorStop(0, color + Math.round(alpha*255).toString(16).padStart(2,'0'));
  g.addColorStop(1, 'transparent');
  c.beginPath(); c.arc(cx, cy, r+spread, 0, Math.PI*2);
  c.fillStyle = g; c.fill();
}

function extractDna(node) {
  if (!node) return [];
  if (node.dna && node.dna.length) return node.dna;
  return [];
}

function drawMembrane(c, x, y, r, label, borderColor='#334155', fillColor='#0d1117',
                       lineWidth=2, glowColor=null, glowAlpha=0.3, labelAlpha=1, dna=null) {
  if (glowColor) drawGlow(c, x, y, r, glowColor, 24, glowAlpha);

  c.beginPath(); c.arc(x, y, r, 0, Math.PI*2);
  c.fillStyle = fillColor; c.fill();
  c.strokeStyle = borderColor; c.lineWidth = lineWidth;
  c.stroke();

  if (r < 10) return;
  c.save();
  c.globalAlpha = labelAlpha;

  const topY = y - r + Math.max(12, r * 0.22);

  if (dna && dna.length > 0) {
    // Render DNA chromosome sequence at the top in place of [gen]
    const fSize = Math.max(8, Math.min(12, r * 0.23));
    c.font = `bold ${fSize}px monospace, 'Segoe UI'`;
    c.textBaseline = 'middle';

    const spans = dna.map(g => ({
      text: (g.choice ? '✓' : '✗') + (g.name ? g.name.slice(0, 2) : g.item),
      color: g.choice ? '#22c55e' : '#ef4444'
    }));

    let contentW = 0;
    const widths = spans.map(s => {
      const w = c.measureText(s.text).width + 3;
      contentW += w;
      return w;
    });

    const brkW = c.measureText('[').width;
    const totalW = contentW + brkW * 2 + 4;
    const capH = fSize + 6;
    const capX = x - totalW / 2;
    const capY = topY - capH / 2;

    // Capsule background
    c.fillStyle = '#080d19ee';
    c.beginPath();
    c.roundRect(capX - 4, capY, totalW + 8, capH, 5);
    c.fill();
    c.strokeStyle = borderColor + 'aa';
    c.lineWidth = 1;
    c.stroke();

    // Render left bracket
    let curX = capX;
    c.fillStyle = '#64748b';
    c.textAlign = 'left';
    c.fillText('[', curX, topY);
    curX += brkW + 2;

    // Render each gene
    spans.forEach((span, i) => {
      c.fillStyle = span.color;
      c.fillText(span.text, curX, topY);
      curX += widths[i];
    });

    // Render right bracket
    c.fillStyle = '#64748b';
    c.fillText(']', curX, topY);

  } else {
    c.fillStyle = borderColor;
    c.font = `${Math.max(8, Math.min(13, r*0.18))}px monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`[${label}]`, x, topY);
  }

  c.restore();
}

function drawEnzymeAssemblies(c, objects, cx, cy, membraneRadius, sizeScale = 1, detail = false) {
  Object.entries(objects || {}).forEach(([enzymeKey, rawCount]) => {
    if (!enzymeKey.startsWith('enzyme_')) return;
    const separator = enzymeKey.lastIndexOf('_');
    const property = enzymeKey.slice('enzyme_'.length, separator);
    const boundCount = Number(enzymeKey.slice(separator + 1)) || 0;
    const offset = enzymePositionMap[property] || { x: 0, y: 0 };
    const ex = cx + offset.x * membraneRadius * 0.25;
    const ey = cy + offset.y * membraneRadius * 0.25;
    const enzymeRadius = (detail ? Math.max(6, objRadius(enzymeKey) * 0.65) : objRadius(enzymeKey)) * sizeScale;
    const tokenRadius = (detail
      ? Math.min(7, Math.max(3, objRadius(property) * 0.55))
      : objRadius(property)) * sizeScale;
    const color = objColor(enzymeKey);

    // Draw the enzyme first so its bound property tokens sit visibly on top.
    c.save();
    c.shadowColor = color;
    c.shadowBlur = detail ? 12 : 8;
    c.beginPath();
    c.arc(ex, ey, enzymeRadius, 0, Math.PI * 2);
    c.fillStyle = '#06131a';
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = detail ? 2 : 1.5;
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = color;
    c.font = `bold ${Math.max(detail ? 6 : 7, enzymeRadius * 0.68)}px Segoe UI`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(objLabel(enzymeKey), ex, ey);
    c.restore();

    for (let index = 0; index < boundCount; index++) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, boundCount);
      const ringRadius = enzymeRadius + tokenRadius - 1;
      const tx = ex + Math.cos(angle) * ringRadius;
      const ty = ey + Math.sin(angle) * ringRadius;
      c.save();
      c.beginPath();
      c.arc(tx, ty, tokenRadius, 0, Math.PI * 2);
      c.fillStyle = objColor(property) + '44';
      c.fill();
      c.strokeStyle = objColor(property);
      c.lineWidth = detail ? 1.25 : 1;
      c.stroke();
      c.fillStyle = objColor(property);
      c.font = `${Math.max(detail ? 5 : 6, tokenRadius * 0.8)}px Segoe UI`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(objLabel(property), tx, ty + 0.5);
      c.restore();
    }
  });
}

function drawSkin(c, cx, cy, r, pulseFactor=1) {
  const pr = r * pulseFactor;
  // Outer ambient glow
  drawGlow(c, cx, cy, pr, '#3b82f6', 40, 0.15);
  // Dashed outer ring
  c.save();
  c.setLineDash([8, 6]);
  c.beginPath(); c.arc(cx, cy, pr+6, 0, Math.PI*2);
  c.strokeStyle = '#3b82f622'; c.lineWidth = 1; c.stroke();
  c.setLineDash([]);
  c.restore();
  // Main circle
  c.beginPath(); c.arc(cx, cy, pr, 0, Math.PI*2);
  const grad = c.createRadialGradient(cx, cy-pr*0.3, pr*0.1, cx, cy, pr);
  grad.addColorStop(0, '#0d1f38');
  grad.addColorStop(1, '#080e1a');
  c.fillStyle = grad; c.fill();
  c.strokeStyle = '#3b82f6'; c.lineWidth = 2; c.stroke();
  // Label
  c.fillStyle = '#3b82f6';
  c.font = 'bold 13px Segoe UI';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('[skin]', cx, cy - pr + 18);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════════════════
function renderAll() {
  if (!simData) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#64748b'; ctx.font='14px Segoe UI';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Load simulation_data.json to begin', canvas.width/2, canvas.height/2);
    return;
  }

  ctx.clearRect(0,0,canvas.width,canvas.height);
  const layout = computeLayout(curStep);
  const root   = simData.steps[curStep].tree;
  const events = simData.steps[curStep].events || [];

  const divIds  = new Set(events.filter(e=>e.event==='membrane_divided').flatMap(e=>[e.daughter_a_id, e.daughter_b_id]));
  const ruleIds = new Set(events.filter(e=>e.event==='rule_fired').map(e=>e.membrane_id));

  // ── Draw skin ──────────────────────────────────────────────────────────
  const sp = layout[root.id];
  if (sp) drawSkin(ctx, sp.x, sp.y, sp.r);

  // ── Draw child membranes ───────────────────────────────────────────────
  function drawTree(node, depth=0) {
    if (node.alive === false) return; // Deleted from interface
    if (node.id === root.id) { (node.children||[]).forEach(c=>drawTree(c, depth+1)); return; }
    const pos = layout[node.id]; if (!pos) return;
    const { x, y, r } = pos;

    const objs = node.objects || {};
    const hasDelta = objs['δ'] > 0;
    const hasSafe = objs.SAFE > 0;
    const hasEval = objs.eval > 0;
    const hasSol  = objs.solution > 0;
    const isDiv   = divIds.has(node.id);
    const isRule  = ruleIds.has(node.id);
    const isSel   = node.id === selectedId;
    const isBest  = node.id === simData.metadata?.optimization?.bestMembraneId;
    const isHov   = node.id === hoverMemId;

    let border='#21293a', fill='#0d1117', glow=null, glow_a=0.3, lw=1.5;
    if (hasDelta)      { border='#ef4444'; fill='#200a0a'; glow='#ef4444'; glow_a=0.55; lw=2.5; }
    else if (hasSafe)  { border='#10b981'; fill='#071c14'; glow='#10b981'; glow_a=0.35; lw=2.0; }
    else if (isDiv)    { border='#22c55e'; fill='#0a1f0a'; glow='#22c55e'; lw=2.5; }
    else if (hasEval)  { border='#a855f7'; fill='#120a1f'; glow='#a855f7'; }
    else if (hasSol)   { border='#eab308'; fill='#1a1500'; glow='#eab308'; }
    else if (isRule)   { border='#3b82f6'; fill='#0a1225'; glow='#3b82f6'; glow_a=0.25; }
    else               { border='#1e3a5f'; fill='#080e18'; }

    if (isSel) { border='#f59e0b'; glow='#f59e0b'; glow_a=0.5; lw=2.5; }
    else if (isBest) { border='#facc15'; glow='#facc15'; glow_a=0.55; lw=3; }
    else if (isHov) { glow=border; glow_a=0.2; }

    const dna = extractDna(node);
    drawMembrane(ctx, x, y, r, node.label, border, fill, lw, glow, glow_a, 1, dna);

    // Draw particles
    const ph = physics[node.id];
    if (ph) ph.particles
      .slice()
      .sort((a, b) => Number(a.key.startsWith('enzyme_')) - Number(b.key.startsWith('enzyme_')))
      .forEach(p => {
        if (p.alpha > 0.01 && !p.key.startsWith('enzyme_') && p.state !== 'binding' && p.state !== 'bound') p.draw(ctx, 1);
      });
    drawEnzymeAssemblies(ctx, objs, x, y, r, 1, false);

    // Draw child membranes recursively
    (node.children||[]).forEach(c => drawTree(c, depth+1));
  }

  // Also show solutions in skin
  const skinObjs = root.objects || {};
  if (skinObjs.solution > 0) {
    const { x, y, r } = sp;
    ctx.fillStyle = '#eab308';
    ctx.font = `bold 14px Segoe UI`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`★ ${skinObjs.solution} solution${skinObjs.solution>1?'s':''}`, x, y+r-24);
  }

  drawTree(root);

  // ── Legend overlay ─────────────────────────────────────────────────────
  drawLegend();

  // ── Step label on canvas ───────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = '#0d1117cc';
  ctx.beginPath();
  ctx.roundRect(canvas.width - 136, canvas.height - 36, 128, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#3b82f6';
  ctx.font = 'bold 12px Segoe UI';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const totalSteps = simData.steps.length - 1;
  ctx.fillText(`Step ${curStep} / ${totalSteps}`, canvas.width - 72, canvas.height - 22);
  ctx.restore();

  // ── Detail panel canvas ────────────────────────────────────────────────
  if (selectedId) drawDetailCanvas();
}

function drawLegend() {
  const items = [
    { color:'#3b82f6',  label:'skin membrane' },
    { color:'#1e3a5f',  label:'child membrane' },
    { color:'#22c55e',  label:'dividing cell' },
    { color:'#a855f7',  label:'evaluating' },
    { color:'#06b6d4',  label:'enzyme bound to weight' },
    { color:'#ef4444',  label:'enzyme full (δ emitted)' },
    { color:'#10b981',  label:'safe cell (≤ capacity)' },
    { color:'#eab308',  label:'solution found' },
    { color:'#f59e0b',  label:'selected' },
  ];
  const x = 10, y = canvas.height - 10 - items.length*18 - 8;
  ctx.save();
  ctx.fillStyle = '#0d1117bb';
  ctx.beginPath();
  ctx.roundRect(x, y, 160, items.length*18+12, 6);
  ctx.fill();
  items.forEach((it, i) => {
    const iy = y + 10 + i*18;
    ctx.beginPath(); ctx.arc(x+14, iy+5, 5, 0, Math.PI*2);
    ctx.fillStyle = it.color; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px Segoe UI';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(it.label, x+24, iy);
  });
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ══════════════════════════════════════════════════════════════════════════
function loop(ts) {
  requestAnimationFrame(loop);
  if (!simData) { renderAll(); return; }

  const dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
  lastTs = ts;

  // Update physics
  const layout = computeLayout(curStep);
  Object.entries(physics).forEach(([id, ph]) => {
    ph.particles = ph.particles.filter(p => !(p.state==='die' && p.alpha < 0.01));
    ph.particles.forEach(p => p.update(dt));
  });

  // Update rule anims
  ruleAnims.forEach(a => { a.t = Math.min(1, a.t + dt/stepDurMs * 2); });

  renderAll();
}
requestAnimationFrame(loop);

// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
function goToStep(si, animated=true) {
  if (!simData) return;
  si = Math.max(0, Math.min(simData.steps.length-1, si));
  curStep = si;
  document.getElementById('scrubber').value = si;
  const sObj = simData.steps[si];
  const titlePart = sObj && sObj.title ? ` · ${sObj.title}` : '';
  document.getElementById('stepLabel').textContent =
    `Step ${si} / ${simData.steps.length-1}${titlePart}`;
  document.getElementById('scrubberDetail').value = si;
  document.getElementById('stepLabelDetail').textContent = `${si} / ${simData.steps.length - 1}`;
  highlightLogStep(si);

  if (animated && si > 0) {
    triggerRuleAnims(si);
  } else {
    ruleAnims = [];
  }

  syncPhysicsToState(si);
  if (selectedId) updateDetailPanel(selectedId);
}

function jumpToStep(si) { stopPlay(); goToStep(si, false); }

function getDelay() {
  const v = parseInt(document.getElementById('speedSlider').value);
  return Math.round(2800 / Math.pow(v, 1.05));
}

let playTimer = null;
function startPlay() {
  playing = true;
  document.getElementById('btnPlay').disabled = true;
  document.getElementById('btnPause').disabled = false;
  function tick() {
    if (curStep >= simData.steps.length-1) { stopPlay(); return; }
    goToStep(curStep+1);
    playTimer = setTimeout(tick, getDelay());
  }
  playTimer = setTimeout(tick, 400);
}
function stopPlay() {
  playing = false;
  clearTimeout(playTimer);
  document.getElementById('btnPlay').disabled = false;
  document.getElementById('btnPause').disabled = true;
}

document.getElementById('btnPlay').addEventListener('click',  () => { if(simData && curStep<simData.steps.length-1) startPlay(); });
document.getElementById('btnPause').addEventListener('click', stopPlay);
document.getElementById('btnNext').addEventListener('click',  () => { stopPlay(); goToStep(curStep+1); });
document.getElementById('btnPrev').addEventListener('click',  () => { stopPlay(); goToStep(curStep-1, false); });
document.getElementById('btnReset').addEventListener('click', () => { stopPlay(); goToStep(0, false); });
document.getElementById('scrubber').addEventListener('input', function() { stopPlay(); goToStep(parseInt(this.value), false); });
document.getElementById('scrubberDetail').addEventListener('input', function() { stopPlay(); goToStep(parseInt(this.value), false); });

document.getElementById('speedSlider').addEventListener('input', function() {
  const ms = getDelay();
  document.getElementById('speedVal').textContent = ms>=1000?(ms/1000).toFixed(1)+'s':ms+'ms';
});

function setObjectSize(value) {
  const percent = Number(value);
  objectSizeScale = percent / 100;
  document.getElementById('objectSizeDetail').value = String(percent);
  document.getElementById('objectSizeDetailValue').textContent = `${percent}%`;
  if (selectedId) drawDetailCanvas();
}
document.getElementById('objectSizeDetail').addEventListener('input', function() { setObjectSize(this.value); });

// Init speed label
(()=>{ const ms=getDelay(); document.getElementById('speedVal').textContent=ms>=1000?(ms/1000).toFixed(1)+'s':ms+'ms'; })();

// ══════════════════════════════════════════════════════════════════════════
// INTERACTION — click / hover
// ══════════════════════════════════════════════════════════════════════════
function hitTestMem(mx, my) {
  if (!simData) return null;
  const layout = computeLayout(curStep);
  const root   = simData.steps[curStep].tree;
  let best = null, bestR = Infinity;

  function check(node) {
    if (node.alive === false) return; // Do not hit-test destroyed cells
    if (node.id === root.id) { (node.children||[]).forEach(check); return; }
    const pos = layout[node.id]; if (!pos) return;
    const d = Math.hypot(mx-pos.x, my-pos.y);
    if (d < pos.r && pos.r < bestR) { best = node; bestR = pos.r; }
    (node.children||[]).forEach(check);
  }
  check(root);
  return best;
}

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;
  const hit = hitTestMem(mx, my);
  hoverMemId = hit ? hit.id : null;
  canvas.style.cursor = hit ? 'pointer' : 'default';

  // Tooltip
  const tip = document.getElementById('tooltip');
  if (hit) {
    const objs = hit.objects||{};
    const lines = Object.entries(objs).map(([k,v])=>`${objLabel(k)} ${k}: ${v}`);
    tip.innerHTML = `<b>[${hit.label}]</b><br>${lines.join('<br>')||'(empty)'}`;
    tip.style.display = 'block';
    tip.style.left = (e.clientX+14)+'px';
    tip.style.top  = (e.clientY-10)+'px';
  } else {
    tip.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  hoverMemId = null;
  document.getElementById('tooltip').style.display = 'none';
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left)*scaleX, my = (e.clientY - rect.top)*scaleY;
  const hit = hitTestMem(mx, my);
  if (hit) {
    selectedId = (selectedId === hit.id) ? null : hit.id;
    const col = document.getElementById('detailCol');
    if (selectedId) {
      col.classList.add('open');
      updateDetailPanel(selectedId);
      requestAnimationFrame(() => { resizeDetailCanvas(); drawDetailCanvas(); });
    }
    else             col.classList.remove('open');
  } else {
    selectedId = null;
    document.getElementById('detailCol').classList.remove('open');
  }
});

document.getElementById('detailClose').addEventListener('click', () => {
  selectedId = null;
  document.getElementById('detailCol').classList.remove('open');
});

// ══════════════════════════════════════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════════════════════════════════════
function findNodeById(root, id) {
  if (root.id === id) return root;
  for (const c of root.children||[]) { const r=findNodeById(c,id); if(r) return r; }
  return null;
}

function updateDetailPanel(memId) {
  if (!simData || !memId) return;
  const root = simData.steps[curStep].tree;
  const node = findNodeById(root, memId);
  if (!node) return;

  document.getElementById('detailTitle').textContent = `[${node.label}] — ${memId}`;

  const objs        = node.objects || {};
  const meta        = simData.metadata || {};
  const constraints = meta.constraints || {};
  const properties  = meta.properties  || [];

  // ── Objects section ────────────────────────────────────────────────────
  const dobj = document.getElementById('detailObjects');
  dobj.innerHTML = '';

  // --- DNA Genome Card ---
  const dna = extractDna(node);
  if (dna.length) {
    const dnaBox = document.createElement('div');
    dnaBox.style.cssText = 'background:#0a101d;border:1px solid #1e293b;border-radius:8px;padding:9px 11px;margin-bottom:12px';
    dnaBox.innerHTML = `
      <div style="font-size:10px;color:#93c5fd;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        <span>🧬</span> Genome (DNA Package)
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${dna.map(g => `
          <span style="display:inline-flex;align-items:center;gap:4px;background:#161b22;border:1px solid ${g.choice ? '#22c55e44' : '#ef444444'};color:${g.choice ? '#22c55e' : '#ef4444'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">
            ${g.label} ${g.choice ? 'Include' : 'Skip'}
          </span>
        `).join('')}
      </div>
    `;
    dobj.appendChild(dnaBox);
  }

  const orgHdr = document.createElement('h3');
  orgHdr.textContent = 'Objects (Organelles)';
  dobj.appendChild(orgHdr);

  // --- Property token totals with constraint bar ---
  if (properties.length) {
    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;color:var(--muted);margin:8px 0 2px;letter-spacing:.06em;text-transform:uppercase';
    hdr.textContent = 'Property totals (unary token counts)';
    dobj.appendChild(hdr);

    properties.forEach(prop => {
      const count = objs[prop] || 0;
      const cond  = constraints[prop] || {};
      const max   = cond.max != null ? cond.max : null;
      const min   = cond.min != null ? cond.min : null;
      const col   = objColor(prop);

      // Status indicator
      let status = '●', statusCol = '#64748b';
      if (max != null) {
        status    = count <= max ? '✓' : '✗';
        statusCol = count <= max ? '#22c55e' : '#ef4444';
      }
      if (min != null) {
        status    = count >= min ? '✓' : '✗';
        statusCol = count >= min ? '#22c55e' : '#ef4444';
      }

      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:3px 0';

      // Label row
      const row = document.createElement('div');
      row.className = 'obj-row';
      const constraint = max != null ? `max ${max}` : min != null ? `min ${min}` : 'unconstrained';
      row.innerHTML = `
        <div class="obj-dot" style="background:${col}"></div>
        <span class="obj-name" style="color:${col}">${prop}</span>
        <span class="obj-count" style="font-size:13px;font-weight:700;color:${col}">${count}</span>
        <span style="font-size:10px;color:${statusCol};margin-left:4px">${status} ${constraint}</span>`;
      wrap.appendChild(row);

      // Visual bar (if constrained)
      if (max != null || min != null) {
        const barMax  = max != null ? Math.max(max * 1.2, count) : count * 1.2 || 1;
        const fillPct = Math.min(100, (count / barMax) * 100);
        const limitPct = max != null ? (max / barMax) * 100 : (min / barMax) * 100;
        const bar = document.createElement('div');
        bar.style.cssText = `position:relative;height:6px;background:#21293a;border-radius:3px;margin:3px 0 3px 16px;overflow:hidden`;
        bar.innerHTML = `
          <div style="position:absolute;left:0;top:0;height:100%;width:${fillPct}%;
               background:${statusCol};border-radius:3px;transition:width .3s"></div>
          <div style="position:absolute;top:-1px;left:${limitPct}%;height:8px;width:2px;
               background:#ffffff44;border-radius:1px"></div>`;
        wrap.appendChild(bar);
      }

      dobj.appendChild(wrap);
    });
  }

  // --- Other semantic tokens ---
  const semantic = Object.entries(objs).filter(([k]) =>
    !properties.includes(k) && !k.startsWith('d_'));
  if (semantic.length) {
    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;color:var(--muted);margin:8px 0 2px;letter-spacing:.06em;text-transform:uppercase';
    hdr.textContent = 'Control tokens';
    dobj.appendChild(hdr);
    semantic.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'obj-row';
      row.innerHTML = `<div class="obj-dot" style="background:${objColor(k)}"></div>
        <span class="obj-name">${objLabel(k)} ${k}</span>
        <span class="obj-count">× ${v}</span>`;
      dobj.appendChild(row);
    });
  }

  if (!Object.keys(objs).length) {
    dobj.innerHTML += '<div style="color:var(--muted);font-size:12px">(empty multiset)</div>';
  }

  // ── Rules section ──────────────────────────────────────────────────────
  const drules = document.getElementById('detailRules');
  drules.innerHTML = '<h3>Rule Applicability</h3>';
  if (simData.rules) {
    simData.rules.filter(r=>r.applies_to===node.label).forEach(rule => {
      const applicable = checkRuleApplicable(rule, objs);
      const row = document.createElement('div');
      row.className = 'rule-row ' + (applicable ? 'ok' : 'no');
      row.innerHTML = `<span>${applicable?'✓':'○'}</span> ${rule.name}`;
      drules.appendChild(row);
    });
  }

  // History section
  const dhist = document.getElementById('detailHistory');
  dhist.innerHTML = '<h3>Event History</h3>';
  simData.steps.forEach((step, si) => {
    (step.events||[]).forEach(ev => {
      if ((ev.membrane_id||ev.parent_id) === memId ||
          ev.daughter_a_id === memId || ev.daughter_b_id === memId) {
        const el = document.createElement('div');
        el.className = 'ev-item';
        el.textContent = `Step ${step.step}: ${ev.event.replace('_',' ')} — ${ev.rule||''}`;
        dhist.appendChild(el);
      }
    });
  });
  if (dhist.children.length === 1) {
    const el = document.createElement('div');
    el.className = 'ev-item'; el.textContent = '(no events for this membrane)';
    dhist.appendChild(el);
  }
}

function checkRuleApplicable(rule, objs) {
  if (rule.type === 'division') {
    return (objs[rule.trigger]||0) >= 1;
  }
  if (rule.lhs) {
    return Object.entries(rule.lhs).every(([k,v]) => (objs[k]||0) >= v);
  }
  return false;
}

function drawDetailCanvas() {
  if (!selectedId || !simData) return;
  const dc = document.getElementById('detailCanvas');
  const W = dc.width, H = dc.height;
  dctx.clearRect(0,0,W,H);

  const root = simData.steps[curStep].tree;
  const node = findNodeById(root, selectedId);
  if (!node) return;

  const cx = W/2, cy = H/2, r = Math.min(W,H)*0.47;

  // Draw membrane
  const objs = node.objects||{};
  const hasEval = objs.eval > 0;
  const hasSol  = objs.solution > 0;
  let border = '#1e3a5f';
  if (hasEval) border = '#a855f7';
  if (hasSol)  border = '#eab308';

  drawGlow(dctx, cx, cy, r, border, 20, 0.4);
  dctx.beginPath(); dctx.arc(cx, cy, r, 0, Math.PI*2);
  dctx.fillStyle = '#0a0f1a'; dctx.fill();
  dctx.strokeStyle = border; dctx.lineWidth = 2; dctx.stroke();

  // Draw label or DNA
  const dna = extractDna(node);
  if (dna && dna.length > 0) {
    const topY = cy - r + 15;
    const fSize = 12;
    dctx.font = `bold ${fSize}px monospace, 'Segoe UI'`;
    dctx.textBaseline = 'middle';

    const spans = dna.map(g => ({
      text: (g.choice ? '✓' : '✗') + (g.name || g.item),
      color: g.choice ? '#22c55e' : '#ef4444'
    }));

    let contentW = 0;
    const widths = spans.map(s => {
      const w = dctx.measureText(s.text).width + 4;
      contentW += w;
      return w;
    });

    const brkW = dctx.measureText('[').width;
    const totalW = contentW + brkW * 2 + 6;
    const capH = fSize + 8;
    const capX = cx - totalW / 2;
    const capY = topY - capH / 2;

    dctx.fillStyle = '#080d19ee';
    dctx.beginPath();
    dctx.roundRect(capX - 4, capY, totalW + 8, capH, 6);
    dctx.fill();
    dctx.strokeStyle = border + 'aa';
    dctx.lineWidth = 1.5;
    dctx.stroke();

    let curX = capX;
    dctx.fillStyle = '#64748b';
    dctx.textAlign = 'left';
    dctx.fillText('[', curX, topY);
    curX += brkW + 2;

    spans.forEach((span, i) => {
      dctx.fillStyle = span.color;
      dctx.fillText(span.text, curX, topY);
      curX += widths[i];
    });

    dctx.fillStyle = '#64748b';
    dctx.fillText(']', curX, topY);
  } else {
    dctx.fillStyle = border; dctx.font = '12px monospace';
    dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
    dctx.fillText(`[${node.label}]`, cx, cy - r + 14);
  }

  // Draw particles in detail canvas
  const ph = physics[selectedId];
  if (ph) {
    ph.particles.forEach(p => {
      if (p.key.startsWith('enzyme_') || p.state === 'binding' || p.state === 'bound') return;
      // remap particle position to detail canvas space
      const layout = computeLayout(curStep);
      const pos = layout[selectedId]; if(!pos) return;
      const scale = r / pos.r;
      const dx = (p.x - pos.x) * scale;
      const dy = (p.y - pos.y) * scale;

      dctx.save();
      dctx.globalAlpha = Math.min(1, p.alpha);
      const col = objColor(p.key);
      const pr2 = (p.isProp
        ? Math.min(7, Math.max(3, p.r * 0.55))
        : Math.min(12, Math.max(6, p.r * 0.65))) * objectSizeScale;
      const nx = cx + dx, ny = cy + dy;

      // Glow
      const glowR = p.isProp ? pr2 * 1.5 : pr2 * 2;
      const g = dctx.createRadialGradient(nx,ny,0, nx,ny,glowR);
      g.addColorStop(0, col + (p.isProp ? '33' : '55')); g.addColorStop(1,'transparent');
      dctx.beginPath(); dctx.arc(nx,ny,glowR,0,Math.PI*2);
      dctx.fillStyle=g; dctx.fill();

      // Circle
      dctx.beginPath(); dctx.arc(nx,ny,pr2,0,Math.PI*2);
      dctx.fillStyle=col+(p.isProp ? '22' : '33'); dctx.fill();
      dctx.strokeStyle=col; dctx.lineWidth=p.isProp ? 1 : 1.5; dctx.stroke();

      // Label
      dctx.fillStyle=col; dctx.font=`${p.isProp ? '' : 'bold '}${Math.max(5,pr2*0.65)}px Segoe UI`;
      dctx.textAlign='center'; dctx.textBaseline='middle';
      dctx.fillText(objLabel(p.key), nx, ny+0.5);
      dctx.restore();
    });
  }
  drawEnzymeAssemblies(dctx, objs, cx, cy, r, objectSizeScale, true);
}

function resizeDetailCanvas() {
  const detail = document.getElementById('detailCol');
  if (!detail.classList.contains('open')) return;
  const dc = document.getElementById('detailCanvas');
  const rect = dc.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dc.width = Math.floor(rect.width);
  dc.height = Math.floor(rect.height);
}

}
