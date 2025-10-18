const stoneSpecs = [] as { x: number; y: number; size: number }[];
const stoneSpecCount = 120;
for (let i = 0; i < stoneSpecCount; i++) {
  stoneSpecs.push({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 0.075 + 0.025,
  });
}

const outputFile = Bun.file("src/generator/grass-specs.json");
outputFile.write(JSON.stringify(stoneSpecs, null));
