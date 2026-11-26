/** A membrane in the simulation tree, containing object tokens and child membranes. */
export class Membrane {
  children: Membrane[] = [];
  objects: Record<string, any> = {};
  dna: any[] = [];
  slotIdx = 0;
  slotCount = 1;
  alive = true;

  constructor(
    public id: string,
    public label: string,
    public parent: Membrane | null = null,
    objects: Record<string, any> = {},
    extras: Partial<Pick<Membrane, 'dna' | 'slotIdx' | 'slotCount'>> = {}
  ) {
    this.objects = objects;
    Object.assign(this, extras);
  }

  addObject(name: string, count = 1) {
    const current = this.objects[name];
    this.objects[name] = typeof current === 'number' ? current + count : count;
    return this.objects[name];
  }

  removeObject(name: string, count = 1) {
    if (typeof this.objects[name] !== 'number') return 0;
    const remaining = Math.max(0, this.objects[name] - count);
    if (!remaining) delete this.objects[name];
    else this.objects[name] = remaining;
    return remaining;
  }

  addChild(child: Membrane) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
}
