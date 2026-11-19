export const universeGroups = [
  { id: 'people', label: 'People', color: '#94d7b0', center: [-130, 65, 20], topics: ['Maya', 'Noah', 'Ava', 'Leo', 'Nora', 'Oscar', 'Grandma June', 'Uncle Sam'] },
  { id: 'plans', label: 'Plans', color: '#8bbfff', center: [115, 90, -50], topics: ['Weekend together', 'Summer adventure', 'Birthday picnic', 'Sunday dinner', 'Garden project', 'School week', 'Movie night', 'Winter getaway'] },
  { id: 'ideas', label: 'Ideas', color: '#bea7ff', center: [20, -115, 85], topics: ['Learn something new', 'A reading corner', 'Our dream home', 'Kindness jar', 'Family traditions', 'Weekend recipes', 'Creative afternoons', 'Little discoveries'] },
  { id: 'memories', label: 'Memories', color: '#f0bd83', center: [-85, -55, -115], topics: ['First beach day', 'The treehouse', 'A snowy morning', 'Our best road trip', 'Grandma’s stories', 'Birthday wishes', 'The old photo album', 'A perfect sunset'] },
  { id: 'places', label: 'Places', color: '#ed9eae', center: [125, -35, 100], topics: ['Summer cabin', 'The neighbourhood', 'Grandma’s kitchen', 'Lakeside trail', 'The city library', 'Our garden', 'A favourite café', 'The seaside'] },
  { id: 'everyday', label: 'Everyday', color: '#7dd9d3', center: [-30, 120, -95], topics: ['Morning moments', 'After-school time', 'Things we love', 'Our family playlist', 'A little celebration', 'Dinner conversations', 'Bedtime stories', 'Small adventures'] },
] as const;

export type UniverseGroup = typeof universeGroups[number]['id'];
export type UniverseNode = {
  id: string; name: string; group: UniverseGroup | 'home'; description: string; val: number;
  x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number;
};

/** Local illustrations for the fictional demo, ready to replace with saved node media later. */
export function universePreviewImage(node: UniverseNode) {
  if (node.group === 'people' && node.id !== 'people') {
    const index = Number(node.id.split('-')[1]) || 0;
    return { src: `/avatars/3d/person-0${index % 6 + 1}@2x.webp`, alt: `Illustrated demo avatar for ${node.name}`, portrait: true };
  }
  if (node.group === 'memories' || node.group === 'everyday' || node.group === 'people') {
    return { src: '/landing/family-right.webp', alt: 'Demo illustration of family members spending time together', portrait: false };
  }
  return { src: '/landing/hero-900.webp', alt: 'Demo illustration of a family planning activities together', portrait: false };
}
export type UniverseLink = { source: string | UniverseNode; target: string | UniverseNode; kind: 'cluster' | 'connection' | 'bridge' };
export const endpointId = (endpoint: string | UniverseNode) => typeof endpoint === 'string' ? endpoint : endpoint.id;

/** Entirely fictional, deterministic content. The renderer may mutate its own returned positions. */
export function createDemoUniverse(): { nodes: UniverseNode[]; links: UniverseLink[] } {
  let seed = 41527;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const nodes: UniverseNode[] = [{ id: 'home', name: 'Our universe', group: 'home', val: 7, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0,
    description: 'A little universe of people, ideas and moments. Everything here is fictional demo content—choose a connection and see where it leads.' }];
  const links: UniverseLink[] = [];
  for (const group of universeGroups) {
    const [x, y, z] = group.center;
    nodes.push({ id: group.id, name: group.label, group: group.id, val: 4, x, y, z, fx: x, fy: y, fz: z,
      description: `Explore the ${group.label.toLowerCase()} constellation. These sample connections are here to demonstrate the graph.` });
    links.push({ source: 'home', target: group.id, kind: 'cluster' });
    group.topics.forEach((name, index) => {
      const id = `${group.id}-${index}`;
      const position = () => ({ x: x + (random() - .5) * 95, y: y + (random() - .5) * 95, z: z + (random() - .5) * 95 });
      nodes.push({ id, name, group: group.id, val: 1.7, ...position(),
        description: `A fictional connection in the ${group.label.toLowerCase()} constellation. Follow a nearby node to explore.` });
      links.push({ source: group.id, target: id, kind: 'connection' });
      if (index > 0) links.push({ source: `${group.id}-${index - 1}`, target: id, kind: 'connection' });
      ['Little stories', 'New possibilities'].forEach((suffix, child) => {
        const childId = `${id}-${child}`;
        nodes.push({ id: childId, name: `${name} · ${suffix}`, group: group.id, val: .65, ...position(),
          description: `A sample ${suffix.toLowerCase()} connection around ${name}.` });
        links.push({ source: id, target: childId, kind: 'connection' });
      });
    });
  }
  universeGroups.forEach((group, index) => {
    const next = universeGroups[(index + 1) % universeGroups.length];
    links.push({ source: `${group.id}-0`, target: `${next.id}-2`, kind: 'bridge' });
    links.push({ source: `${group.id}-4`, target: `${next.id}-6`, kind: 'bridge' });
  });
  return { nodes, links };
}
