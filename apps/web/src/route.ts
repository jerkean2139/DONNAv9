// In-app navigation. A tiny explicit route type instead of a router library:
// the hierarchy is a stack of drill-downs (client → project → task).
export type Route =
  | { view: 'today' }
  | { view: 'clients' }
  | { view: 'client'; id: string }
  | { view: 'projects' }
  | { view: 'project'; id: string }
  | { view: 'tasks' }
  | { view: 'task'; id: string }
  | { view: 'more' }
  | { view: 'section'; key: string };

export function routeFor(sectionKey: string): Route {
  switch (sectionKey) {
    case 'today':
    case 'clients':
    case 'projects':
    case 'tasks':
    case 'more':
      return { view: sectionKey };
    default:
      return { view: 'section', key: sectionKey };
  }
}

export type Navigate = (route: Route) => void;
