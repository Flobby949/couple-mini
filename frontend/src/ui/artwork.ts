import type { Accent } from '../core/appearance'

// Keep large illustrations as packaged files instead of serializing base64 through setData.
export const avatarWoman = '/assets/avatar-woman.png'
export const avatarMan = '/assets/avatar-man.png'
export const avatarFrame = '/assets/avatar-stitch-frame.png'
export const pointsJar = '/assets/points-jar.png'
export const checkinPanel = '/assets/checkin-fabric-panel.png'
// Rosettes are copied under each consuming subpackage; detail pages prefix their package root.
export const milestoneRosette = '/assets/milestone-rosette.png'
export const emptyTasks = '/assets/empty-tasks.png'
export const emptyStore = '/assets/empty-store.png'
export const brandLogo = '/assets/brand/floflo-logo.png'

const original = { avatarWoman, avatarMan, avatarFrame, pointsJar, checkinPanel, milestoneRosette, emptyTasks, emptyStore }
const variants = {
  teal: {
    avatarFrame: '/assets/artwork/teal/avatar-stitch-frame.png',
    pointsJar: '/assets/artwork/teal/points-jar.png',
    checkinPanel: '/assets/artwork/teal/checkin-fabric-panel.png',
    milestoneRosette: '/assets/artwork/teal/milestone-rosette.png',
    emptyTasks: '/assets/artwork/teal/empty-tasks.png',
    emptyStore: '/assets/artwork/teal/empty-store.png',
  },
  apricot: {
    avatarFrame: '/assets/artwork/apricot/avatar-stitch-frame.png',
    pointsJar: '/assets/artwork/apricot/points-jar.png',
    checkinPanel: '/assets/artwork/apricot/checkin-fabric-panel.png',
    milestoneRosette: '/assets/artwork/apricot/milestone-rosette.png',
    emptyTasks: '/assets/artwork/apricot/empty-tasks.png',
    emptyStore: '/assets/artwork/apricot/empty-store.png',
  },
}
export function getArtwork(accent: Accent) { return { ...original, ...(accent === 'iris' ? {} : variants[accent]) } }
export const artworkFiles = [brandLogo, ...Object.values(original), ...Object.values(variants).flatMap(value => Object.values(value))]
