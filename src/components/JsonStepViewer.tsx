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
      <div className="json-legend">
        <span><b>C_</b> = celula</span>
        <span><b>E_</b> = enzima</span>
        <span><b>T_</b> = token</span>
        <span><b>R_</b> = receptor</span>
        <span><b>no_</b> = obiect omis din combinatie</span>
      </div>
      <div className="json-steps">
        {simulation.steps.map(step => (
          <section className="json-step-block" key={step.step}>
            <h2 className="json-step-title">Pasul {step.step}: {step.title}</h2>
            {step.events.filter(event => event.message).map((event, index) => (
              <div className="json-step-label" key={index}>{event.message}</div>
            ))}
            <div className="json-cell-buttons">
              {step.tree.children.map((cell, index) => (
                <button
                  className="json-cell-button"
                  key={cell.id}
                  onClick={() => setSelection({ cellId: cell.id, stepIndex: step.step, cellNumber: index + 1, directCell: true })}
                >
                  C_{index + 1}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {selection && <CellModal selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />}
    </main>
  );
}

function CellModal({ selection, onSelect, onClose }: any) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const modalState = getModalState(selection);
  const { cell, cellNumber, step, divisionEvent } = modalState;
  const isDivisionBindingStep = step.title.startsWith('Division Token Binding');
  const counterUpdate = step.events.find((event: any) => event.membrane_id === selection.cellId && event.T_div_count_created === 1);
  const needsDaughterChoice = Boolean(divisionEvent && !selection.directCell);

  return (
    <div className="cell-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="cell-modal" role="dialog" aria-modal="true" aria-labelledby="cellModalTitle">
        <header className="cell-modal-header">
          <div>
            <h2 id="cellModalTitle">C_{cellNumber}</h2>
            <span>Pasul {step.step}</span>
          </div>
          <button className="cell-modal-close" onClick={onClose} aria-label="Inchide">x</button>
        </header>
        <div className={`cell-modal-content${divisionEvent ? ' modal-division-only' : ''}`}>
          {divisionEvent && (
            <div className="modal-division-links">
              <span>Divizare </span>
              <div className="modal-division-options">
                {[divisionEvent.object_cell_in, divisionEvent.object_cell_out].map(id => {
                  const daughter = findCell(step.tree, id);
                  const number = step.tree.children.findIndex((candidate: any) => candidate.id === id) + 1;
                  if (!daughter) return null;
                  return (
                    <button className="modal-division-link" key={id}
                      onClick={() => onSelect({ cellId: id, stepIndex: step.step, cellNumber: number, directCell: true })}>
                      C_{number}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!divisionEvent && cell && (
            <CellContents cell={cell} className="modal-root-content" isDivisionBindingStep={isDivisionBindingStep} counterUpdate={counterUpdate} />
          )}
        </div>
        <footer className="cell-modal-navigation">
          <button onClick={() => onSelect(moveSelection(selection, -1))} disabled={step.step === 0} aria-label="Pasul anterior">&larr;</button>
          <button onClick={() => onSelect(moveSelection(selection, 1))}
            disabled={step.step >= simulation.steps.length - 1 || needsDaughterChoice}
            aria-label="Pasul urmator">&rarr;</button>
        </footer>
      </section>
    </div>
  );
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
