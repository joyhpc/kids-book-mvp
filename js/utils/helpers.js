export function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function getPointer(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

export function checkCollision(elA, elB, tolerance = 0) {
  const a = elA.getBoundingClientRect();
  const b = elB.getBoundingClientRect();
  
  return !(
    a.right  < b.left - tolerance ||
    a.left   > b.right + tolerance ||
    a.bottom < b.top - tolerance ||
    a.top    > b.bottom + tolerance
  );
}
