const project = globalThis.project;
const title = !project.external ? `lab-${project.slug}-title` : undefined;
console.log(title);
