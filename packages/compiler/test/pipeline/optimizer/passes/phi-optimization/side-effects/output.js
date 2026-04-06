const project = globalThis.project;
let title = undefined;
console.log(!project.external ? `lab-${project.slug}-title` : undefined);
