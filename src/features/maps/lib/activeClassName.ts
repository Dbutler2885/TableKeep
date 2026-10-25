// The control's class list, with `active` appended while it is on.
export function activeClassName(base: string, active: boolean) {
  return active ? `${base} active` : base
}

