function getInfo(obj) {
  const { name } = obj;
  return <span>{name}</span>;
}

export function App() {
  return <div>{getInfo({ name: "hello" })}</div>;
}
