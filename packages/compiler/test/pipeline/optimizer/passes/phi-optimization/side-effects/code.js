const project = globalThis.project;
let title;
if (!project.external) {
  title = `lab-${project.slug}-title`;
} else {
  title = undefined;
}
console.log(title);
