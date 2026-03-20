function NavLink({ to, label }) {
  return <a href={to}>{label}</a>;
}

export function Header() {
  return (
    <nav>
      <NavLink to="/" label="Home" />
    </nav>
  );
}
