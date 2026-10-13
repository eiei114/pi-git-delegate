function pathVariants(path) {
  const variants = new Set();
  const slashForms = new Set([path, path.replaceAll("\\", "/")]);
  for (const slashForm of slashForms) {
    let variant = slashForm;
    for (let depth = 0; depth < 3; depth++) {
      variants.add(variant);
      variant = JSON.stringify(variant).slice(1, -1);
    }
  }
  return [...variants];
}

export function scrubLocalPaths(text, paths) {
  const replacements = paths.flatMap(({ path, replacement }) =>
    pathVariants(path).map((variant) => ({ variant, replacement })))
    .sort((left, right) => right.variant.length - left.variant.length);

  let result = text;
  for (const { variant, replacement } of replacements) {
    result = result.replaceAll(variant, replacement);
  }
  return result;
}
