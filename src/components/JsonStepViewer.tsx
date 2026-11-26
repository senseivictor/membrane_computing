import { useEffect, useState } from 'react';
import { createKnapsackExample } from '../problems/knapsackStructure';
import { runSimulationFromConfig } from '../simulation/runSimulation';

const example = createKnapsackExample();
const simulation = runSimulationFromConfig(
  example.items.map(item => item.tokens),
  example.items.map(item => item.name)
);
const DEFAULT_VISIBLE_CELL_PROPERTIES = ['R_div_start'];
const DEFAULT_VISIBLE_ENZYME_PROPERTIES: string[] | 'all' = 'all';

export default function JsonStepViewer() {
  const [selection, setSelection] = useState<any>(null);

  return (
    <main className="json-page">
      <section className="division-tree-section">
        <h1 className="json-step-title">Divizarea</h1>
        <DivisionTree onSelect={setSelection} />
      </section>
      {selection && <CellModal selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />}
    </main>
  );
}

function DivisionTree({ onSelect }: { onSelect: (selection: any) => void }) {
  const initialCell = simulation.steps[0]?.tree.children[0];
  if (!initialCell) return null;
  const divisions = new Map<string, any>();
  simulation.steps.flatMap(step => step.events)
    .filter((event: any) => event.event === 'membrane_divided')
    .forEach((event: any) => divisions.set(event.parent_id, event));

  const renderCell = (id: string): any => {
    const division = divisions.get(id);
    const children = division ? [division.object_cell_in, division.object_cell_out] : [];
    const latest = simulation.steps.reduce((result, step, index) => {
      const cellIndex = step.tree.children.findIndex((cell: any) => cell.id === id);
      return cellIndex >= 0 ? { stepIndex: index, cellNumber: cellIndex + 1 } : result;
    }, { stepIndex: 0, cellNumber: 1 });
    return (
      <li key={id}>
        <button className="division-tree-cell" onClick={() => onSelect({
          cellId: id, ...latest, directCell: true
        })}>C_{latest.cellNumber}</button>
        {children.length > 0 && <ul>{children.map(renderCell)}</ul>}
      </li>
    );
  };

  return <div className="division-tree"><ul>{renderCell(initialCell.id)}</ul></div>;
}

function CellModal({ selection, onSelect, onClose }: any) {
  const [cellStep, setCellStep] = useState(0);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => setCellStep(0), [selection.cellId]);

  const phases = getCellPhases(selection.cellId);
  const phase = phases[cellStep];

  return (
    <div className="cell-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="cell-modal" role="dialog" aria-modal="true" aria-labelledby="cellModalTitle">
        <header className="cell-modal-header">
          <div>
            <h2 id="cellModalTitle">C_{selection.cellNumber}</h2>
            <span>Pasul {cellStep} din 5</span>
          </div>
          <button className="cell-modal-close" onClick={onClose} aria-label="Inchide">x</button>
        </header>
        <div className="cell-modal-content">
          <div className="modal-cell-step-text">
            {phase.lines.map((line: string, index: number) => <div key={`${index}-${line}`}>{line}</div>)}
          </div>
          {phase.cell && <CellContents cell={phase.cell} className="modal-root-content"
            isDivisionBindingStep={cellStep === 1} counterUpdate={phase.counterUpdate} />}
          {phase.daughters.length > 0 && (
            <div className="modal-division-links">
              <span>Divizare</span>
              <div className="modal-division-options">
                {phase.daughters.map((daughter: any) => (
                  <button className="modal-division-link" key={daughter.id}
                    onClick={() => onSelect(daughter.selection)}>
                    C_{daughter.selection.cellNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer className="cell-modal-navigation">
          <button onClick={() => setCellStep(value => Math.max(0, value - 1))} disabled={cellStep === 0} aria-label="Pasul anterior">&larr;</button>
          <button onClick={() => setCellStep(value => Math.min(5, value + 1))} disabled={cellStep === 5} aria-label="Pasul urmator">&rarr;</button>
        </footer>
      </section>
    </div>
  );
}

function getCellPhases(cellId: string) {
  const steps = simulation.steps;
  const appearances = steps.map(step => findCell(step.tree, cellId));
  const firstAppearance = appearances.findIndex(Boolean);
  const initial = firstAppearance >= 0 ? appearances[firstAppearance] : null;
  const bindingIndex = steps.findIndex(step => step.title.startsWith('Division Token Binding') &&
    step.events.some((event: any) => event.membrane_id === cellId));
  const counterIndex = steps.findIndex(step => step.title.startsWith('Counter Enzyme Binding') &&
    step.events.some((event: any) => event.membrane_id === cellId));
  const divisionIndex = steps.findIndex(step => step.title.startsWith('Division Round') &&
    step.events.some((event: any) => event.parent_id === cellId));
  const bindingEvent = bindingIndex >= 0
    ? steps[bindingIndex].events.find((event: any) => event.membrane_id === cellId) : null;
  const divisionEvent = divisionIndex >= 0
    ? steps[divisionIndex].events.find((event: any) => event.parent_id === cellId) : null;
  const evaluationEvent = steps.flatMap(step => step.events).find((event: any) =>
    event.event === 'T_eval' && event.message?.includes(cellId));
  const evaluationIndex = evaluationEvent
    ? steps.findIndex(step => step.events.includes(evaluationEvent)) : -1;
  const lastAppearance = appearances.reduce((latest, cell, index) => cell ? index : latest, firstAppearance);
  const outcomeIndex = evaluationIndex >= 0
    ? evaluationIndex
    : divisionIndex >= 0 ? Math.max(0, divisionIndex - 1) : lastAppearance;
  const stateAt = (index: number) => index >= 0 ? appearances[index] : initial;
  const bindingState = stateAt(bindingIndex);
  const cloneState = (cell: any): any => cell && ({
    ...cell,
    objects: Object.fromEntries(Object.entries(cell.objects).map(([name, value]: [string, any]) => [
      name, value && typeof value === 'object' ? { ...value } : value
    ])),
    children: (cell.children || []).map(cloneState)
  });
  const bindingPresentation = (hideReceptors: boolean, showCount: boolean) => {
    const cell = cloneState(bindingState);
    if (!cell) return cell;
    if (!showCount) delete cell.objects.T_div_count;
    (cell.children || []).forEach((objectCell: any) => {
      if (objectCell.objects.T_div_start && objectCell.objects.R_div_start) {
        objectCell.objects.R_div_start = { ...objectCell.objects.R_div_start, hidden: hideReceptors };
      }
    });
    return cell;
  };
  const daughters = divisionEvent
    ? [divisionEvent.object_cell_in, divisionEvent.object_cell_out].map(id => {
      const location = steps.reduce((result, step, index) => {
        const cellIndex = step.tree.children.findIndex((cell: any) => cell.id === id);
        return cellIndex >= 0 ? { stepIndex: index, cellNumber: cellIndex + 1 } : result;
      }, { stepIndex: 0, cellNumber: 1 });
      return { id, selection: { cellId: id, ...location, directCell: true } };
    })
    : [];

  return [
    { lines: ['0. Starea initiala'], cell: initial, counterUpdate: null, daughters: [] },
    {
      lines: ['1 Tokenul div start se ataseaza de receptorul unui obiect'],
      cell: bindingPresentation(false, false), counterUpdate: null, daughters: []
    },
    {
      lines: ['2 Obiectul respectiv isi ascunde receptorii ca sa nu mai poata fi ales'],
      cell: bindingPresentation(true, false), counterUpdate: null, daughters: []
    },
    {
      lines: ['3 Se creeaza un token nou div count'],
      cell: bindingPresentation(true, true), counterUpdate: bindingEvent, daughters: []
    },
    {
      lines: ['4. Tokenii div count se ataseaza de receptorii enzimei'],
      cell: stateAt(counterIndex), counterUpdate: null, daughters: []
    },
    {
      lines: [
        '5.1 Daca enzima e plina, se creeaza tokenul Eval',
        '5.2 Daca enzima nu e plina, se divide celula'
      ],
      cell: stateAt(outcomeIndex),
      counterUpdate: null,
      daughters
    }
  ];
}

function getModalState(selection: any) {
  const step = simulation.steps[selection.stepIndex];
  let cell = findCell(step.tree, selection.cellId);
  let divisionEvent = null;

  if (step.title.startsWith('Division Round') && !selection.directCell) {
    divisionEvent = step.events.find((event: any) => event.parent_id === selection.cellId) || null;
    if (divisionEvent) {
      const previousStep = simulation.steps[selection.stepIndex - 1];
      cell = findCell(previousStep.tree, selection.cellId);
    }
  }

  const topLevelIndex = step.tree.children.findIndex((candidate: any) => candidate.id === selection.cellId);
  return {
    step,
    cell,
    divisionEvent,
    cellNumber: topLevelIndex >= 0 ? topLevelIndex + 1 : selection.cellNumber
  };
}

function moveSelection(selection: any, direction: -1 | 1) {
  const currentStep = simulation.steps[selection.stepIndex];
  if (direction > 0 && currentStep.title.startsWith('Division Round') && !selection.directCell &&
    currentStep.events.some((event: any) => event.parent_id === selection.cellId)) {
    return selection;
  }
  const stepIndex = selection.stepIndex + direction;
  const targetStep = simulation.steps[stepIndex];
  let cellId = selection.cellId;
  let directCell = true;

  if (direction > 0 && currentStep.title.startsWith('Division Round') && !selection.directCell) {
    const division = currentStep.events.find((event: any) => event.parent_id === cellId);
    if (division) cellId = division.object_cell_in;
  } else if (direction < 0 && currentStep.title.startsWith('Division Round')) {
    const division = currentStep.events.find((event: any) =>
      event.object_cell_in === cellId || event.object_cell_out === cellId
    );
    if (division) {
      cellId = division.parent_id;
      directCell = false;
    }
  } else if (targetStep.title.startsWith('Division Round')) {
    const division = targetStep.events.find((event: any) =>
      event.parent_id === cellId || event.object_cell_in === cellId || event.object_cell_out === cellId
    );
    if (division) {
      if (division.object_cell_in === cellId || division.object_cell_out === cellId) {
        cellId = division.parent_id;
      }
      directCell = false;
    }
  }

  const cellNumber = targetStep.tree.children.findIndex((candidate: any) => candidate.id === cellId) + 1;
  return { cellId, stepIndex, cellNumber: cellNumber || selection.cellNumber, directCell };
}

function findCell(tree: any, id: string): any {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children || []) {
    const match = findCell(child, id);
    if (match) return match;
  }
  return null;
}

function CellDetails({ cell, cellNumber, isDivisionBindingStep }: any) {
  const [showAllProperties, setShowAllProperties] = useState(false);
  const isObjectCell = cell.label.startsWith('object:');
  const objectTitle = isObjectCell ? parseObjectCell(cell.label).title : null;
  const hasExtraProperties = isObjectCell && Object.keys(cell.objects)
    .some(name => !DEFAULT_VISIBLE_CELL_PROPERTIES.includes(name));

  return (
    <div className={`modal-cell ${isObjectCell ? 'modal-object-cell' : ''}`}>
      {hasExtraProperties ? (
        <button className="modal-cell-title modal-cell-title-button"
          onClick={() => setShowAllProperties(value => !value)} aria-expanded={showAllProperties}>
          <strong>{`C_${objectTitle}`}</strong>
        </button>
      ) : (
        <div className="modal-cell-title"><strong>{isObjectCell ? `C_${objectTitle}` : `C_${cellNumber}`}</strong></div>
      )}
      <CellContents cell={cell} objectCell={isObjectCell} showAllProperties={showAllProperties} isDivisionBindingStep={isDivisionBindingStep} />
    </div>
  );
}

function CellContents({ cell, className = '', objectCell = false, showAllProperties = false, isDivisionBindingStep = false, counterUpdate = null }: any) {
  const useColumns = className.includes('modal-root-content');
  return (
    <div className={`modal-cell-content ${className}${useColumns ? ' modal-cell-columns' : ''}`}>
      <div className="modal-object-column">
        {cell.children.map((child: any, index: number) => (
          <CellDetails
            cell={child}
            cellNumber={parseObjectCell(child.label).number}
            isDivisionBindingStep={isDivisionBindingStep}
            key={`${child.label}-${index}`}
          />
        ))}
        {(cell.dna || []).filter((gene: any) => gene.choice === false).map((gene: any) => (
          <div className="modal-absent-object" key={gene.item}>C_no_{gene.name}</div>
        ))}
      </div>
      <div className="modal-token-column">
        <TokenList objects={cell.objects} objectCell={objectCell} showAllProperties={showAllProperties} isDivisionBindingStep={isDivisionBindingStep} counterUpdate={counterUpdate} />
      </div>
    </div>
  );
}

function TokenList({ objects, objectCell = false, showAllProperties = false, isDivisionBindingStep = false, counterUpdate = null }: {
  objects: Record<string, any>;
  objectCell?: boolean;
  showAllProperties?: boolean;
  isDivisionBindingStep?: boolean;
  counterUpdate?: any;
}) {
  if (objectCell) return <ObjectProperties objects={objects} showAllProperties={showAllProperties} isDivisionBindingStep={isDivisionBindingStep} />;

  return (
    <div className="modal-token-list">
      {Object.entries(objects).map(([name, value]) => (
        <TokenEntry name={name} value={value} counterUpdate={counterUpdate} key={name} />
      ))}
    </div>
  );
}

function ObjectProperties({ objects, showAllProperties, isDivisionBindingStep }: {
  objects: Record<string, any>;
  showAllProperties: boolean;
  isDivisionBindingStep: boolean;
}) {
  const entries = Object.entries(objects);
  const defaultEntries = entries.filter(([name]) => DEFAULT_VISIBLE_CELL_PROPERTIES.includes(name));
  const remainingEntries = entries.filter(([name]) => !DEFAULT_VISIBLE_CELL_PROPERTIES.includes(name));
  const visibleRows: Array<{ key: string; label: string; isToken?: boolean; nested?: boolean; binding?: boolean }> = defaultEntries.flatMap(([name, value]) => {
    if (name === 'R_div_start') {
      const receptorProperties = value.hidden && !value.bound
        ? [['hidden', value.hidden]]
        : [['bound', value.bound], ['hidden', value.hidden]];
      return [
        { key: name, label: name, isToken: true },
        ...receptorProperties.map(([property, propertyValue]) => ({
          key: `${name}.${property}`,
          label: `${property}: ${propertyValue}`,
          nested: true,
          binding: isDivisionBindingStep && property === 'bound' && propertyValue === true
        }))
      ];
    }
    return [{ key: name, label: `${name}: ${JSON.stringify(value)}` }];
  });
  return (
    <div className="modal-object-properties modal-indented-properties">
      {visibleRows.map(row => {
        const rowClass = `modal-property${row.nested ? ' modal-property-nested' : ''}`;
        const content = row.isToken ? <strong>{row.label}</strong>
          : row.binding ? <><span>{row.label}</span><span className="modal-binding-note">&lt;-- T_div_start</span></>
          : row.label;
        return <div className={rowClass} key={row.key}>{content}</div>;
      })}
      {showAllProperties && (
        <div className="modal-extra-properties">
          {remainingEntries.map(([name, value]) => (
            <div className="modal-property" key={name}>{name}: {JSON.stringify(value)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
function TokenEntry({ name, value, counterUpdate = null }: { name: string; value: any; counterUpdate?: any }) {
  if (name === 'T_div_count') {
    if (Number(value) === 0) return null;
    const previous = counterUpdate?.counter_previous_bounds || 0;
    return (
      <div className="modal-token-box modal-counter-token">
        {previous > 0 ? (
          <><span>{previous} x T_div_count</span><span className="modal-new-counter">+ T_div_count</span></>
        ) : (
          counterUpdate
            ? <span className="modal-new-counter">+ T_div_count</span>
            : <span>{value} x T_div_count</span>
        )}
      </div>
    );
  }

  if (name === 'E_div_count') {
    const enzymeProperties = Object.entries(value);
    const visibleProperties = DEFAULT_VISIBLE_ENZYME_PROPERTIES === 'all'
      ? enzymeProperties
      : enzymeProperties.filter(([property]) => DEFAULT_VISIBLE_ENZYME_PROPERTIES.includes(property));
    return (
      <div className="modal-token-box">
        <strong>E_div_count</strong>
        <div className="modal-extra-properties modal-indented-properties">
          {visibleProperties.map(([property, propertyValue]) => (
            <div className="modal-property" key={property}>
              {property === 'bounds' ? (
                <>bounds: {propertyValue}</>
              ) : (
                <>{property}: {JSON.stringify(propertyValue)}</>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  const tokenName = name.startsWith('E_') || name.startsWith('T_')
    ? <strong>{name}</strong>
    : name;
  if (value === 1 || value === true) return <div className="modal-token-box">{tokenName}</div>;
  if (value === 0 || value === false) return null;
  return <div className="modal-token-box"><div>{tokenName}</div><div className="modal-property">{JSON.stringify(value)}</div></div>;
}

function parseObjectCell(label: string) {
  const [, , ...name] = label.split(':');
  return { title: name.join(':') };
}
