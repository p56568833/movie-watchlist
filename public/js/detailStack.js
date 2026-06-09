// Navigation stack for detail pages (person ↔ movie cycle)
const stack = [];

export function push(entry) {
  stack.push(entry);
}

export function pop() {
  return stack.pop() || null;
}

export function canGoBack() {
  return stack.length > 0;
}

export function clearStack() {
  stack.length = 0;
}

export function peek() {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}
