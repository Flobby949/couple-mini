import { useTheme } from '../app/theme'
import { getArtwork } from './artwork'

export function useArtwork() { return getArtwork(useTheme().appearance.accent) }
