// Bug 3: let/const in sibling block scopes share declaration ID
// Two `const isActive` declarations in different scopes should be independent.
// Before the fix, the second declaration was silently skipped because the
// function scope already had a same-named binding registered.

function NavLink({ to, label, exact }) {
  const location = useLocation();
  const isHash = to.startsWith("/#");

  if (isHash) {
    const isActive = location.pathname === "/" && location.hash === to;
    return createElement("a", { className: isActive ? "active" : "" }, label);
  }

  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
  return createElement("a", { className: isActive ? "active" : "" }, label);
}

export { NavLink };
