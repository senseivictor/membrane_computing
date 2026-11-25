/** A membrane in the simulation tree, containing object tokens and child membranes. */
export class Membrane {
  children: Membrane[] = [];
  objects: Record<string, number> = {};
  dna: any[] = [];
  slotIdx = 0;
  slotCount = 1;
  alive = true;

  constructor(
    public id: string,
    public label: string,
    public parent: Membrane | null = null,
    objects: Record<string, number> = {},
    extras: Partial<Pick<Membrane, 'dna' | 'slotIdx' | 'slotCount'>> = {}
  ) {
    this.objects = objects;
    Object.assign(this, extras);
  }

  addObject(name: string, count = 1) {
    this.objects[name] = (this.objects[name] || 0) + count;
    return this.objects[name];
  }

  removeObject(name: string, count = 1) {
    const remaining = Math.max(0, (this.objects[name] || 0) - count);
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
