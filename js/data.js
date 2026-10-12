// Game content: car parts, tracks, and what unlocks after how many races.
// `at` is the number of finished races needed. Everything is unlocked by race 14,
// so there is no endless grind.

const BODIES = [
  { id: 'racer', name: 'Racer', at: 0 },
  { id: 'rally', name: 'Rally', at: 0 },
  { id: 'truck', name: 'Monster', at: 3 },
  { id: 'formula', name: 'Formula', at: 12 },
];

const COLORS = [
  { id: 'red', hex: '#e5383b', at: 0 },
  { id: 'blue', hex: '#1f6feb', at: 0 },
  { id: 'yellow', hex: '#ffc93c', at: 0 },
  { id: 'green', hex: '#2fbf71', at: 1 },
  { id: 'orange', hex: '#ff7a1a', at: 1 },
  { id: 'purple', hex: '#8b5cf6', at: 1 },
  { id: 'pink', hex: '#ff5fa2', at: 1 },
  { id: 'black', hex: '#262a33', at: 1 },
  { id: 'white', hex: '#f2f2ec', at: 1 },
];

const STICKERS = [
  { id: 'bolt', at: 0 },
  { id: 'star', at: 0 },
  { id: 'flame', at: 1 },
  { id: 'heart', at: 1 },
];

// curves: [amplitude, bends per lap, phase]. tol: how forgiving the curves are.
const TRACKS = [
  {
    id: 'sunny', name: 'Sunny Speedway', at: 0, icon: '🌳', decor: 'tree',
    ground: '#5dbb46', ground2: '#54ad3e', road: '#4a4f57', edge: '#e5383b',
    curves: [[140, 1, 0], [70, 3, 1.2]], tol: 1.4,
  },
  {
    id: 'desert', name: 'Desert Dunes', at: 6, icon: '🌵', decor: 'cactus',
    ground: '#ebc47c', ground2: '#e2b86b', road: '#5e5652', edge: '#ff7a1a',
    curves: [[150, 2, 0], [18, 5, 0.7]], tol: 1.4,
  },
  {
    id: 'night', name: 'Night City', at: 10, icon: '🌃', decor: 'building', night: true,
    ground: '#252d40', ground2: '#2b3449', road: '#3b404c', edge: '#8b5cf6',
    curves: [[120, 1, 0.5], [45, 4, 0]], tol: 1.5,
  },
  {
    id: 'snow', name: 'Snowy Mountain', at: 14, icon: '❄️', decor: 'pine', slippery: true,
    ground: '#eef4fb', ground2: '#e1eaf5', road: '#5b6470', edge: '#1f6feb',
    curves: [[110, 2, 1], [45, 4, 2.2]], tol: 1.5,
  },
];

// Gameplay features that switch on as he plays.
const FEATURE_AT = { turboPads: 2, tires: 4, steer: 5, turboBtn: 8 };

// One card per unlock, shown after the race that reaches it.
const UNLOCKS = [
  { at: 1, icon: '🎨', title: 'NEW PAINT!', text: 'More colors and stickers in the garage.', say: 'New paint colors and stickers!' },
  { at: 2, icon: '⚡', title: 'TURBO PADS!', text: 'Drive over the lightning to zoom!', say: 'Turbo pads! Drive over the lightning to zoom!' },
  { at: 3, icon: '🛻', title: 'MONSTER TRUCK!', text: 'Big wheels! Find it in the garage.', say: 'You got a monster truck!' },
  { at: 4, icon: '🔧', title: 'TIRE CHANGE!', text: 'Change the tires at the pit stop.', say: 'Now you can change tires at the pit stop!' },
  { at: 5, icon: '↔️', title: 'STEERING!', text: 'Tap the arrows to change lanes. Dodge the cones!', say: 'Steering! Tap the arrows to change lanes, and dodge the cones!' },
  { at: 6, icon: '🌵', title: 'DESERT DUNES!', text: 'A new race track!', say: 'A new track! Desert Dunes!' },
  { at: 8, icon: '🌟', title: 'TURBO BUTTON!', text: 'Grab stars to fill it. Then tap the lightning!', say: 'Turbo button! Grab stars to fill it up, then tap the lightning!' },
  { at: 10, icon: '🌃', title: 'NIGHT CITY!', text: 'Race at night with your headlights on.', say: 'Night City! Turn on your headlights!' },
  { at: 12, icon: '🏎️', title: 'FORMULA RACER!', text: 'The fastest-looking car in the garage.', say: 'You got the formula racer!' },
  { at: 14, icon: '❄️', title: 'SNOWY MOUNTAIN!', text: 'The last track. It is slippery!', say: 'Snowy Mountain! Careful, it is slippery!' },
];

const PLACE_WORD = ['', '1st', '2nd', '3rd', '4th'];
