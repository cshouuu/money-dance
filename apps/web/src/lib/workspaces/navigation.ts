import { NAVIGATION_ITEMS } from '../navigation'
import { templateAtDate } from './templates'
import { templateFeatures, type WorkSpace } from './model'

/** Public navigation is the union of jobs. Historical records remain reachable. */
export function workspaceNavigation(spaces: readonly WorkSpace[], date: string) {
  const overtime = spaces.some(space => space.overtime.length || space.ledger.some(entry => entry.kind === 'overtime')
    || (!space.archivedOn && templateFeatures(templateAtDate(space.profile, space.template, date)).overtime))
  return NAVIGATION_ITEMS.filter(([path]) => path !== '/overtime' || overtime)
}
