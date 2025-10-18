const stoneSpecs = [] as { x: number; y: number; size: number }[];
const stoneSpecCount = 8;
for (let i = 0; i < stoneSpecCount; i++) {
  stoneSpecs.push({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 0.15 + 0.05,
  });
}

const outputFile = Bun.file("src/generator/stone-specs.json");
outputFile.write(JSON.stringify(stoneSpecs, null));
