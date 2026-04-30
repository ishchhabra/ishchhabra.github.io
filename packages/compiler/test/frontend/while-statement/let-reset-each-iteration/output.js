const $65 = ["", "writing", "ssr-theming"];
const $66 = [];
let $33;
let $56 = 1;
let $57;
while ($56 < $65.length) {
  let $23;
  if ($23 == null) {
    const $67 = $65[$56].toLowerCase();
    $33 = $67;
    $57 = $67;
  } else {
    $33 = $23;
    $57 = $23;
  }
  $66.push($33);
  $56++;
  continue;
}
$66.join("/") === ["writing", "ssr-theming"].join("/");
