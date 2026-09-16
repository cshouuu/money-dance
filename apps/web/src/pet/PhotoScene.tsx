import { useId } from 'react'
import type { PetMotion } from './motion'

/** A photo remains a photo. Scene objects act around it without inventing limbs. */
export function PhotoScene({ motion }: { motion: PetMotion }) {
  const id = useId()
  return <svg className={`photo-scene scene-${motion}`} viewBox="0 0 240 240" fill="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-sage`} x2="1" y2="1"><stop stopColor="#d5e2bf"/><stop offset="1" stopColor="#91aa83"/></linearGradient><linearGradient id={`${id}-cream`} x2="0" y2="1"><stop stopColor="#fff4db"/><stop offset="1" stopColor="#dfc798"/></linearGradient></defs>
    {motion === 'working' && <g className="scene-laptop"><path d="M73 175h95l-9 46H63z" fill={`url(#${id}-sage)`} stroke="#688264" strokeWidth="2"/><path d="M63 221h102l11 7H54z" fill="#abc39a" stroke="#688264" strokeWidth="2"/><path d="m102 191 9 9 18-21" stroke="#f7f8df" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><path className="scene-keystroke key-left" d="M49 204h12m-10-11 10 5" stroke="#b9c7a0" strokeWidth="3" strokeLinecap="round"/><path className="scene-keystroke key-right" d="M174 199h11m-11-6 8-4" stroke="#b9c7a0" strokeWidth="3" strokeLinecap="round"/></g>}
    {motion === 'slacking' && <g className="scene-fish"><ellipse cx="117" cy="218" rx="51" ry="12" fill="#e8dfc6"/><path d="M88 196c11-19 41-16 46-4l18-13v29l-18-10c-8 15-35 17-46-2Z" fill="#99bac5" stroke="#638b9b" strokeWidth="2"/><circle cx="99" cy="193" r="3" fill="#405d65"/><path d="m119 186-8 9 9 7" stroke="#d6e3df" strokeWidth="3" strokeLinecap="round"/></g>}
    {(motion === 'overtime' || motion === 'love') && <g className="scene-mug"><path d="M150 182h10c22 0 22 26 0 26h-10" stroke="#c4ab83" strokeWidth="7"/><path d="M94 177h62v33q0 18-31 18t-31-18z" fill={`url(#${id}-cream)`} stroke="#bba781" strokeWidth="2"/><ellipse cx="125" cy="177" rx="31" ry="7" fill="#b7a789" stroke="#bba781" strokeWidth="2"/><path d="M126 209c-24-15-9-28 0-17 10-11 24 2 0 17" fill="#92a87e"/><g stroke="#c3b99e" strokeWidth="3" strokeLinecap="round"><path className="scene-steam steam-one" d="M112 164q-8-7 0-14t0-14"/><path className="scene-steam steam-two" d="M133 163q8-7 0-14t0-14"/></g></g>}
    {motion === 'rest' && <g className="scene-blanket"><path d="M24 211q25-41 94-23 75-22 100 23l-6 19H31z" fill={`url(#${id}-sage)`} stroke="#9bae83" strokeWidth="2"/><path d="m58 209 10 10m28-20 10 12m26-13 10 11m28-4 10 10" stroke="#f4f1db" strokeWidth="4" strokeLinecap="round"/><path d="M170 51a17 17 0 1 0 22 22 18 18 0 0 1-22-22" fill="#e7cf8e"/></g>}
    {motion === 'celebrate' && <g className="scene-coins">{[0, 1, 2, 3, 4].map(value => <g key={value} className={`scene-coin coin-${value}`}><circle cx={40 + value * 40} cy={48 + value % 2 * 22} r="12" fill="#eec86e" stroke="#c39842" strokeWidth="2"/><path d={`M${37 + value * 40} ${43 + value % 2 * 22}h6v10h-6z`} fill="#f9e6a1"/></g>)}</g>}
  </svg>
}
