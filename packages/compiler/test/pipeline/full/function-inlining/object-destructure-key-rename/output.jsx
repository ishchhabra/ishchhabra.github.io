function $0_0($2_0) {
  const { name } = $2_0;
  return <span>{name}</span>;
}
export function App() {
  const { name } = {
    name: "hello",
  };
  return (
    <div>
      <span>{name}</span>
    </div>
  );
}
