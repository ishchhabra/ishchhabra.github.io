const project = globalThis.project;
console.log(!globalThis.project.external ? `lab-${globalThis.project.slug}-title` : undefined);
