import { createKnapsackExample } from '../problems/knapsackStructure';
import { runSimulationFromConfig } from '../simulation/runSimulation';

const example = createKnapsackExample();
const properties = Object.keys(example.items[0].tokens);
const simulation = runSimulationFromConfig(
  example.items.map(item => item.tokens),
  example.constraints,
  example.items.map(item => item.name),
  properties
);

export default function JsonStepViewer() {
  return (
    <main className="json-page">
      <div className="json-steps">
        {simulation.steps.map((step, index) => (
          <pre className="json-step" key={index}>
            {JSON.stringify(
              step.tree.children.map(cell => childrenOnly(cell, step.title.startsWith('Division'))),
              null,
              2
            )}
          </pre>
        ))}
      </div>
    </main>
  );
}

/** Keeps cell contents and nested cells; drops simulation and display metadata. */
function childrenOnly(cell: any, hideObjectTokens: boolean): any {
  const isObjectCell = cell.label.startsWith('object:');
  if (isObjectCell && hideObjectTokens) return cell.label.slice('object:'.length);

  const result = {
    objects: cell.objects,
    children: cell.children.map(child => childrenOnly(child, hideObjectTokens))
  };
  return isObjectCell ? { title: cell.label.slice('object:'.length), ...result } : result;
}
