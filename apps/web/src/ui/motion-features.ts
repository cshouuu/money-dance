import { domMax } from 'motion/react'

// Drag gestures are only needed after the shell has rendered, so keep the
// complete Motion feature set out of the first-load bundle.
export default domMax
