function $0($2) {
  const { name: $3 } = $2;
  return <span>{$3}</span>;
}
function $1() {
  return (
    <div>
      {$0({
        name: "hello",
      })}
    </div>
  );
}
export { $1 as App };
